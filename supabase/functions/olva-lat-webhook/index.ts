// ─── Webhook de tracking de Olva LAT (02-SMART-LOGISTICS §Tracking Olva) ─────
// La entrada RÁPIDA —y GRATIS— del reflejo para las guías de Olva.
//
// Hasta acá, Olva era el único courier sin push: su primer proveedor (Olva API
// Perú) no tiene webhook, así que el barrido de 30 min ERA la entrada y un
// pedido podía llegar a destino media hora antes de que el comprador se
// enterara. Olva LAT sí empuja, y sus webhooks y suscripciones **no consumen
// cuota**: el push es a la vez lo más rápido y lo más barato.
//
// Se deploya con --no-verify-jwt (el proveedor no manda JWT de Supabase, igual
// que shalom-webhook y livekit-webhook): la autenticación es la FIRMA HMAC —
// X-Olva-Signature: t=<epoch>,v1=HMAC-SHA256("<t>.<cuerpo crudo>") — verificada
// en tiempo constante y con ventana anti-replay de 5 min. El secret lo emite
// PUT /webhooks una sola vez (bootstrap en `_shared/olva-lat-api.ts`) y vive en
// el secret OLVA_LAT_WEBHOOK_SECRET o en el Vault (RPC olva_lat_webhook_secret,
// sección 37).
//
// Entrega at-least-once con `X-Olva-Event-Id` estable entre reintentos. No hace
// falta tabla de dedupe: el reflejo es solo-hacia-adelante, así que el mismo
// evento aplicado dos veces no re-avisa ni retrocede nada — la misma razón por
// la que shalom-webhook tampoco la tiene.
//
// Deploy: supabase functions deploy olva-lat-webhook --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt

import { applyTracking, chatMessage, supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import type { TrackedRow } from '../_shared/tracking.ts'
import { readLatPayload } from '../_shared/olva-lat.ts'
import { firmaValida, olvaLatWebhookSecret } from '../_shared/olva-lat-api.ts'
import { anotar } from '../_shared/api-eventos.ts'

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** La frase que identifica cada aviso terminal en el hilo. Es la MISMA que se
 *  escribe y la que se busca para no repetirlo: si se separaran, el aviso se
 *  mandaría en cada entrega del webhook. */
const MARCA = {
  RETURNED: 'Olva marca el envío como DEVUELTO a origen.',
  REJECTED: 'Olva marca el envío como RECHAZADO por el destinatario.',
} as const

async function yaAvisado(sessionId: string, terminal: keyof typeof MARCA): Promise<boolean> {
  const { count } = await supabase.from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId).eq('visibility', 'sellers')
    .ilike('body', `%${MARCA[terminal]}%`)
  return (count ?? 0) > 0
}

Deno.serve(async (req) => {
  const raw = await req.text()
  const event = (() => { try { return JSON.parse(raw) } catch { return null } })() as
    { event?: unknown; data?: unknown } | null
  if (!event || typeof event !== 'object') return new Response('bad request', { status: 400 })

  // Un ping de verificación de propiedad no está en la doc, pero si el
  // proveedor lo manda llegará ANTES de que exista secret de este lado. Se le
  // responde el challenge y nada más: no tiene efectos secundarios.
  if (event.event === 'webhook.ping') {
    const challenge = isObj(event.data) && typeof event.data.challenge === 'string' ? event.data.challenge : ''
    return new Response(challenge, { status: 200 })
  }

  const secret = await olvaLatWebhookSecret()
  if (!secret) {
    console.error('olva-lat-webhook: sin OLVA_LAT_WEBHOOK_SECRET (ni secret ni Vault)')
    return new Response('not configured', { status: 500 })
  }
  if (!(await firmaValida(raw, req.headers.get('X-Olva-Signature'), secret))) {
    console.error('olva-lat-webhook: firma inválida', req.headers.get('X-Olva-Event-Id') ?? '')
    await anotar({
      proveedor: 'OLVA_LAT', op: 'webhook.firma', outcome: 'RECHAZO',
      detail: 'firma inválida o fuera de la ventana anti-replay',
    })
    return new Response('invalid signature', { status: 400 })
  }

  const data = isObj(event.data) ? event.data : {}
  const numero = String(data.orderNumber ?? '').replace(/\D/g, '')
  if (!numero) return new Response('ok', { status: 200 })

  // El evento trae el estado en la raíz y, cuando el proveedor lo adjunta, el
  // seguimiento completo en `payload`. Se leen los dos y gana la fase más
  // avanzada: `readLatPayload` ya resuelve eso, así que basta con darle el
  // objeto más rico que haya llegado.
  // Ojo con el orden del spread: `data.status` solo pisa al del payload si
  // existe. Al revés, un evento sin estado en la raíz borraría el que sí venía
  // adentro y el pedido no se movería.
  const lectura = readLatPayload(isObj(data.payload)
    ? { ...data.payload, ...(data.status !== undefined ? { status: data.status } : {}) }
    : data)

  // El pedido (o pedidos, si una guía quedó registrada en más de uno).
  const { data: rows, error } = await supabase.from('order_sessions')
    .select(TRACKED_COLUMNS)
    .eq('status', 'active')
    .eq('tracking_courier', 'OLVA')
    .eq('tracking_numero', numero)
  if (error) {
    console.error('olva-lat-webhook: query', error.message)
    return new Response('error', { status: 500 })
  }
  // Suscripción de una guía que ya no tiene pedido activo: nada que reflejar.
  if (!rows?.length) return new Response('ok', { status: 200 })

  for (const row of rows as TrackedRow[]) {
    if (lectura.phase) await applyTracking(row, { phase: lectura.phase, demoraIso: null })
    else await supabase.from('order_sessions')
      .update({ tracking_checked_at: new Date().toISOString() }).eq('id', row.id)

    // DEVUELTO o RECHAZADO no son fases —la fase solo avanza y estos son
    // finales malos—, pero sí son noticia, y de las que cuestan plata: el
    // paquete vuelve y el saldo no se cobra. Va al equipo, no al comprador:
    // quién le explica un rechazo es una decisión de la marca, no del courier.
    // Y UNA sola vez: la entrega es at-least-once y el proveedor puede repetir
    // el estado en cada evento posterior — tres avisos idénticos convierten una
    // alerta en ruido que el equipo aprende a saltarse.
    if (lectura.terminal && !(await yaAvisado(row.id, lectura.terminal))) {
      await chatMessage(row.id, lectura.terminal === 'RETURNED'
        ? `⚠️ ${MARCA.RETURNED} Revisar con la agencia y coordinar con el comprador antes de dar el pedido por perdido.`
        : `⚠️ ${MARCA.REJECTED} Revisar el pedido: el paquete vuelve y el saldo queda sin cobrar.`,
        'sellers')
    }
  }

  return new Response('ok', { status: 200 })
})
