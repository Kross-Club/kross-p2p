// ─── SMART LOGISTICS · Tracking de guías Olva ────────────────────────────────
// Consulta el estado de una guía de Olva vía la Edge Function `olva-tracking`
// (proxy de Olva API Perú — proveedor independiente, NO la API oficial del
// courier). La key vive en el servidor; el front solo manda número y año.
//
// Nunca lanza: cada fallo dice en qué etapa ocurrió, porque la UI reacciona
// distinto a "guía no encontrada" que a "Olva caído" o "sin red".
//
// La heurística evento → fase vive en `supabase/functions/_shared/olva.ts`,
// COMPARTIDA con la Edge Function y el barrido `olva-tracking-sync` (mismo
// patrón que pay360.ts): servidor y chat leen los mismos eventos con las
// mismas reglas. Con `sessionId`, el servidor además REFLEJA la fase en el
// pedido (contrato `shipment`, solo si la guía es la registrada ahí).

import type { TrackingPhase } from '../../../../supabase/functions/_shared/olva.ts'
import { derivePhase, isValidTrack } from '../../../../supabase/functions/_shared/olva.ts'
export { derivePhase, isValidTrack, normalizeYear } from '../../../../supabase/functions/_shared/olva.ts'
export type { TrackingPhase } from '../../../../supabase/functions/_shared/olva.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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

export async function trackShipment(input: {
  track: string
  year?: string | null
  /** Con el id del pedido, el servidor refleja la lectura en `order_sessions`
   *  vía `applyTracking` — solo si la guía consultada es la registrada ahí. */
  sessionId?: string
}): Promise<TrackingResult> {
  const track = input.track.replace(/\D/g, '')
  if (!isValidTrack(track)) return { ok: false, stage: 'validation' }

  let body: Record<string, unknown>
  try {
    const res = await fetch(`${BASE}/olva-tracking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, year: input.year ?? undefined, session_id: input.sessionId }),
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
  const serverPhase = body.phase
  const phaseOk = serverPhase === 'EN_ORIGEN' || serverPhase === 'EN_TRANSITO' || serverPhase === 'EN_DESTINO' || serverPhase === 'ENTREGADO'
  return {
    ok: true,
    // La fase la manda el servidor (es la que persiste en el pedido); derivar
    // local es solo el respaldo si la función desplegada aún no la incluye.
    phase: phaseOk ? serverPhase as TrackingPhase : derivePhase([...details, ...realtime]),
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
