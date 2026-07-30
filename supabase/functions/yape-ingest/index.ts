// ─── SALES ENGINE · Ingesta de pagos Yape ────────────────────────────────────
// Recibe un pago que le entró al Yape de la marca y trata de cuadrarlo con un
// pedido que está esperando su adelanto.
//
// **Es agnóstico de QUIÉN lee la notificación.** Ese es el punto: una PWA no
// puede leer notificaciones de otras apps (no existe Web API para eso), así que
// la lectura la hace algo externo. Cualquier fuente que hable este contrato
// sirve, y se puede cambiar sin tocar el checkout:
//
//   source=AUTOMATION      MacroDroid/Tasker en el Android del dueño → HTTP POST
//   source=ANDROID_LISTENER app nativa propia con NotificationListenerService
//   source=MANUAL          alguien del equipo lo escribe a mano
//
// Autenticación: `payment_ingest_token` de la tienda (no la anon key). Es un
// secreto por tienda; si se filtra, se rota en `stores` y listo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseYapeNotification, yapeDedupeKey } from '../_shared/yape.ts'
import { matchPaymentToOrders } from '../_shared/yape-match.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-ingest-token',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/**
 * Ventana para cuadrar. El comprador yapea y sube su captura en el mismo minuto;
 * 2 horas cubre de sobra al que se distrae, sin llegar a cruzar el pedido de
 * ayer con el pago de hoy.
 */
