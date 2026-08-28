// ─── SALES ENGINE · Webhook de pago de 360pay ────────────────────────────────
// Aquí se confirma el dinero, y es el CAMINO PRINCIPAL, no una red de
// seguridad: con cupones no hay ninguna respuesta síncrona que diga "pagado".
// Si este handler falla, el pedido queda cobrado y sin cruzar.
//
// Se despliega con --no-verify-jwt: lo llama 360pay, no un usuario.
// La autenticidad la da la FIRMA, no un JWT.
//
// Orden de las defensas, y ninguna es opcional:
//   1. Body CRUDO primero. Se verifica antes de parsear: re-serializar el JSON
//      cambia orden y espacios, y rompe la firma de un evento legítimo.
//   2. Firma HMAC-SHA256 sobre `timestamp + "." + body`, con ventana de replay.
//   3. Dedupe por X-360Pay-Event-Id (NO Delivery-Id: cambia en cada reintento,
//      así que dedupear por él dejaría entrar el mismo pago una vez por intento).
//   4. **Re-consulta del cupón contra 360pay.** La firma dice que el mensaje es
//      auténtico; la consulta dice que el pago existe. La doc lo pide explícito:
//      "no dependas del número de intento para decidir si el pago es válido;
//      usa el estado y los IDs del payload".
//   5. El MONTO se contrasta contra el del pedido. Un cupón pagado por menos no
//      es un adelanto pagado.
//
// Responder 2xx rápido es parte del contrato: 360pay reintenta si no lo ve.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  PAY360_HEADERS, getCoupon, isPaid, pay360BaseUrl, pickPartnerKey, verifySignature, type Pay360Env,
} from '../_shared/pay360.ts'
import { dispatchConversion, hasAnyCapi, runInBackground, type AdsConfig } from '../_shared/capi.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** 200 salvo que queramos el reintento. Un 4xx por evento inválido evita que
 *  360pay reintente algo que nunca va a mejorar. */
