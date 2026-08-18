// ─── SALES ENGINE · Webhook de pago de 360pay ────────────────────────────────
// Aquí se confirma el dinero. A diferencia de `culqi-webhook` —que es una red de
// seguridad porque el cargo ya se supo en `culqi-charge`— este es el CAMINO
// PRINCIPAL: con cupones no hay respuesta síncrona que diga "pagado".
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
  PAY360_HEADERS, getCoupon, isPaid, pay360BaseUrl, verifySignature, type Pay360Env,
} from '../_shared/pay360.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PARTNER_KEY = Deno.env.get('PAY360_PARTNER_KEY') ?? ''

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
  const { data: session } = externalRef
    ? await supabase.from('order_sessions')
        .select('id, order_id, store_id, origin_store_id, buyer_name, advance_amount, payment_verification, payment_provider, pay360_coupon_id')
        .eq('id', externalRef).maybeSingle()
    : await supabase.from('order_sessions')
        .select('id, order_id, store_id, origin_store_id, buyer_name, advance_amount, payment_verification, payment_provider, pay360_coupon_id')
        .eq('pay360_coupon_id', couponId ?? '__none__').maybeSingle()

  if (!session) return await ignore(storeId, dedupeKey, 'pedido no encontrado')
  if (session.payment_provider !== '360PAY') {
    return await ignore(storeId, dedupeKey, 'pedido de otro motor de cobro')
  }
  if (session.payment_verification === 'MATCHED') {
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

  const { data: store } = await supabase.from('stores')
    .select('pay360_env').eq('id', String(session.origin_store_id ?? session.store_id)).maybeSingle()
  const env = (store?.pay360_env === 'live' ? 'live' : 'sandbox') as Pay360Env

  const coupon = await getCoupon(pay360BaseUrl(env, 'partner'), PARTNER_KEY, id)
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

  // 5 · el monto. Un cupón pagado por menos NO es el adelanto pagado.
  const rowAmount = Number(session.advance_amount ?? 0)
  const paid = Number(coupon.data.amount ?? 0)
  if (!(paid >= rowAmount)) {
    await supabase.from('order_sessions').update({
      payment_reason: `Cupón 360pay pagado por S/${paid}, el adelanto era S/${rowAmount} — revisar antes de confirmar`,
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

  await supabase.from('order_sessions').update({
    payment_verification: 'MATCHED', payment_matched_at: matchedAt,
    payment_reason: null, payment_event_id: ev?.id ?? null, stage: 'confirmado',
  }).eq('id', session.id)

  // Los DOS mensajes del cruce manual, con la misma copy: ya está calibrada y el
  // comprador no tiene por qué notar QUÉ motor cobró.
  const bank = coupon.data.bank_tx_id ? ` · ${coupon.data.bank_tx_id}` : ''
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'text', visibility: 'sellers',
    body: `✅ Adelanto de S/${paid} verificado automáticamente`
      + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
      + ` · 360pay ${coupon.data._id}${bank}`,
  })
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility: 'all',
    body: `✅ ¡Recibimos tu adelanto de S/${paid}! Ya estamos preparando tu pedido.`
      + ' Por aquí te avisamos cuando salga.',
  })

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