export const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: {
    store_id?: string
    /** Texto crudo de la notificación. Es la entrada preferida. */
    raw?: string
    source?: string
    /** Campos ya parseados por la fuente. Solo se usan si el parser no los saca. */
    amount_pen?: number
    sender_name?: string
    security_code?: string
    operation_number?: string
    /** ISO. Si la fuente encoló offline, manda cuándo llegó de verdad. */
    received_at?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const storeId = String(body.store_id ?? '').trim()
  const raw = String(body.raw ?? '').trim()
  if (!storeId) return json({ error: 'Missing store_id' }, 400)
  if (!raw && typeof body.amount_pen !== 'number') return json({ error: 'Missing raw or amount_pen' }, 400)

  // ─── Auth por token de tienda ──────────────────────────────────────────────
  const token = req.headers.get('x-ingest-token') ?? ''
  const { data: store } = await supabase
    .from('stores').select('payment_ingest_token, yape_autoconfirm').eq('id', storeId).maybeSingle()

  // Sin token configurado la tienda NO ingesta: es más seguro que aceptar todo
  // mientras alguien "todavía no lo configura".
  if (!store?.payment_ingest_token || token !== store.payment_ingest_token) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ─── Parseo ────────────────────────────────────────────────────────────────
  const parsed = parseYapeNotification(raw)
  // Lo que la fuente ya sepa completa lo que el parser no pudo. Nunca lo pisa:
  // el texto crudo es la fuente más confiable de las dos.
  const amountPen = parsed.amountPen ?? (typeof body.amount_pen === 'number' ? body.amount_pen : null)
  const senderName = parsed.senderName ?? (body.sender_name?.trim() || null)
  const securityCode = parsed.securityCode ?? (body.security_code?.trim() || null)
  const operationNumber = parsed.operationNumber ?? (body.operation_number?.trim() || null)

  const receivedAt = body.received_at && !Number.isNaN(Date.parse(body.received_at))
    ? new Date(body.received_at).toISOString()
    : new Date().toISOString()

  // Un pago SALIENTE nunca debe entrar: nuestro propio gasto cuadraría el
  // adelanto de un pedido y lo daría por pagado sin que nadie pagara.
  if (raw && !parsed.looksLikeYape) {
    return json({ ok: true, ignored: 'no parece un pago Yape recibido' })
  }
  if (amountPen === null) {
    return json({ ok: true, ignored: 'sin monto legible' })
  }

  const source = ['ANDROID_LISTENER', 'AUTOMATION', 'MANUAL'].includes(body.source ?? '')
    ? body.source! : 'AUTOMATION'
  const dedupeKey = yapeDedupeKey(
    { amountPen, senderName, securityCode, operationNumber, looksLikeYape: true },
    receivedAt,
  )

  // ─── Guardar el pago ───────────────────────────────────────────────────────
  // Se guarda SIEMPRE, cuadre o no: un pago sin pedido ahora puede ser el de un
  // pedido que entra en 30 segundos, y `raw` permite reprocesar más adelante.
  const { data: event, error: insertErr } = await supabase
    .from('payment_events')
    .insert({
      store_id: storeId, source, raw: raw || '(sin texto crudo)',
      amount_pen: amountPen, sender_name: senderName,
      security_code: securityCode, operation_number: operationNumber,
      dedupe_key: dedupeKey, received_at: receivedAt,
    })
    .select('id')
    .single()

  if (insertErr) {
    // 23505 = choque con el índice único: la notificación ya había entrado.
    // Es el caso NORMAL cuando el automatizador reintenta, no un error.
    if (insertErr.code === '23505') return json({ ok: true, duplicate: true })
    return json({ error: insertErr.message }, 500)
  }

  // ─── Cuadrar con un pedido ─────────────────────────────────────────────────
  const since = new Date(Date.parse(receivedAt) - MATCH_WINDOW_MS).toISOString()
  const { data: candidates } = await supabase
    .from('order_sessions')
    .select('id, order_id, buyer_name, advance_amount, advance_yape_code, created_at')
    .eq('store_id', storeId)
    .eq('payment_verification', 'PENDING')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  // La regla de cruce vive en `_shared/yape-match.ts`: la comparten esta
  // función y `register-buyer`, para que las dos direcciones decidan igual.
  const { chosen, reason } = matchPaymentToOrders(
    { id: event.id, amount_pen: amountPen, sender_name: senderName, security_code: securityCode },
    candidates ?? [],
  )

  if (!chosen) {
    // El pago queda guardado y sin consumir. Cuando el pedido entre —o cuando
    // alguien lo revise— se vuelve a intentar. No se pierde plata.
    return json({ ok: true, event_id: event.id, matched: false, reason })
  }

  const matchedAt = new Date().toISOString()
  const autoconfirm = store.yape_autoconfirm === true

  // El pedido lo mueve el BACKEND, nunca el front. Se marca MATCHED aunque
  // `reason` traiga una advertencia: el adelanto cuadró, el aviso es contexto
  // para quien revisa.
  const patch: Record<string, unknown> = {
    payment_verification: 'MATCHED',
    payment_matched_at: matchedAt,
    payment_reason: reason,
    payment_event_id: event.id,
  }
  // Pasar solo a `confirmado` es decisión de la marca. Arranca apagado: primero
  // se mide cuánto acierta el cruce, después se le da el gatillo.
  if (autoconfirm) patch.stage = 'confirmado'

  await supabase.from('order_sessions').update(patch).eq('id', chosen.id)
  await supabase.from('payment_events')
    .update({ matched_order_id: chosen.id, matched_at: matchedAt })
    .eq('id', event.id)

  // Rastro en el chat del pedido: es donde Ventas mira, y deja constancia de
  // que el veredicto fue automático y de por qué.
  await supabase.from('chat_messages').insert({
    session_id: chosen.id,
    sender_role: 'system',
    sender_name: 'Kross',
    type: 'text',
    body: `✅ Adelanto de S/${amountPen} verificado automáticamente`
      + (senderName ? ` · pagó ${senderName}` : '')
      + (securityCode ? ` · código ${securityCode}` : '')
      + (reason ? `\n⚠️ ${reason}` : '')
      + (autoconfirm ? '' : '\nConfirma el pedido cuando lo revises.'),
  })

  return json({
    ok: true, event_id: event.id, matched: true,
    order_id: chosen.order_id, autoconfirmed: autoconfirm, reason,
  })
})
