// ─── SALES ENGINE · Lectura de un pago Yape ──────────────────────────────────
// Convierte el texto crudo de una notificación de Yape en un evento normalizado
// {monto, nombre, código, operación}. Vive en `_shared` porque lo usan la Edge
// Function `yape-ingest` (Deno) y los tests del repo (Vitest): una sola fuente
// de verdad, y el parser se prueba sin desplegar nada.
//
// ⚠️ El texto exacto de la notificación NO está confirmado contra un equipo
// real. El parser es deliberadamente tolerante —prueba varios patrones y no
// asume orden— y `raw` se guarda SIEMPRE, así que un texto que no calce se
// puede reprocesar después sin haber perdido el pago. Ver `docs/01-SALES-ENGINE.md`.

export interface ParsedYape {
  /** Monto en soles. `null` si no se pudo leer — sin monto no hay match posible. */
  amountPen: number | null
  /** Nombre de quien envió, tal como lo escribe Yape (suele venir abreviado). */
  senderName: string | null
  /** Código de seguridad de 3 dígitos, si la notificación lo trae. */
  securityCode: string | null
  /** N° de operación, si aparece. */
  operationNumber: string | null
  /** ¿El texto parece siquiera una notificación de Yape? */
  looksLikeYape: boolean
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * Monto. Yape escribe "S/ 20", "S/20.00", "S/ 1,250.50". Se acepta la coma como
 * separador de miles y el punto como decimal, que es como se escribe en Perú.
 */
function readAmount(text: string): number | null {
  const m = text.match(/S\/\s*([\d.,]+)/i)
  if (!m) return null
  // Quita separadores de miles y deja un solo punto decimal.
  const cleaned = m[1].replace(/,/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Nombre del pagador. Se prueban las formas conocidas en orden de confianza; si
 * ninguna calza, se devuelve null en vez de adivinar — un nombre inventado haría
 * que un match manual se vea como automático.
 */
function readSenderName(text: string): string | null {
  // El fin del nombre es una coma, un "!" o un punto SEGUIDO DE ESPACIO. Un punto
  // final pegado al fin del texto se deja dentro: casi siempre cierra la inicial
  // del apellido ("ANA MARIA T."), no la oración. De eso se encarga `tidyName`.
  const END = '(?:[,!]|\\.\\s|$)'
  const patterns: RegExp[] = [
    // "Juan P. te envió un pago por S/20"  ·  "JUAN P. te yapeó S/20"
    /^(.+?)\s+te\s+(?:envi[oó]|yape[oó]|hizo)/i,
    // "Has recibido un pago de S/20 de Juan P."
    new RegExp(`(?:has\\s+)?recibi(?:ste|do)\\s+(?:un\\s+)?(?:pago|yapeo)\\s+de\\s+S\\/\\s*[\\d.,]+\\s+de\\s+(.+?)${END}`, 'i'),
    // "Pago recibido de Juan P."  ·  "de: JUAN P."
    new RegExp(`(?:pago|yapeo)\\s+recibido\\s+de\\s+(.+?)${END}`, 'i'),
    new RegExp(`\\bde:\\s*(.+?)${END}`, 'i'),
  ]
  for (const re of patterns) {
    const m = squash(text).match(re)
    const name = m?.[1] && tidyName(m[1])
    // Un "nombre" de una letra o que sea puro número es ruido del parseo.
    if (name && name.length >= 2 && !/^\d+$/.test(name)) return name
  }
  return null
}

/** Limpia el nombre capturado conservando el punto de una inicial abreviada. */
function tidyName(raw: string): string {
  const name = squash(raw).replace(/[,!]+$/, '')
  if (!name.endsWith('.')) return name
  const lastToken = name.slice(0, -1).split(' ').pop() ?? ''
  return lastToken.length === 1 ? name : name.slice(0, -1)
}

/** Código de seguridad: 3 dígitos, siempre anunciados por su etiqueta. */
function readSecurityCode(text: string): string | null {
  const m = deaccent(text).match(/(?:codigo(?:\s+de)?\s+seguridad|cod\.?\s*seg\.?)\D{0,10}(\d{3})\b/i)
  return m?.[1] ?? null
}

/** N° de operación. Longitud variable, así que no se fija: se toma lo que haya. */
function readOperationNumber(text: string): string | null {
  const m = deaccent(text).match(/(?:n[°ºo]?\.?\s*(?:de\s+)?operacion|operacion|nro\.?\s*op)\D{0,10}(\d{4,})/i)
  return m?.[1] ?? null
}

export function parseYapeNotification(raw: string): ParsedYape {
  const text = squash(raw ?? '')
  const flat = deaccent(text).toLowerCase()

  // Señales de que es un pago RECIBIDO. "yapeaste" es un pago que SALIÓ: si se
  // aceptara, el adelanto de un pedido podría cuadrar con nuestro propio gasto.
  const outgoing = /\byapeaste\b|\benviaste\b|\bpagaste\b/.test(flat)
  const incoming = /\bte\s+yape|\bte\s+envio|\brecibiste\b|\bhas\s+recibido\b|\bpago\s+recibido\b|\byapeo\s+recibido\b/.test(flat)
  const mentionsYape = /yape/.test(flat)

  return {
    amountPen: readAmount(text),
    senderName: readSenderName(text),
    securityCode: readSecurityCode(text),
    operationNumber: readOperationNumber(text),
    looksLikeYape: (mentionsYape || incoming) && !outgoing,
  }
}

/**
 * Llave de deduplicación. La misma notificación puede llegar dos veces (el
 * automatizador reintenta, el celular la re-emite al desbloquear). Sin esto, un
 * pago se contaría dos veces y podría cuadrar dos pedidos distintos.
 *
 * Se prefiere el n° de operación —único de verdad— y se cae a monto+nombre+minuto,
 * que es lo bastante estrecho para no colisionar entre pagos reales distintos.
 */
export function yapeDedupeKey(p: ParsedYape, receivedAtIso: string): string {
  if (p.operationNumber) return `op:${p.operationNumber}`
  const minute = receivedAtIso.slice(0, 16) // YYYY-MM-DDTHH:mm
  return `sig:${p.amountPen ?? '?'}|${deaccent(p.senderName ?? '?').toUpperCase()}|${minute}`
}

/** Normaliza un nombre para comparar: sin tildes, sin puntos, mayúsculas. */
export function normalizeName(s: string | null | undefined): string {
  return squash(deaccent(s ?? '').replace(/[.]/g, ' ')).toUpperCase()
}

/**
 * ¿El nombre del pago coincide con el del comprador? Yape abrevia los apellidos
 * ("JUAN CARLOS P."), así que comparar cadenas completas fallaría siempre. Se
 * exige que **todos** los tokens del nombre corto estén contenidos en el largo,
 * tratando una inicial como prefijo.
 *
 * Es una señal de apoyo, NUNCA la que decide sola: en COD paga la mamá, el
 * vecino o el esposo, y rechazar por nombre distinto sería rechazar pagos reales.
 */
export function nameMatches(fromYape: string | null, fromBuyer: string | null): boolean {
  const a = normalizeName(fromYape).split(' ').filter(Boolean)
  const b = normalizeName(fromBuyer).split(' ').filter(Boolean)
  if (a.length === 0 || b.length === 0) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.every(tok =>
    long.some(other => (tok.length === 1 || other.length === 1)
      ? other[0] === tok[0]
      : other === tok || other.startsWith(tok) || tok.startsWith(other)),
  )
}
