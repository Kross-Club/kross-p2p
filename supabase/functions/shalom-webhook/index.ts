import {
  applyTracking, chatMessage, derivePhase, isObj, limaDate,
  supabase, TRACKED_COLUMNS, webhookSecret, type TrackedRow,
} from '../_shared/shalom.ts'

// Webhook de tracking de Shalom API Perú (02-SMART-LOGISTICS §3) — la entrada
// RÁPIDA del reflejo: el proveedor empuja un POST firmado en cada cambio de
// estado del envío suscrito, en vez de esperar al barrido de 30 min (que queda
// de respaldo). El reflejo vive en `_shared/shalom.ts`, compartido con
// `shalom-tracking-sync`.
//
// Se deploya con --no-verify-jwt (el proveedor no manda JWT de Supabase, igual
// que livekit-webhook): la autenticación es la FIRMA HMAC del proveedor —
// X-Shalom-Signature: t=<epoch>,v1=HMAC-SHA256(t + "." + cuerpo_crudo, secret)
// — verificada en tiempo constante y con ventana anti-replay de 5 min. El
// secret lo emite PUT /v1/webhooks una sola vez y vive en el secret
// SHALOM_WEBHOOK_SECRET o en el Vault (RPC shalom_webhook_secret, sección 24).
//
// Entrega at-least-once: un reintento reusa el X-Shalom-Event-Id. No hace
// falta tabla de dedupe — el reflejo es solo-hacia-adelante, así que el mismo
// evento aplicado dos veces no re-avisa ni retrocede nada.
//
// Eventos (la suscripción la hace order-manage al registrar la guía):
//   webhook.ping       → eco del data.challenge (verificación de propiedad).
//   tracking.updated   → el envío avanzó de hito: reflejar.
//   tracking.delivered → entregado; la suscripción se cierra sola.
//   tracking.expired   → ~21 días sin cerrarse: el proveedor la soltó; el
//                        barrido sigue cubriendo el pedido — aviso al equipo.

async function validSignature(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=') as [string, string]))
  const t = parts.t, v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false // anti-replay
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`))
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  // Comparación en tiempo constante.
  if (expected.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}

// El timeline del payload trae hitos como lista ({milestone, fecha, hora,
// descripcion, completo}); el reflejo espera la forma de `status` (hito →
// objeto). Se reconstruye y se refuerzan `data.status` (hito actual) y el flag
// `delivered`, por si el timeline llega recortado.
function statusFromEvent(data: Record<string, unknown>): Record<string, unknown> {
  const status: Record<string, unknown> = {}
  const timeline = Array.isArray(data.timeline) ? data.timeline : []
  for (const e of timeline) {
    if (isObj(e) && typeof e.milestone === 'string') status[e.milestone] = e
  }
  if (typeof data.status === 'string' && data.status && !isObj(status[data.status])) {
    status[data.status] = { fecha: null }
  }
  if (data.delivered === true && !isObj(status.entregado)) status.entregado = { fecha: null }
  return status
}

function eventDate(entry: unknown): string | null {
  if (!isObj(entry)) return null
  const fecha = typeof entry.fecha === 'string' ? entry.fecha : ''
  if (!fecha) return null
  const hora = typeof entry.hora === 'string' && entry.hora ? entry.hora : '00:00'
  return limaDate(fecha.includes(':') ? fecha : `${fecha} ${hora.length === 5 ? `${hora}:00` : hora}`)
}

Deno.serve(async (req) => {
  const raw = await req.text()
  const event = (() => { try { return JSON.parse(raw) } catch { return null } })() as
    { id?: unknown; event?: unknown; data?: unknown } | null
  if (!event || typeof event !== 'object') return new Response('bad request', { status: 400 })

  // El ping de verificación de propiedad: llega UNA vez, al registrar la URL —
  // antes de que el secret esté siquiera guardado de este lado, así que no se
  // le exige firma. Devolver el challenge no tiene ningún efecto secundario.
  if (event.event === 'webhook.ping') {
    const challenge = isObj(event.data) && typeof event.data.challenge === 'string' ? event.data.challenge : ''
    return new Response(challenge, { status: 200 })
  }

  const secret = await webhookSecret()
  if (!secret) {
    console.error('shalom-webhook: sin SHALOM_WEBHOOK_SECRET (ni secret ni Vault)')
    return new Response('not configured', { status: 500 })
  }
  if (!(await validSignature(raw, req.headers.get('X-Shalom-Signature'), secret))) {
    console.error('shalom-webhook: firma inválida', req.headers.get('X-Shalom-Event-Id') ?? '')
    return new Response('invalid signature', { status: 400 })
  }

  const kind = String(event.event ?? '')
  const data = isObj(event.data) ? event.data : {}
  const numero = String(data.numero ?? '').replace(/\D/g, '')
  const oseId = data.ose_id != null ? String(data.ose_id) : null
  if (!numero && !oseId) return new Response('ok', { status: 200 })

  // El pedido (o pedidos, si una guía quedó registrada en más de uno) al que
  // pertenece el envío. Por numero — es lo que la suscripción conoce seguro.
  let q = supabase.from('order_sessions').select(TRACKED_COLUMNS)
    .eq('status', 'active').eq('tracking_courier', 'SHALOM')
  q = numero ? q.eq('tracking_numero', numero) : q.eq('tracking_ose_id', oseId!)
  const { data: rows, error } = await q
  if (error) {
    console.error('shalom-webhook: query', error.message)
    return new Response('error', { status: 500 })
  }
  if (!rows?.length) {
    // Suscripción de un envío que ya no tiene pedido activo: nada que reflejar.
    return new Response('ok', { status: 200 })
  }

  if (kind === 'tracking.updated' || kind === 'tracking.delivered') {
    const status = statusFromEvent(data)
    const demoraIso = isObj(status.demora) ? eventDate(status.demora) ?? new Date().toISOString() : null
    const reading = { phase: derivePhase(status), demoraIso, oseId }
    for (const row of rows as TrackedRow[]) await applyTracking(row, reading)
  } else if (kind === 'tracking.expired') {
    // El proveedor soltó la suscripción (~21 días sin cierre; devuelto y
    // cancelado también terminan así). El barrido de pg_cron sigue cubriendo
    // el pedido — pero un envío tan viejo sin cerrar es para mirarlo.
    for (const row of rows as TrackedRow[]) {
      await chatMessage(row.id, `⚠️ El envío de ${row.agency_name ?? 'el courier'} lleva ~3 semanas sin cerrarse (¿devuelto o cancelado?). Revisar con la agencia; el pedido sigue vigilado por el barrido periódico.`, 'sellers')
      await supabase.from('order_sessions').update({ tracking_checked_at: new Date().toISOString() }).eq('id', row.id)
    }
  }
  // Tipos desconocidos: 200 igual — no provocar reintentos de algo que no
  // vamos a procesar distinto mañana.

  return new Response('ok', { status: 200 })
})
