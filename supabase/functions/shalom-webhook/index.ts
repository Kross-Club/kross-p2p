import {
  applyTracking, chatMessage, derivePhase, isObj, latWebhookSecret, limaDate,
  supabase, TRACKED_COLUMNS, webhookSecret, type TrackedRow,
} from '../_shared/shalom.ts'
import { lecturaDeEvento, validLatSignature } from '../_shared/shalom-lat.ts'

// Webhook de tracking de Shalom (02-SMART-LOGISTICS §3) — la entrada RÁPIDA del
// reflejo: el proveedor empuja un POST firmado en cada cambio de estado del
// envío suscrito, en vez de esperar al barrido de 30 min (que queda de
// respaldo). El reflejo vive en `_shared/tracking.ts`, compartido con
// `shalom-tracking-sync`.
//
// UNA función para los DOS proveedores (02 §Los dos proveedores de Shalom):
//   · Shalom PE  — `X-Shalom-Signature: t=<epoch>,v1=HMAC-SHA256(t + "." + cuerpo)`
//     y eventos con `timeline` de hitos.
//   · Shalom LAT — su doc no publica ni el header ni el formato del digest, así
//     que se prueban los nombres usuales y las dos formas de firma (con
//     timestamp o digest pelado del cuerpo), y el evento se lee con búsqueda
//     defensiva (`lecturaDeEvento`).
// Quién firmó lo dice el secret que valida — no un campo del cuerpo, que
// cualquiera podría escribir. Si no valida ninguno, el evento rebota: un
// webhook sin auth es una puerta para mover pedidos ajenos.
//
// Se deploya con --no-verify-jwt (ningún proveedor manda JWT de Supabase, igual
// que livekit-webhook). Los secrets viven en SHALOM_WEBHOOK_SECRET /
// SHALOM_LAT_WEBHOOK_SECRET o en el Vault (RPCs de las secciones 24 y 24.b).
//
// Entrega at-least-once: un reintento reusa el X-Shalom-Event-Id. No hace falta
// tabla de dedupe — el reflejo es solo-hacia-adelante, así que el mismo evento
// aplicado dos veces no re-avisa ni retrocede nada.
//
// Eventos de Shalom PE (la suscripción la hace `guia.ts` al registrar la guía):
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

/** Los headers donde puede venir la firma, de cualquiera de los dos. */
const SIGNATURE_HEADERS = [
  'X-Shalom-Signature', 'X-Signature', 'X-Hub-Signature-256', 'X-Webhook-Signature',
]

Deno.serve(async (req) => {
  const raw = await req.text()
  const event = (() => { try { return JSON.parse(raw) } catch { return null } })() as
    { id?: unknown; event?: unknown; data?: unknown } | null
  if (!event || typeof event !== 'object') return new Response('bad request', { status: 400 })

  // El ping de verificación de propiedad: llega UNA vez, al registrar la URL —
  // antes de que el secret esté siquiera guardado de este lado, así que no se
  // le exige firma. Devolver el challenge no tiene ningún efecto secundario.
  // (Vale para los dos: el titular lo manda como `webhook.ping`; de la
  // contingencia no sabemos el nombre, así que un evento que trae `challenge` y
  // ninguna guía se responde igual — hacer eco no tiene efecto secundario.)
  const lectura = lecturaDeEvento(event)
  if (event.event === 'webhook.ping' || (lectura.challenge && !lectura.numero)) {
    const challenge = isObj(event.data) && typeof event.data.challenge === 'string'
      ? event.data.challenge : lectura.challenge ?? ''
    return new Response(challenge, { status: 200 })
  }

  // ─── Quién firmó ───────────────────────────────────────────────────────────
  // Se prueba el titular con su header y su formato; después la contingencia,
  // con los nombres de header usuales y las dos formas de digest. El secret que
  // valide es el que dice de quién vino el evento.
  const firmaPE = req.headers.get('X-Shalom-Signature')
  const secretPE = await webhookSecret()
  let origen: 'PE' | 'LAT' | null =
    secretPE && await validSignature(raw, firmaPE, secretPE) ? 'PE' : null

  if (!origen) {
    const secretLAT = await latWebhookSecret()
    if (secretLAT) {
      for (const h of SIGNATURE_HEADERS) {
        if (await validLatSignature(raw, req.headers.get(h), secretLAT)) { origen = 'LAT'; break }
      }
    }
    if (!origen) {
      if (!secretPE && !(await latWebhookSecret())) {
        console.error('shalom-webhook: sin secret de ningún proveedor (ni secret ni Vault)')
        return new Response('not configured', { status: 500 })
      }
      console.error('shalom-webhook: firma inválida', req.headers.get('X-Shalom-Event-Id') ?? '')
      return new Response('invalid signature', { status: 400 })
    }
  }

  // ─── Qué dice el evento ────────────────────────────────────────────────────
  const kind = String(event.event ?? '')
  const data = isObj(event.data) ? event.data : {}
  const numero = origen === 'PE'
    ? String(data.numero ?? '').replace(/\D/g, '')
    : lectura.numero ?? ''
  const oseId = origen === 'PE' && data.ose_id != null ? String(data.ose_id) : null
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

  if (origen === 'LAT') {
    // LAT no publica los tipos de evento ni la forma del cuerpo: se refleja lo
    // que la lectura defensiva haya podido afirmar. Sin fase no se toca nada —
    // `applyTracking` solo avanza, nunca retrocede ni re-avisa.
    const reading = {
      phase: lectura.phase,
      demoraIso: lectura.demora === null ? null : limaDate(lectura.demora) ?? new Date().toISOString(),
      oseId: null,
    }
    for (const row of rows as TrackedRow[]) await applyTracking(row, reading)
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
