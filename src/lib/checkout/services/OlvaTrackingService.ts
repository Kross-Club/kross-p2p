// ─── SMART LOGISTICS · Tracking de guías Olva ────────────────────────────────
// Consulta el estado de una guía de Olva vía la Edge Function `olva-tracking`
// (proxy de Olva API Perú — proveedor independiente, NO la API oficial del
// courier). La key vive en el servidor; el front solo manda número y año.
//
// Nunca lanza: cada fallo dice en qué etapa ocurrió, porque la UI reacciona
// distinto a "guía no encontrada" que a "Olva caído" o "sin red".
//
// El objetivo de módulo (02-SMART-LOGISTICS §3) es reflejar origen → tránsito →
// destino en el pedido y disparar la cobranza del saldo al llegar a destino.
// `derivePhase` es ese mapeo; ver su nota de calibración.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Fases canónicas del envío según el contrato del módulo (§3). */
export type TrackingPhase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'

export interface TrackingGeneral {
  fecha_envio: string | null
  id_envio: string | null
  remitente: string | null
  consignado: string | null
  origen: string | null
  destino: string | null
}

export interface TrackingOk {
  ok: true
  /** Mejor lectura del estado; `null` = los eventos no calzaron con ninguna fase. */
  phase: TrackingPhase | null
  general: TrackingGeneral
  /** Historial crudo del proveedor. Forma no garantizada: tratar como opaco. */
  details: Record<string, unknown>[]
  realtime: Record<string, unknown>[]
}

export interface TrackingFailed {
  ok: false
  /** `not_found` casi nunca llega: el proveedor devuelve `upstream` (502)
   *  también para guías inexistentes, y no distingue ese caso de Olva caído. */
  stage: 'validation' | 'config' | 'not_found' | 'rate_limit' | 'upstream' | 'network'
}

export type TrackingResult = TrackingOk | TrackingFailed

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Palabras que delatan cada fase en los textos de eventos del courier, de la
// más avanzada a la menos. PROVISIONAL: calibrada sin guías reales a la vista
// (el proveedor elide `details` en su doc). Al pasar las primeras guías vivas,
// contrastar contra los textos reales y ajustar — un envío mal clasificado
// dispara (o calla) la cobranza del saldo en el momento equivocado.
const PHASE_RULES: [TrackingPhase, RegExp][] = [
  ['ENTREGADO', /ENTREGAD/],
  ['EN_DESTINO', /EN DESTINO|AGENCIA DESTINO|DISPONIBLE|RECOJO|REPARTO/],
  ['EN_TRANSITO', /TRANSITO|TRASLADO|RUTA|SALID/],
  ['EN_ORIGEN', /ORIGEN|ADMITID|REGISTRAD|RECEPCIONAD/],
]

/**
 * Deduce la fase mirando TODOS los textos de los eventos y quedándose con la
 * más avanzada que aparezca. No asume orden en `details` (ni ascendente ni
 * descendente) ni una forma de item concreta: junta todo string que traiga.
 */
export function derivePhase(events: Record<string, unknown>[]): TrackingPhase | null {
  const haystack = deaccent(
    events.flatMap(e => Object.values(e).filter((v): v is string => typeof v === 'string')).join(' ')
  ).toUpperCase()
  for (const [phase, rule] of PHASE_RULES) {
    if (rule.test(haystack)) return phase
  }
  return null
}

/** Número de guía: solo dígitos (Olva usa 8, se tolera 6–15). */
export function isValidTrack(track: string): boolean {
  return /^\d{6,15}$/.test(track)
}

export async function trackShipment(input: { track: string; year?: string }): Promise<TrackingResult> {
  const track = input.track.replace(/\D/g, '')
  if (!isValidTrack(track)) return { ok: false, stage: 'validation' }

  let body: Record<string, unknown>
  try {
    const res = await fetch(`${BASE}/olva-tracking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, year: input.year }),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    return { ok: false, stage: 'network' }
  }

  if (body.ok !== true) {
    const stage = ['validation', 'config', 'not_found', 'rate_limit', 'upstream'].includes(body.stage as string)
      ? body.stage as TrackingFailed['stage']
      : 'upstream'
    return { ok: false, stage }
  }

  const g = (body.general ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : []

  const details = list(body.details)
  const realtime = list(body.realtime)
  return {
    ok: true,
    phase: derivePhase([...details, ...realtime]),
    general: {
      fecha_envio: str(g.fecha_envio),
      id_envio: str(g.id_envio),
      remitente: str(g.remitente),
      consignado: str(g.consignado),
      origen: str(g.origen),
      destino: str(g.destino),
    },
    details,
    realtime,
  }
}
