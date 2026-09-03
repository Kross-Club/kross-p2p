// ─── SALES ENGINE · Confirmación de pago de Flow ─────────────────────────────
// Aquí se confirma el dinero. Es el CAMINO PRINCIPAL, igual que `pay360-webhook`:
// el comprador pagó en la página de Flow y esta función es la que cruza el
// pedido. Si falla, el pedido queda cobrado y sin cruzar.
//
// Se despliega con --no-verify-jwt: lo llama Flow, no un usuario.
//
// Lo que manda Flow (doc "Confirmación de la orden"): un POST
// `application/x-www-form-urlencoded` con SOLO `token`. Sin estado y sin firma.
// Por eso el orden de las defensas es distinto al de 360pay:
//   1. El token, del body crudo.
//   2. La fila de `cobros` que lo conoce (bloque §40). Un token que no es de
//      ninguna fila no es de nadie.
//   3. Dedupe por token contra el índice único (store_id, dedupe_key).
//   4. **`payment/getStatus` firmado con NUESTRA secret key.** Es lo que da la
//      autenticidad: un token inventado no devuelve una orden pagada. La doc
//      lo confirma por el otro lado — el estado de la transacción no depende
//      de lo que responda este webhook.
//   5. El MONTO se contrasta contra la fila.
//
// Responder 200 en menos de 15 segundos es parte del contrato: si no, Flow
// avisa por correo con "Problema de integración". Todo lo pesado (CAPI, la
// guía) corre en segundo plano después de confirmar.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { columnasDe } from '../_shared/cobros.ts'
import { acuseDePago } from '../_shared/acuse-de-pago.ts'
import { isPickupDispatch } from '../_shared/despacho.ts'
import { desgloseDeFlow, esPagada, esFinalSinPago, estadoPorToken, flowBaseUrl, llavesDeTienda, tokenDelWebhook, type FlowEnv } from '../_shared/flow.ts'
import { dispatchConversion, hasAnyCapi, runInBackground, type AdsConfig } from '../_shared/capi.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Avisar por el canal a quien esté mirando. Best-effort: el 200 jamás depende
 *  de esto (mismo criterio que `pay360-webhook`). */
async function broadcast(sessionId: string, event: string, payload: unknown) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ messages: [{ topic: `order:${sessionId}`, event, payload }] }),
    })
  } catch (e) {
    console.warn('[flow-confirm] no se pudo avisar por el canal', String(e).slice(0, 200))
  }
}

