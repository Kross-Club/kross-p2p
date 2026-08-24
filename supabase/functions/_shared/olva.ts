// ─── Olva — lo ESPECÍFICO del courier (puro, sin Deno) ───────────────────────
// Lo importan la Edge Function `olva-tracking-sync`/`olva-tracking` Y el front
// (`OlvaTrackingService`), igual que `pay360.ts`: servidor y chat leen los
// mismos eventos con las mismas reglas. Por eso aquí no entra nada de Deno —
// la key del proveedor la resuelve cada función con su helper (como hace
// `shalom-tracking` con la suya).
//
// El reflejo compartido entre couriers (fase hacia adelante, avisos, cobranza)
// vive en `tracking.ts`; el proveedor es Olva API Perú
// (https://olva-api-peru.com/docs/) — independiente, NO la API oficial.

/** Mismos literales que `Phase` de tracking.ts; este es el nombre del front. */
export type TrackingPhase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Palabras que delatan cada fase en los textos de eventos del courier, de la
// más avanzada a la menos. PROVISIONAL: calibrada sin guías reales a la vista
// (el proveedor elide `details` en su doc). A diferencia de Shalom, Olva no da
// hitos explícitos: da textos. Al pasar las primeras guías vivas, contrastar
// contra los textos reales y ajustar — un envío mal clasificado dispara (o
// calla) la cobranza del saldo en el momento equivocado.
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

/**
 * El año de emisión viaja en 2 dígitos (YY) — la API de Olva rastrea por
 * numero+año, no hay código ni ose_id. Acepta también 4 ("2026" → "26");
 * vacío = el año actual de Lima (UTC-5), porque una guía se registra casi
 * siempre el mismo año en que se emitió. Formato irreconocible = null.
 */
export function normalizeYear(input: unknown, nowMs: number): string | null {
  if (input === undefined || input === null || input === '') {
    const lima = new Date(nowMs - 5 * 60 * 60 * 1000)
    return String(lima.getUTCFullYear() % 100).padStart(2, '0')
  }
  const s = String(input).trim()
  if (/^\d{2}$/.test(s)) return s
  if (/^\d{4}$/.test(s)) return s.slice(2)
  return null
}
