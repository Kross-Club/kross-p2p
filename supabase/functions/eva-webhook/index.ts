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

import { applyTracking, broadcast, chatMessage, supabase, TRACKED_COLUMNS, type TrackedRow } from '../_shared/tracking.ts'
import { anotar } from '../_shared/api-eventos.ts'
import {
  esCierreSinEntregaEva, esDemoraEva, faseDeEva, firmaEvaValida, leerWebhookEva, mensajesDeEva,
  normalizarEstadoEva,
} from '../_shared/eva.ts'

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type FilaEva = TrackedRow & { order_id: string | null; eva_estado: string | null; eva_estado_at: string | null }

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
    .select(`${TRACKED_COLUMNS}, order_id, eva_estado, eva_estado_at`)
    .eq('status', 'active').eq('tracking_courier', 'EVA').eq('tracking_numero', evento.trackingId)
  if (error) {
    console.error('eva-webhook: query', error.message)
    return new Response('error', { status: 500 })
  }
  if (!rows?.length) {
    console.warn('eva-webhook: tracking sin pedido', evento.trackingId, estado)
    return ok({ ok: true, ignored: 'pedido no encontrado' })
  }

  for (const row of rows as FilaEva[]) {
    // El mismo evento dos veces: mismo estado, misma hora. Nada que hacer.
    if (row.eva_estado === estado && row.eva_estado_at && evento.fechahora && row.eva_estado_at === evento.fechahora) continue

    const ctx = { proveedor: 'EVA' as const, op: 'webhook.evento', storeId: row.store_id, sessionId: row.id }
    await anotar({ ...ctx, outcome: 'OK', providerRef: evento.trackingId, detail: estado })

    const msgs = mensajesDeEva(estado, { motivo: evento.motivo, comentarios: evento.comentarios, fotos: evento.fotos })
    const ahora = new Date().toISOString()
    const patch: Record<string, unknown> = { eva_estado: estado, eva_estado_at: evento.fechahora ?? ahora }
    if (estado === 'ENTREGADO' && evento.fotos[0]) patch.eva_entrega_foto = evento.fotos[0]

    const fase = faseDeEva(estado)
    if (fase) {
      // Solo hacia adelante y con los mensajes de EVA, no los de agencia: un
      // domicilio no «llega a tu agencia». `alAvanzar` reemplaza a
      // `onTransition` justo por eso.
      await applyTracking(row, { phase: fase, demoraIso: null }, {
        alAvanzar: async () => {
          if (msgs.comprador) await chatMessage(row.id, msgs.comprador, 'all')
          if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
        },
      })
    } else if (esDemoraEva(estado)) {
      // Cada intento fallido cuenta: la demora se reescribe con su hora, y se
      // avisa cada vez (no es el mismo evento: es otra visita).
      patch.tracking_demora_at = evento.fechahora ?? ahora
      if (msgs.comprador) await chatMessage(row.id, msgs.comprador, 'all')
      if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
    } else if (esCierreSinEntregaEva(estado)) {
      if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
    } else if (row.eva_estado !== estado && msgs.equipo) {
      // En almacén, asignado: solo al equipo, y solo si cambió.
      await chatMessage(row.id, msgs.equipo, 'sellers')
    }

    const { error: errUp } = await supabase.from('order_sessions').update(patch).eq('id', row.id)
    if (errUp) console.error('eva-webhook: update', row.id, errUp.message)
    else await broadcast(row.id, 'tracking_update', patch)
  }

  return ok()
})
