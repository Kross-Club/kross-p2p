// ─── Olva LAT — el SEGUNDO riel de Olva, PURO (sin Deno) ─────────────────────
// Olva ya tenía un riel: `_shared/olva.ts` contra **Olva API Perú**
// (`api.olva-api-peru.com`). Este es otro proveedor, también **independiente y
// no oficial** — **Olva LAT** (`api.olva-api.lat`, de Wazend) — y entra como
// CONTINGENCIA, no como reemplazo: dos terceros que leen el mismo courier
// fallan en momentos distintos, y hoy un `502` del primero deja el pedido a
// ciegas hasta la próxima barrida.
//
// Qué gana Kross con el segundo riel, en concreto:
//   1. **Distingue guía inexistente de Olva caído.** El primer proveedor
//      devuelve `502` para las dos cosas (verificado, ver 02 §Tracking de guías
//      Olva); Olva LAT devuelve `404` de verdad. Eso es lo que separa "avísale
//      al vendedor que la guía no existe" de "no molestes a nadie, es el
//      proveedor".
//   2. **Hay webhook.** El primero no tiene: el barrido de 30 min ES la
//      entrada. Acá el push llega al instante, firmado con HMAC, y —lo que
//      decide— webhooks y suscripciones **no consumen cuota**.
//   3. **Estados normalizados.** El primero da TEXTOS y la fase sale de una
//      heurística que este repo declara provisional (deuda abierta en
//      ESTADO-OPERATIVO); Olva LAT da un enum cerrado. Donde el enum habla, no
//      se adivina.
//
// Este archivo es a propósito PURO —igual que `olva.ts` y `pay360.ts`— para que
// lo importen las Edge Functions Y el front, y para poder probar el mapeo sin
// llamar a nadie. Lo que toca red, key o base vive en `olva-lat-api.ts`.

import { derivePhase as derivePhaseDeTexto } from './olva.ts'
import type { TrackingPhase } from './olva.ts'

export type { TrackingPhase } from './olva.ts'
export { isValidTrack, normalizeYear } from './olva.ts'

export const OLVA_LAT_BASE = 'https://api.olva-api.lat'

/** El enum cerrado del proveedor. Cualquier otra cosa es `UNKNOWN`. */
export const LAT_STATUSES = [
  'REGISTERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP',
  'DELIVERED', 'RETURNED', 'REJECTED', 'UNKNOWN',
] as const
export type LatStatus = typeof LAT_STATUSES[number]

export const isLatStatus = (v: unknown): v is LatStatus =>
  typeof v === 'string' && (LAT_STATUSES as readonly string[]).includes(v)

/**
 * Estado normalizado → fase canónica de Kross.
 *
 * `REGISTERED` NO mapea a `EN_ORIGEN`, y no es un olvido: es la misma regla que
 * ya rige en Shalom y en el primer riel de Olva —emitir la guía no es haber
 * dejado el paquete en la agencia—. Entre las dos cosas está el hueco donde se
 * pierde la plata en contraentrega, y borrarlo dispararía la cobranza del saldo
 * con el paquete todavía en el almacén de la marca.
 *
 * `RETURNED` y `REJECTED` tampoco son fases: son finales MALOS. La fase solo
 * avanza (`applyTracking`), así que meterlos acá sería mentir con el vocabulario
 * de un envío que va bien. Salen aparte, en `terminal`, para que quien recibe la
 * lectura avise al equipo.
 */
export const PHASE_BY_LAT_STATUS: Partial<Record<LatStatus, TrackingPhase>> = {
  IN_TRANSIT: 'EN_TRANSITO',
  // Reparto a domicilio del courier: el paquete ya está en la ciudad destino.
  // Misma equivalencia que el hito `reparto` de Shalom.
  OUT_FOR_DELIVERY: 'EN_DESTINO',
  READY_FOR_PICKUP: 'EN_DESTINO',
  DELIVERED: 'ENTREGADO',
}

/** Finales que no son fase pero sí noticia. */
export type LatTerminal = 'RETURNED' | 'REJECTED'

// Mismo orden que `PHASE_RANK` de `tracking.ts`. Se repite acá —cuatro
// literales— porque aquel módulo levanta el cliente de Supabase y este tiene
// que poder importarse desde el front y desde `npm test`.
const RANK: Record<TrackingPhase, number> = {
  EN_ORIGEN: 1, EN_TRANSITO: 2, EN_DESTINO: 3, ENTREGADO: 4,
}

const masAvanzada = (a: TrackingPhase | null, b: TrackingPhase | null): TrackingPhase | null =>
  !a ? b : !b ? a : (RANK[a] >= RANK[b] ? a : b)

export interface LatEvent {
  date: string | null
  status: LatStatus | null
  detail: string | null
  location: string | null
}

