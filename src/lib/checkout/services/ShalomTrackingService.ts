// ─── SMART LOGISTICS · Tracking de envíos Shalom ─────────────────────────────
// Consulta el estado de un envío de Shalom vía la Edge Function
// `shalom-tracking` (proxy de Shalom API Perú — proveedor independiente, NO la
// API oficial del courier). La key vive en el servidor; el front solo manda los
// identificadores del comprobante (numero / codigo / ose_id).
//
// Nunca lanza: cada fallo dice en qué etapa ocurrió (mismo contrato que
// OlvaTrackingService y Pay360Service).
//
// A diferencia de Olva, la fase NO se deduce con heurística de textos: el
// proveedor devuelve hitos explícitos (registrado/origen/transito/destino/
// entregado/reparto) y el mapeo a la fase canónica del módulo (02-SMART-
// LOGISTICS §3) es determinista.

import type { TrackingPhase } from './OlvaTrackingService'
export type { TrackingPhase }

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Un hito de la línea de tiempo: objeto con `fecha` (y extras) o null si no ocurrió. */
export type ShalomMilestone = Record<string, unknown> | null

export interface ShalomTrackingOk {
  ok: true
  /** Mejor lectura del estado; `null` = ningún hito marcado todavía. */
  phase: TrackingPhase | null
  /** Fecha del hito `demora` si el courier lo marcó. NO es una fase: es una
   *  alerta que convive con cualquiera (un envío demorado sigue en tránsito). */
  demora: string | null
  /** Hitos crudos del proveedor. Claves conocidas: registrado, origen,
   *  transito, demora, destino, entregado, reparto. */
  status: Record<string, ShalomMilestone>
  /** Orden completa (montos, fechas, contenido). Solo llega con credenciales
   *  Shalom Pro (modo detallado) — hoy no las usamos, así que es null. */
  order: Record<string, unknown> | null
}

export interface ShalomTrackingFailed {
  ok: false
  /** Aquí `not_found` sí es real: el proveedor devuelve 404 para guía
   *  inexistente (a diferencia de Olva API Perú, que da 502 indistinguible). */
  stage: 'validation' | 'config' | 'not_found' | 'rate_limit' | 'upstream' | 'network'
}

export type ShalomTrackingResult = ShalomTrackingOk | ShalomTrackingFailed

/** Guía impresa en el comprobante: 8–10 dígitos. */
export function isValidNumero(numero: string): boolean {
  return /^\d{8,10}$/.test(numero)
}

/** Código del comprobante: 4 alfanuméricos. Por sí solo NO resuelve el estado. */
export function isValidCodigo(codigo: string): boolean {
  return /^[A-Z0-9]{4}$/i.test(codigo)
}

// ⚠️ Verificado contra la API real: el rastreo por guía exige numero Y codigo
// juntos, o solo ose_id. La doc del proveedor dice que basta el numero; su 400
// vivo pide ambos. Los dos vienen impresos en el comprobante físico.

// Hito → fase canónica, del más avanzado al menos. `reparto` (salió a puerta,
// solo domicilio) y `destino` (en agencia destino) son ambos EN_DESTINO: el
// paquete ya está en la ciudad del comprador, que es lo que dispara la
// cobranza del saldo (§3). `demora` no está aquí a propósito — no es una fase.
const PHASE_BY_MILESTONE: [string, TrackingPhase][] = [
  ['entregado', 'ENTREGADO'],
  ['reparto', 'EN_DESTINO'],
  ['destino', 'EN_DESTINO'],
  ['transito', 'EN_TRANSITO'],
  ['origen', 'EN_ORIGEN'],
]

// `registrado` NO está en esta tabla a propósito, y no es un olvido: la guía
// existe pero el paquete puede seguir en nuestro almacén. Mapearlo a EN_ORIGEN
// —como se hacía— borraba el hueco entre "emití la guía" y "la dejé en la
// agencia", que es donde se pierde la plata en contraentrega. Sin fase, el
// pedido se queda en la columna `registrado` del tablero hasta que el courier
// diga `origen`, que es cuando el paquete de verdad ya salió de nuestras manos.

/**
 * Deduce la fase mirando qué hitos vienen marcados (objeto en vez de null) y
 * quedándose con el más avanzado. No exige `fecha` ni orden entre hitos: el
 * hito marcado ya es la señal.
 */
export function derivePhase(status: Record<string, ShalomMilestone>): TrackingPhase | null {
  for (const [milestone, phase] of PHASE_BY_MILESTONE) {
    const v = status[milestone]
    if (v && typeof v === 'object') return phase
  }
  return null
}

export async function trackShipment(input: {
  numero?: string
  codigo?: string
  oseId?: string
}): Promise<ShalomTrackingResult> {
  const numero = (input.numero ?? '').replace(/\D/g, '')
  const oseId = (input.oseId ?? '').replace(/\D/g, '')
  const codigo = (input.codigo ?? '').trim()
  if (!(isValidNumero(numero) && isValidCodigo(codigo)) && !oseId) {
    return { ok: false, stage: 'validation' }
  }
  if (codigo && !isValidCodigo(codigo)) return { ok: false, stage: 'validation' }

  let body: Record<string, unknown>
  try {
    const res = await fetch(`${BASE}/shalom-tracking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, codigo, ose_id: oseId }),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    return { ok: false, stage: 'network' }
  }

  if (body.ok !== true) {
    const stage = ['validation', 'config', 'not_found', 'rate_limit', 'upstream'].includes(body.stage as string)
      ? body.stage as ShalomTrackingFailed['stage']
      : 'upstream'
    return { ok: false, stage }
  }

  const milestone = (v: unknown): ShalomMilestone =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
  const status: Record<string, ShalomMilestone> = {}
  for (const [k, v] of Object.entries((body.status ?? {}) as Record<string, unknown>)) {
    status[k] = milestone(v)
  }

  const demoraFecha = status.demora?.fecha
  return {
    ok: true,
    phase: derivePhase(status),
    demora: typeof demoraFecha === 'string' && demoraFecha ? demoraFecha : null,
    status,
    order: milestone(body.order),
  }
}