async function avisar(sessionId: string, acuse: unknown) {
  if (acuse) await broadcast(sessionId, 'new_message', acuse)
  await broadcast(sessionId, 'cobros_update', {})
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'Method not allowed' }, 405)

  // 1 · el token, del body crudo
  const rawBody = await req.text()
  const token = tokenDelWebhook(rawBody)
  if (!token) {
    console.error('[flow-confirm] sin token')
    return ok({ error: 'missing_token' }, 400)
  }

  // 2 · la fila que conoce este token
  const { data: cobro } = await supabase.from('cobros')
    .select('id, session_id, store_id, tipo, monto, estado, concepto')
    .eq('flow_token', token).maybeSingle()
  if (!cobro) {
    // No es de nadie. 200 y no 4xx: no hay nada que Flow pueda hacer mejor.
    console.warn('[flow-confirm] token sin fila')
    return ok({ received: true, ignored: 'token desconocido' })
  }

  const sessionCols = 'id, order_id, store_id, origin_store_id, buyer_name, buyer_phone, buyer_id, product_id, product_price, dispatch_type, advance_amount, payment_verification, payment_provider, saldo_amount, saldo_verification, ad_fbp, ad_fbc, ad_ttp, ad_ttclid, ad_client_ua, ad_client_ip, ad_source_url'
  const { data: session } = await supabase.from('order_sessions')
    .select(sessionCols).eq('id', cobro.session_id).maybeSingle()
  if (!session) return ok({ received: true, ignored: 'pedido no encontrado' })

  const storeId = String(session.store_id ?? cobro.store_id)
  const originStoreId = String(session.origin_store_id ?? session.store_id)

  // 3 · dedupe por token
  const dedupeKey = `flow:${token}`
  const { error: dupErr } = await supabase.from('payment_events').insert({
    store_id: storeId, source: 'FLOW', provider: 'FLOW',
    dedupe_key: dedupeKey, received_at: new Date().toISOString(),
    raw: rawBody.slice(0, 20_000),
    ignored_reason: 'procesando',
  })
  if (dupErr) {
    if (dupErr.code === '23505') return ok({ received: true, duplicate: true })
    console.error('[flow-confirm] insert falló', JSON.stringify({ code: dupErr.code }))
    return ok({ error: 'db' }, 500)
  }

  if (session.payment_provider !== 'FLOW') {
    return await ignore(storeId, dedupeKey, 'pedido de otro motor de cobro')
  }
  if (String(cobro.estado).toUpperCase() === 'MATCHED') {
    // Flow puede volver a avisar; re-confirmar lo ya confirmado solo puede romperlo.
    return await ignore(storeId, dedupeKey, 'actualización de un cobro ya verificado')
  }

  // 4 · la VERDAD la da Flow, firmada con la secret key DE LA MARCA que emitió
  // la orden (bloque §41). Se resuelve por `origin_store_id`, la misma tienda
  // que la emitió en `flow-order`: con otra llave, `getStatus` no reconoce el
  // token y el cobro no cruzaría nunca.
  const { data: store } = await supabase.from('stores')
    .select('flow_env, meta_pixel_id, tiktok_pixel_id').eq('id', originStoreId).maybeSingle()
  const env = (store?.flow_env === 'live' ? 'live' : 'sandbox') as FlowEnv
  const { data: secretos } = await supabase.from('store_secrets')
    .select('flow_api_key, flow_secret_key').eq('store_id', originStoreId).maybeSingle()
  const keys = llavesDeTienda(secretos)
  if (!keys) {
    // Sin llaves no hay forma de verificar, y sin verificar NO se cruza: un
    // webhook que se cree a sí mismo es una puerta para marcar pedidos como
    // pagados desde fuera. Se suelta el dedupe y se pide reintento — si a la
    // marca le borraron las llaves por error, al reponerlas el reintento cruza.
    await supabase.from('payment_events').delete().eq('store_id', storeId).eq('dedupe_key', dedupeKey)
    console.error('[flow-confirm] la marca no tiene llaves de Flow', JSON.stringify({ store: originStoreId }))
    return ok({ error: 'store_without_keys' }, 503)
  }

  const estado = await estadoPorToken(flowBaseUrl(env), keys, token)
  if (!estado.ok) {
    // No se pudo confirmar: se suelta el dedupe para que un reintento pueda
    // volver a intentarlo, y se pide el reintento con un 5xx.
    await supabase.from('payment_events').delete().eq('store_id', storeId).eq('dedupe_key', dedupeKey)
    console.error('[flow-confirm] getStatus falló', JSON.stringify({ status: estado.status, error: estado.error ?? null }))
    return ok({ error: 'status_unverified' }, 503)
  }
  if (!esPagada(estado.data)) {
    if (esFinalSinPago(estado.data)) {
      // Rechazada o anulada: es final. Queda el rastro y el motivo, y Ventas se
      // entera: es el comprador al que le falló el código y no va a volver solo.
      await supabase.from('order_sessions').update({
        payment_reason: `Flow: orden ${estado.data.status === 3 ? 'rechazada' : 'anulada'} (${estado.data.flowOrder ?? token})`,
      }).eq('id', session.id)
      return await ignore(storeId, dedupeKey, `orden en estado ${estado.data.status}`)
    }
    // PENDIENTE: puede pagarse después (los medios asíncronos avisan de nuevo
    // con el mismo token). Se suelta el dedupe para que ese aviso entre.
    await supabase.from('payment_events').delete().eq('store_id', storeId).eq('dedupe_key', dedupeKey)
    return ok({ received: true, pending: true })
  }

  // 5 · el monto. Una orden pagada por menos NO es el cobro pagado.
  const rowAmount = Number(cobro.monto ?? 0)
  const paid = Number(estado.data.paymentData?.amount ?? estado.data.amount ?? 0)
  const esExtra = cobro.tipo === 'extra'
  const esSaldo = cobro.tipo === 'saldo'
  const queCobro = esExtra ? (cobro.concepto ?? 'cobro') : esSaldo ? 'saldo' : 'adelanto'
  if (!(paid >= rowAmount)) {
    await supabase.from('order_sessions').update({
      payment_reason: `Orden Flow pagada por S/${paid}, el ${queCobro} era S/${rowAmount} — revisar antes de confirmar`,
    }).eq('id', session.id)
    return await ignore(storeId, dedupeKey, `monto insuficiente (S/${paid} < S/${rowAmount})`)
  }

  // ─── Confirmar ─────────────────────────────────────────────────────────────
  const matchedAt = new Date().toISOString()
  const pd = estado.data.paymentData ?? null
  const flowOrder = estado.data.flowOrder != null ? String(estado.data.flowOrder) : null
  // El desglose del bloque §39. `fee` es lo de Flow; la comisión de Kross no
  // viene en el estado —se configura por contrato— y queda NULL a propósito.
  const desglose = desgloseDeFlow(pd)

  await supabase.from('payment_events').update({
    provider_charge_id: flowOrder,
    provider_fee_pen: desglose.costo,
    amount_pen: paid,
    sender_name: session.buyer_name ?? null,
    matched_order_id: session.id, matched_at: matchedAt,
    // El `raw` pasa a ser el ESTADO, no el token pelado: es lo que el rastro
    // del panel lee (`_shared/rastro.ts` busca `operation_number` y
    // `bank_tx_id`). El número de orden de Flow es lo que su soporte pide, y
    // el medio ("Yape") es lo que hace de banco.
    raw: JSON.stringify({
      ...estado.data,
      operation_number: flowOrder,
      bank_tx_id: typeof pd?.media === 'string' ? pd.media : 'Flow',
    }).slice(0, 20_000),
    operation_number: flowOrder,
    ignored_reason: null,
  }).eq('store_id', storeId).eq('dedupe_key', dedupeKey)

  const { data: ev } = await supabase.from('payment_events')
    .select('id').eq('store_id', storeId).eq('dedupe_key', dedupeKey).maybeSingle()

  const delCobro = {
    monto: paid, estado: 'MATCHED', matched_at: matchedAt, payment_event_id: ev?.id ?? null,
    comision_pen: desglose.comision,
    costo_pasarela_pen: desglose.costo,
  }
  await supabase.from('cobros').update(delCobro).eq('id', cobro.id)

  // Las columnas de siempre, mientras dura la mudanza. Un extra no tiene
  // columna que espejar y no mueve la etapa: cobrar un flete no confirma.
  const tipo = cobro.tipo as 'adelanto' | 'saldo' | 'extra'
  const patch = { ...columnasDe(tipo, delCobro), ...(esExtra || esSaldo ? {} : { payment_reason: null, stage: 'confirmado' }) }
  if (Object.keys(patch).length > 0) {
    await supabase.from('order_sessions').update(patch).eq('id', session.id)
  }

  // Los DOS mensajes, con la misma copy que 360pay: el comprador no tiene por
  // qué notar QUÉ motor cobró.
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'text', visibility: 'sellers',
    body: `✅ ${esExtra ? (cobro.concepto ?? 'Cobro') : esSaldo ? 'Saldo' : 'Adelanto'} de S/${paid} verificado automáticamente`
      + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
      + ` · Flow ${flowOrder ?? token}${typeof pd?.media === 'string' ? ` · ${pd.media}` : ''}`,
  })

  const esRecojo = isPickupDispatch(session.dispatch_type)
  const { data: acuse } = await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility: 'all', cobro_id: cobro.id,
    body: acuseDePago({
      tipo, pagado: paid, total: Number(session.product_price ?? 0), esRecojo,
      concepto: esExtra ? cobro.concepto : undefined,
    }),
  }).select().single()
  await avisar(session.id, acuse)

  // Un extra no es otra compra, y el saldo es la segunda mitad de la misma:
  // CAPI y la guía solo en el PRIMER cobro. Ver `pay360-webhook`.
  if (esExtra) return ok({ received: true, matched: true, extra: true })
  if (esSaldo) return ok({ received: true, matched: true, saldo: true })

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
    console.error('[flow-confirm] CAPI Purchase falló:', String(e))
  }

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

/** El aviso era de una fila nuestra pero no aplica. Se DEJA la fila —con el
 *  motivo— para que un reintento no lo re-procese y quede la trazabilidad. */
async function ignore(storeId: string, dedupeKey: string, reason: string) {
  await supabase.from('payment_events')
    .update({ ignored_reason: reason })
    .eq('store_id', storeId).eq('dedupe_key', dedupeKey)
  return ok({ received: true, ignored: reason })
}