export interface LatTracking {
  trackingNumber: string | null
  status: LatStatus | null
  statusDetail: string | null
  origin: { agency: string | null; department: string | null }
  destination: { agency: string | null; department: string | null }
  estimatedDelivery: string | null
  deliveredAt: string | null
  events: LatEvent[]
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return s || null
}
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const lugar = (v: unknown): { agency: string | null; department: string | null } => {
  const o = isObj(v) ? v : {}
  return { agency: str(o.agency), department: str(o.department) }
}

/**
 * Lee `{ success, data: {...} }` sin exigir que venga completo: el proveedor es
 * un tercero y una lectura a medias vale más que un throw. Acepta también el
 * `data` pelado, que es la forma en la que el envoltorio del webhook lo manda.
 */
export function parseLatTracking(json: unknown): LatTracking | null {
  const raw = isObj(json) ? (isObj(json.data) ? json.data : json) : null
  if (!raw) return null
  const eventos = Array.isArray(raw.events) ? raw.events : []
  return {
    trackingNumber: str(raw.trackingNumber ?? raw.orderNumber),
    status: isLatStatus(raw.status) ? raw.status : null,
    statusDetail: str(raw.statusDetail),
    origin: lugar(raw.origin),
    destination: lugar(raw.destination),
    estimatedDelivery: str(raw.estimatedDelivery),
    deliveredAt: str(raw.deliveredAt),
    events: eventos.filter(isObj).map(e => ({
      date: str(e.date),
      status: isLatStatus(e.status) ? e.status : null,
      detail: str(e.detail),
      location: str(e.location),
    })),
  }
}

/**
 * La lectura de Olva LAT, traducida al vocabulario del pedido.
 *
 * Manda el ENUM: el estado de cabecera y el de cada evento (por si la cabecera
 * llega recortada), quedándose con la fase más avanzada que aparezca — misma
 * regla que el resto del tracking, donde un hito que "desaparece" nunca hace
 * retroceder nada.
 *
 * La heurística de TEXTOS de `olva.ts` entra solo para lo que el enum no sabe
 * decir: **`EN_ORIGEN`**. El proveedor no tiene un estado para "el paquete ya
 * está en la agencia de origen" —salta de `REGISTERED` a `IN_TRANSIT`—, pero sus
 * `detail` en español sí lo dicen ("admitido", "recepcionado en origen"), y esa
 * fase no es decorativa: es donde ARRANCA la cobranza del saldo (`tracking.ts` ·
 * `onTransition`). Del texto NO se aceptan fases más altas: para esas ya habla
 * el enum, y una frase como "en tránsito hacia la agencia de destino" no puede
 * poder más que el estado que el propio proveedor puso.
 */
export function readLatTracking(t: LatTracking): {
  phase: TrackingPhase | null
  terminal: LatTerminal | null
} {
  let phase: TrackingPhase | null = t.status ? PHASE_BY_LAT_STATUS[t.status] ?? null : null
  for (const e of t.events) {
    if (e.status) phase = masAvanzada(phase, PHASE_BY_LAT_STATUS[e.status] ?? null)
  }

  if (!phase) {
    const textos: Record<string, unknown>[] = [
      { d: t.statusDetail ?? '' },
      ...t.events.map(e => ({ d: e.detail ?? '', l: e.location ?? '' })),
    ]
    if (derivePhaseDeTexto(textos) === 'EN_ORIGEN') phase = 'EN_ORIGEN'
  }

  const estados = [t.status, ...t.events.map(e => e.status)]
  const terminal: LatTerminal | null =
    estados.includes('RETURNED') ? 'RETURNED'
    : estados.includes('REJECTED') ? 'REJECTED'
    : null

  return { phase, terminal }
}

/** Atajo: del JSON crudo del proveedor a la lectura. */
export function readLatPayload(json: unknown): {
  phase: TrackingPhase | null
  terminal: LatTerminal | null
  tracking: LatTracking | null
} {
  const tracking = parseLatTracking(json)
  if (!tracking) return { phase: null, terminal: null, tracking: null }
  return { ...readLatTracking(tracking), tracking }
}

/**
 * La firma del webhook, tipo Stripe:
 *   `X-Olva-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<body crudo>")>`
 * Se parte acá —puro— para poder probarlo; el HMAC lo calcula quien tenga
 * `crypto.subtle` (la Edge Function).
 */
export function parseLatSignature(header: string | null): { t: string; v1: string } | null {
  if (!header) return null
  const partes: Record<string, string> = {}
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=')
    if (i > 0) partes[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
  }
  return partes.t && partes.v1 ? { t: partes.t, v1: partes.v1 } : null
}

/** Ventana anti-replay: 5 min, la misma que el webhook de Shalom y la de 360pay. */
export const FIRMA_VENTANA_S = 300

export function firmaVigente(t: string, nowMs: number): boolean {
  const ts = Number(t)
  return Number.isFinite(ts) && Math.abs(nowMs / 1000 - ts) <= FIRMA_VENTANA_S
}