const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'Method not allowed' }, 405)

  // 1 · el body CRUDO, antes de cualquier parseo
  const rawBody = await req.text()
  const h = req.headers
  const eventId = h.get(PAY360_HEADERS.eventId)
  const hookId = h.get(PAY360_HEADERS.hookId)

  if (!eventId) {
    console.error('[pay360-webhook] sin event id')
    return ok({ error: 'missing_event_id' }, 400)
  }

  // ─── ¿De qué tienda es este hook? ──────────────────────────────────────────
  // El secreto es POR NEGOCIO, así que primero hay que saber cuál. `Hook-Id` es
  // la vía directa; si no viene, se cae al `external_ref` del payload.
  const payload = safeJson(rawBody)
  const externalRef = pickString(payload, 'external_ref')
  const couponId = pickString(payload, '_id') ?? pickString(payload, 'coupon_id')

  let secretRow: { store_id: string; pay360_hook_secret: string | null } | null = null
  if (hookId) {
    const { data } = await supabase.from('store_secrets')
      .select('store_id, pay360_hook_secret').eq('pay360_hook_id', hookId).maybeSingle()
    secretRow = data
  }
  if (!secretRow && externalRef) {
    const { data: s } = await supabase.from('order_sessions')
      .select('origin_store_id, store_id').eq('id', externalRef).maybeSingle()
    const storeId = s?.origin_store_id ?? s?.store_id
    if (storeId) {
      const { data } = await supabase.from('store_secrets')
        .select('store_id, pay360_hook_secret').eq('store_id', storeId).maybeSingle()
      secretRow = data
    }
  }

  const secret = secretRow?.pay360_hook_secret ?? ''
  // 2 · firma. Sin secreto configurado NO se procesa: un webhook sin verificar
  // es una puerta abierta para marcar pedidos como pagados desde fuera.
  const check = await verifySignature(secret, rawBody, {
    signature: h.get(PAY360_HEADERS.signature),
    timestamp: h.get(PAY360_HEADERS.timestamp),
  })
  if (!check.ok) {
    console.error('[pay360-webhook] firma rechazada', JSON.stringify({
      reason: check.reason, hook: hookId ? 'sí' : 'no', event: eventId,
    }))
    // 401 y no 4xx genérico: si el motivo es nuestro (secreto no cargado
    // todavía), que 360pay reintente y el evento no se pierda.
    return ok({ error: 'bad_signature' }, 401)
  }

  const storeId = String(secretRow!.store_id)

  // 3 · dedupe por Event-Id, contra el índice único (store_id, dedupe_key)
  const dedupeKey = `360pay:${eventId}`
  const { error: dupErr } = await supabase.from('payment_events').insert({
    store_id: storeId, source: '360PAY', provider: '360PAY',
    dedupe_key: dedupeKey, received_at: new Date().toISOString(),
    raw: rawBody.slice(0, 20_000),
    ignored_reason: 'procesando',
  })
  if (dupErr) {
    // 23505 = ya lo procesamos. Es un reintento de 360pay, no un error: 2xx para
    // que deje de reintentar.
    if (dupErr.code === '23505') return ok({ received: true, duplicate: true })
    console.error('[pay360-webhook] insert falló', JSON.stringify({ code: dupErr.code }))
    return ok({ error: 'db' }, 500)
  }

  // ─── El pedido ─────────────────────────────────────────────────────────────
  const sessionCols = 'id, order_id, store_id, origin_store_id, buyer_name, buyer_phone, buyer_id, product_id, product_price, dispatch_type, advance_amount, payment_verification, payment_provider, pay360_coupon_id, pay360_saldo_coupon_id, saldo_amount, saldo_verification, ad_fbp, ad_fbc, ad_ttp, ad_ttclid, ad_client_ua, ad_client_ip, ad_source_url'
  const { data: session } = externalRef
    ? await supabase.from('order_sessions')
        .select(sessionCols)
        .eq('id', externalRef).maybeSingle()
    : await supabase.from('order_sessions')
        .select(sessionCols)
        // Los DOS cobros del pedido comparten `external_ref`, así que por ahí
        // no se distinguen; por cupón sí. `or` porque el saldo tiene el suyo.
        .or(`pay360_coupon_id.eq.${couponId ?? '__none__'},pay360_saldo_coupon_id.eq.${couponId ?? '__none__'}`)
        .maybeSingle()

  if (!session) return await ignore(storeId, dedupeKey, 'pedido no encontrado')
  if (session.payment_provider !== '360PAY') {
    return await ignore(storeId, dedupeKey, 'pedido de otro motor de cobro')
  }

  // ─── ¿Cuál de los DOS cobros pagó? ─────────────────────────────────────────
  //
  // Un pedido tiene hasta dos cupones —adelanto y saldo (bloque §31 del
  // esquema)— y el webhook llega igual para los dos. Lo decide el id del cupón,
  // que es lo único que los distingue: `external_ref` es el mismo pedido en
  // ambos, y el monto no sirve —la mitad de un pedido de S/180 es 90, igual que
  // su saldo—.
  //
  // Sin cupón identificable manda el estado: si el adelanto ya está cruzado, lo
  // que puede estar pagándose es el saldo.
  const esSaldo = couponId && session.pay360_saldo_coupon_id === couponId
    ? true
    : couponId && session.pay360_coupon_id === couponId
      ? false
      : session.payment_verification === 'MATCHED'

  if (esSaldo && session.saldo_verification === 'MATCHED') {
    return await ignore(storeId, dedupeKey, 'actualización de un saldo ya verificado')
  }
  if (!esSaldo && session.payment_verification === 'MATCHED') {
    // No es un duplicado ni un error: la doc avisa que si el cupón ya estaba
    // pagado y DESPUÉS se corrige el código bancario (`operation_number`,
    // `bank_tx_id`), 360pay emite otro PAYMENT_PAID con un Event-Id DISTINTO.
    // O sea, pasa el dedupe legítimamente. Se registra como actualización y no
    // se vuelve a tocar el pedido: re-confirmar lo ya confirmado solo puede
    // romperlo.
    return await ignore(storeId, dedupeKey, 'actualización de un pago ya verificado')
  }

  // 4 · la VERDAD la da 360pay, no el payload
  const id = session.pay360_coupon_id ?? couponId
  if (!id) return await ignore(storeId, dedupeKey, 'evento sin cupón identificable')

  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const { data: store } = await supabase.from('stores')
    .select('pay360_env, meta_pixel_id, tiktok_pixel_id').eq('id', originStoreId).maybeSingle()
  const env = (store?.pay360_env === 'live' ? 'live' : 'sandbox') as Pay360Env

  const coupon = await getCoupon(pay360BaseUrl(env, 'partner'),
    pickPartnerKey(env, Deno.env.get('PAY360_PARTNER_KEY') ?? '', Deno.env.get('PAY360_PARTNER_KEY_LIVE') ?? ''), id)
  if (!coupon.ok) {
    // No se pudo confirmar: se suelta el dedupe para que el reintento de 360pay
    // pueda volver a intentarlo, y se pide el reintento con un 5xx.
    await supabase.from('payment_events').delete()
      .eq('store_id', storeId).eq('dedupe_key', dedupeKey)
    return ok({ error: 'coupon_unverified' }, 503)
  }
  if (!isPaid(coupon.data)) {
    return await ignore(storeId, dedupeKey, `cupón en estado ${coupon.data.status ?? '?'}`)
  }

  // 5 · el monto. Un cupón pagado por menos NO es el cobro pagado.
  const rowAmount = esSaldo
    ? Math.max(0, Math.round(Number(session.product_price ?? 0) - Number(session.advance_amount ?? 0)))
    : Number(session.advance_amount ?? 0)
  const paid = Number(coupon.data.amount ?? 0)
  const queCobro = esSaldo ? 'saldo' : 'adelanto'
  if (!(paid >= rowAmount)) {
    await supabase.from('order_sessions').update({
      payment_reason: `Cupón 360pay pagado por S/${paid}, el ${queCobro} era S/${rowAmount} — revisar antes de confirmar`,
    }).eq('id', session.id)
    return await ignore(storeId, dedupeKey, `monto insuficiente (S/${paid} < S/${rowAmount})`)
  }

  // ─── Confirmar ─────────────────────────────────────────────────────────────
  const matchedAt = new Date().toISOString()
  await supabase.from('payment_events').update({
    provider_charge_id: String(coupon.data._id),
    provider_fee_pen: typeof coupon.data.fee_platform === 'number' ? coupon.data.fee_platform : null,
    amount_pen: paid,
    sender_name: session.buyer_name ?? null,
    matched_order_id: session.id, matched_at: matchedAt,
    ignored_reason: null,
  }).eq('store_id', storeId).eq('dedupe_key', dedupeKey)

  const { data: ev } = await supabase.from('payment_events')
    .select('id').eq('store_id', storeId).eq('dedupe_key', dedupeKey).maybeSingle()

  await supabase.from('order_sessions').update(esSaldo
    // El saldo NO mueve la etapa: cuando se cobra, el pedido ya va en camino o
    // está en la agencia. Retroceder a `confirmado` borraría lo que el courier
    // ya reportó.
    ? { saldo_verification: 'MATCHED', saldo_matched_at: matchedAt, saldo_amount: paid, saldo_event_id: ev?.id ?? null }
    : {
        payment_verification: 'MATCHED', payment_matched_at: matchedAt,
        payment_reason: null, payment_event_id: ev?.id ?? null, stage: 'confirmado',
      }).eq('id', session.id)

  // Los DOS mensajes del cruce manual, con la misma copy: ya está calibrada y el
  // comprador no tiene por qué notar QUÉ motor cobró.
  const bank = coupon.data.bank_tx_id ? ` · ${coupon.data.bank_tx_id}` : ''
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'text', visibility: 'sellers',
    body: `✅ ${esSaldo ? 'Saldo' : 'Adelanto'} de S/${paid} verificado automáticamente`
      + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
      + ` · 360pay ${coupon.data._id}${bank}`,
  })
  // El acuse al comprador con el saldo DERIVADO del pedido, no asumido:
  // "tu adelanto" a quien pagó el total suena a que aún falta plata, y callar
  // el saldo a quien pagó la mitad lo manda a preguntar cuánto debe justo el
  // día del recojo. Misma regla que el mensaje de bienvenida de register-buyer,
  // y misma mecánica: en agencia el saldo se paga POR LA APP (la clave de
  // recojo se entrega contra ese pago), nunca en el mostrador.
  const saldoRestante = esSaldo
    ? 0
    : Math.max(0, Number(session.product_price ?? 0) - paid)
  const esRecojo = session.dispatch_type === 'AGENCIA_PROVINCIA' || session.dispatch_type === 'AGENCIA_LIMA'
  const buyerAck = saldoRestante > 0
    ? (esRecojo
        ? `✅ ¡Recibimos tu adelanto de S/${paid}! Te queda un saldo de S/${saldoRestante}`
          + ' que nos pagas por esta misma app —no en la agencia— cuando te enviemos la guía'
          + ' de tu envío. Apenas lo pagues te entregamos tu clave de recojo.'
        : `✅ ¡Recibimos tu adelanto de S/${paid}! Te queda un saldo de S/${saldoRestante}`
          + ' que pagas al recibir tu pedido.')
    : `✅ ¡Recibimos tu pago completo de S/${paid}! No te queda ningún saldo pendiente.`
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility: 'all',
    body: esSaldo
      // Al pagar el saldo lo que el comprador espera es su clave, no un
      // "estamos preparando" — su pedido ya está en la agencia.
      ? `✅ ¡Recibimos tu saldo de S/${paid}! Ya no te queda nada pendiente. Te enviamos tu clave de recojo por acá.`
      : `${buyerAck} Ya estamos preparando tu pedido. Por aquí te avisamos cuando salga.`,
  })

  // ─── CAPI · Purchase server-side ───────────────────────────────────────────
  //
  // SOLO en el primer cobro. El saldo es la segunda mitad de la MISMA compra:
  // reportarlo como otro `Purchase` le contaría a Meta y a TikTok dos
  // conversiones por un pedido, y el público "de los que sí pagaron" —que es
  // para lo que existe este evento— se llenaría de duplicados.
  if (esSaldo) return ok({ received: true, matched: true, saldo: true })

  // El evento que arma el público "de los que SÍ pagaron": se dispara SOLO aquí,
  // desde el servidor, porque el pago se confirma por webhook cuando el
  // comprador ya se fue a Yape y el navegador no puede reportarlo. `value` = el
  // adelanto realmente pagado (dinero garantizado); el total va como propiedad
  // extra. event_id = session.id (determinístico). Corre en segundo plano y va
  // en try/catch: una falla de CAPI JAMÁS cambia el 2xx del webhook —el dinero
  // ya está confirmado—. Ver docs/09-PIXELS-CAPI.md.
  try {
    const cfg: AdsConfig = {
      metaPixelId: store?.meta_pixel_id ?? null,
      tiktokPixelId: store?.tiktok_pixel_id ?? null,
    }
    if (cfg.metaPixelId || cfg.tiktokPixelId) {
      const { data: adSec } = await supabase.from('store_secrets')
        .select('meta_capi_token, tiktok_capi_token, meta_test_event_code, tiktok_test_event_code')
        .eq('store_id', originStoreId).maybeSingle()
      cfg.metaToken = adSec?.meta_capi_token ?? null
      cfg.metaTestCode = adSec?.meta_test_event_code ?? null
      cfg.tiktokToken = adSec?.tiktok_capi_token ?? null
      cfg.tiktokTestCode = adSec?.tiktok_test_event_code ?? null
      if (hasAnyCapi(cfg)) {
        const orderValue = Number(session.product_price ?? 0)
        runInBackground(dispatchConversion('PURCHASE', cfg, {
          eventId: String(session.id),
          sourceUrl: session.ad_source_url ?? null,
          value: paid,
          contentId: session.product_id ? String(session.product_id) : null,
          custom: orderValue > 0 ? { order_value: orderValue } : undefined,
          user: {
            phone: session.buyer_phone ?? null,
            fullName: session.buyer_name ?? null,
            externalId: session.buyer_id ? String(session.buyer_id) : null,
            fbp: session.ad_fbp ?? null, fbc: session.ad_fbc ?? null,
            ttp: session.ad_ttp ?? null, ttclid: session.ad_ttclid ?? null,
            clientIp: session.ad_client_ip ?? null, clientUserAgent: session.ad_client_ua ?? null,
          },
        }))
      }
    }
  } catch (e) {
    console.error('[pay360-webhook] CAPI Purchase falló:', String(e))
  }

  // ─── Despachar: el adelanto verificado es lo que autoriza a generar la guía ─
  // Fire-and-forget a propósito: cobrar no puede colgarse de despachar. Si el
  // generador tarda o falla, 360pay ya recibió su 200 y el pedido sigue su
  // curso — Logística registra la guía a mano, como siempre. La función decide
  // sola si el pedido le toca (Shalom + agencia) y trae su propio candado
  // contra dobles emisiones, así que acá no se filtra nada.
  runInBackground(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/shalom-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ session_id: session.id }),
  }))

  return ok({ received: true, matched: true })
})

/** El evento era auténtico pero no aplica. Se DEJA la fila —con el motivo— para
 *  que el reintento no lo re-procese y para que quede la trazabilidad. */
async function ignore(storeId: string, dedupeKey: string, reason: string) {
  await supabase.from('payment_events')
    .update({ ignored_reason: reason })
    .eq('store_id', storeId).eq('dedupe_key', dedupeKey)
  return ok({ received: true, ignored: reason })
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}

/** Busca una clave en la raíz o dentro de `data`: 360pay puede envolver el
 *  evento, y el payload es configurable por hook (`payload_mapping`). */
function pickString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const direct = p[key]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const d = p.data
  if (d && typeof d === 'object') {
    const nested = (d as Record<string, unknown>)[key]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }
  return null
}
