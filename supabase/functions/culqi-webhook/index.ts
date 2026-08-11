// ─── SALES ENGINE · Webhook de Culqi (red de seguridad) ──────────────────────
// El camino principal es síncrono (`culqi-charge`); esto existe para el caso
// donde el cargo ENTRÓ y nuestra respuesta se perdió (red caída post-cargo,
// fallo de DB). Culqi lo llama con `charge.creation.succeeded`/`failed`.
//
// Culqi NO firma sus webhooks (solo Basic auth opcional del panel), así que el
// payload es UNA PISTA, jamás la verdad: se extrae el charge id, se identifica
// la tienda por la metadata, y se re-consulta `GET /v2/charges/{id}` con la
// llave secreta DE ESA TIENDA. Un cargo forjado o de otra cuenta da 404 con
// esa llave — esa es la verificación de autenticidad real.
//
// Anti-oráculo: toda rama descartable responde `200 {ok:true}` idéntico. Los
// motivos viven SOLO en los logs — un endpoint sin auth que distingue "tienda
// sin llaves" de "sesión inexistente" es un enumerador gratis.
//
// Deploy: `--no-verify-jwt` (llama Culqi, no un navegador). Env opcional
// `CULQI_WEBHOOK_BASIC` ("usuario:clave"): si existe, se exige.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer } from '../_shared/advance.ts'
import {
  chargeForStorage, extractWebhookChargeId, extractWebhookStoreId, getCharge,
} from '../_shared/culqi.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ok = () => new Response(JSON.stringify({ ok: true }), {
  headers: { 'Content-Type': 'application/json' },
})
const retry = () => new Response(JSON.stringify({ retry: true }), {
  status: 503, headers: { 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok') // ping de configuración del panel

  // Basic auth compartida (defensa de ruido, no de autenticidad — la
  // autenticidad la da la re-consulta). Solo se exige si está configurada.
  const basic = Deno.env.get('CULQI_WEBHOOK_BASIC')
  if (basic) {
    const expected = 'Basic ' + btoa(basic)
    if (req.headers.get('authorization') !== expected) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const payload = await req.json().catch(() => null)

  // Corte temprano sin tocar la DB: sin un chr_ con forma válida no hay nada.
  const chargeId = extractWebhookChargeId(payload)
  if (!chargeId) { console.log('[culqi-webhook] sin charge id extraíble'); return ok() }

  const storeId = extractWebhookStoreId(payload)
  if (!storeId) { console.log('[culqi-webhook] charge sin kross_store_id', chargeId); return ok() }

  const { data: secrets } = await supabase
    .from('store_secrets').select('culqi_secret_key').eq('store_id', storeId).maybeSingle()
  const sk = secrets?.culqi_secret_key
  if (!sk) { console.log('[culqi-webhook] tienda sin llaves', storeId); return ok() }

  // ─── La única verdad: re-consultar el cargo con la llave de la tienda ──────
  const charge = await getCharge(sk, chargeId)
  if (!charge.ok) {
    if ('network' in charge && charge.network) return retry() // transitorio nuestro
    // 404/401 con la sk de la tienda = cargo forjado, ajeno, o evento `failed`
    // de un cargo que nunca existió. Nada que escribir.
    console.log('[culqi-webhook] charge no verificable', JSON.stringify({ charge_id: chargeId, status: charge.status }))
    return ok()
  }

  const chr = charge.data
  const meta = (chr.metadata ?? {}) as Record<string, string>
  const sessionId = meta.kross_order_session_id
  if (!sessionId || meta.kross_store_id !== storeId || chr.currency_code !== 'PEN') {
    console.log('[culqi-webhook] metadata incompleta o inconsistente', chargeId)
    return ok()
  }

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, order_id, store_id, origin_store_id, buyer_name, advance_amount, payment_verification, payment_event_id, dispatch_type, agency_name, payment_provider')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) { console.log('[culqi-webhook] sesión inexistente', sessionId); return ok() }

  // El cargo tiene que ser de la tienda DUEÑA del pedido. La metadata la
  // escribió quien creó el cargo: sin este check, una cuenta Culqi cualquiera
  // podría marcar como pagado el pedido de otra marca (el cargo es real y su
  // sk lo verifica — lo forjable es la RELACIÓN cargo↔pedido).
  const originStoreId = String(session.origin_store_id ?? session.store_id)
  if (originStoreId !== storeId) {
    console.log('[culqi-webhook] cargo de una tienda para pedido de otra', JSON.stringify({ charge_id: chargeId, store: storeId }))
    return ok()
  }
  if (session.payment_provider !== 'CULQI') {
    console.log('[culqi-webhook] pedido no-Culqi', sessionId)
    return ok()
  }

  const matchedAt = new Date().toISOString()

  // ─── Grabar el cargo (idéntico shape que culqi-charge) ─────────────────────
  const { data: inserted, error: insertErr } = await supabase.from('payment_events').insert({
    store_id: originStoreId, source: 'CULQI', provider: 'CULQI',
    provider_charge_id: chr.id,
    provider_fee_pen: typeof chr.total_fee === 'number' ? chr.total_fee / 100 : null,
    raw: JSON.stringify(chargeForStorage(chr)),
    amount_pen: chr.amount / 100, sender_name: session.buyer_name ?? null,
    dedupe_key: `culqi:${chr.id}`,
    matched_order_id: session.id, matched_at: matchedAt, received_at: matchedAt,
  }).select('id').single()

  if (insertErr) {
    // 23505: `culqi-charge` ya grabó este mismo cargo (o entrega repetida del
    // webhook). Es el caso NORMAL — el índice único hace el no-op.
    if (insertErr.code === '23505') return ok()
    console.error('[culqi-webhook] no se pudo grabar', JSON.stringify({ charge_id: chr.id, error: insertErr.message }))
    return retry()
  }

  // ─── Cuadrar el pedido ─────────────────────────────────────────────────────
  if (session.payment_verification === 'MATCHED') {
    // Ya estaba pagado con OTRO evento: hay dos cargos reales. No se toca el
    // pedido; Ventas devuelve uno.
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'text', visibility: 'sellers',
      body: `⚠️ Segundo cargo Culqi (${chr.id}) recibido para este pedido — revisar y devolver uno.`,
    })
    return ok()
  }

  const expected = advanceForServer(String(session.dispatch_type ?? ''), session.agency_name ?? null)
  if (chr.amount !== Math.round(expected * 100)) {
    // Cargo real pero por un monto que no es el del pedido: se enlaza para que
    // Ventas lo vea junto al pedido, pero NO se da por verificado (patrón
    // shortPaid del cruce manual). Sin acuse al comprador.
    await supabase.from('order_sessions').update({
      payment_event_id: inserted.id,
      payment_reason: `Cargo Culqi por S/${chr.amount / 100}, esperados S/${expected}`,
    }).eq('id', session.id)
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'text', visibility: 'sellers',
      body: `⚠️ Cargo Culqi por S/${chr.amount / 100} cuando el adelanto es S/${expected} — revisar antes de despachar.`,
    })
    return ok()
  }

  // El caso que justifica este archivo: el comprador SÍ pagó y nadie se lo
  // había escrito (la respuesta de `culqi-charge` se perdió en el camino).
  await supabase.from('order_sessions').update({
    payment_verification: 'MATCHED', payment_matched_at: matchedAt,
    payment_reason: null, payment_event_id: inserted.id, stage: 'confirmado',
  }).eq('id', session.id)

  const amount = chr.amount / 100
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'text', visibility: 'sellers',
    body: `✅ Adelanto de S/${amount} verificado automáticamente`
      + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
      + ` · Culqi ${chr.id} (cuadrado por webhook)`,
  })
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility: 'all',
    body: `✅ ¡Recibimos tu adelanto de S/${amount}! Ya estamos preparando tu pedido.`
      + ' Por aquí te avisamos cuando salga.',
  })

  return ok()
})
