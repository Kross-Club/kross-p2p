// ─── Webhook de Eva Courier (§64) ────────────────────────────────────────────
// Eva empuja un POST firmado en cada cambio de estado de un reparto. Es LA
// entrada del reflejo de Eva: no hay barrido de respaldo (su doc recomienda
// una reconciliación diaria por `GET /api/v1/orders/{tracking_id}/`, que queda
// como deuda anotada en `docs/17-EVA.md`).
//
// Se deploya con --no-verify-jwt (Eva no manda JWT de Supabase, igual que
// `shalom-webhook`). El secret vive en `EVA_WEBHOOK_SECRET`.
//
// La firma: `X-EVA-Signature` = HMAC-SHA256 hex del BODY CRUDO con el secret
// (`firmaEvaValida`, en el módulo puro y con tests). Sin firma válida, 401 —
// es lo que pide su manual y lo que corresponde: un webhook sin auth es una
// puerta para mover pedidos ajenos. Eva NO reintenta un 4xx, y está bien: un
// impostor no merece reintento.
//
// Idempotencia (su doc la exige): el reflejo de fase es solo-hacia-adelante
// (`applyTracking`), y para lo que no es fase —demora, cierre— se compara con
// el último estado y su hora antes de volver a escribir en el chat.

import { supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import { COLUMNAS_EVA, reflejarEstadoEva, type FilaEva } from '../_shared/eva-reflejo.ts'
import { firmaEvaValida, leerWebhookEva, normalizarEstadoEva } from '../_shared/eva.ts'

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const secret = String(Deno.env.get('EVA_WEBHOOK_SECRET') ?? '').trim()
  if (!secret) {
    console.error('eva-webhook: sin EVA_WEBHOOK_SECRET')
    return new Response('not configured', { status: 500 })
  }
  if (!(await firmaEvaValida(raw, req.headers.get('X-EVA-Signature'), secret))) {
    console.error('eva-webhook: firma inválida')
    return new Response('invalid signature', { status: 401 })
  }

  const json = (() => { try { return JSON.parse(raw) } catch { return null } })()
  const evento = leerWebhookEva(json)
  if (!evento) return new Response('bad request', { status: 400 })

  // El ping de prueba del portal: firmado como todo lo demás, y sin efecto.
  if (evento.event === 'test.ping') return ok({ ok: true, pong: true })
  if (evento.event !== 'order.status_updated') return ok({ ok: true, ignored: evento.event })
  if (!evento.trackingId || !evento.estado) return new Response('bad request', { status: 400 })

  const estado = normalizarEstadoEva(evento.estado)

  // El pedido al que pertenece. Por tracking + courier: el tracking de Eva es
  // alfanumérico y podría coincidir con un número de guía de otro courier.
  const { data: rows, error } = await supabase.from('order_sessions')
    .select(`${TRACKED_COLUMNS}, ${COLUMNAS_EVA}`)
    .eq('status', 'active').eq('tracking_courier', 'EVA').eq('tracking_numero', evento.trackingId)
  if (error) {
    console.error('eva-webhook: query', error.message)
    return new Response('error', { status: 500 })
  }
  if (!rows?.length) {
    console.warn('eva-webhook: tracking sin pedido', evento.trackingId, estado)
    return ok({ ok: true, ignored: 'pedido no encontrado' })
  }

  // El reflejo vive en `_shared/eva-reflejo.ts`, compartido con el botón
  // «Actualizar» del panel: un estado no puede reflejarse distinto según si lo
  // empujó Eva o lo preguntamos nosotros.
  for (const row of rows as FilaEva[]) {
    await reflejarEstadoEva(row, {
      estado, motivo: evento.motivo, comentarios: evento.comentarios,
      fotos: evento.fotos, fechahora: evento.fechahora,
    })
  }

  return ok()
})
