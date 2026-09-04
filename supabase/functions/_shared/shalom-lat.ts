// ─── Shalom LAT — el proveedor de CONTINGENCIA (puro, sin Deno) ──────────────
// Shalom no tiene API oficial. Las dos que usamos son de terceros que operan
// sobre el MISMO Shalom (la web pública para rastrear, la cuenta Shalom Pro de
// la marca para emitir), así que ninguna es "la verdadera" y cualquiera puede
// caerse sin aviso. Por eso desde set-2026 hay dos, con nombres propios para no
// confundirlas nunca más:
//
//   · **Shalom PE**  — `api.shalom-api-peru.com`  → el titular (`shalom.ts`).
//   · **Shalom LAT** — `api.shalom-api.lat`       → la contingencia (este).
//
// El courier sigue siendo uno: `agency_name`/`tracking_courier` valen `SHALOM`
// venga la lectura de donde venga. Cuál proveedor respondió es un detalle de
// plomería que no cambia ni el pedido ni lo que ve el comprador.
//
// Este módulo es PURO a propósito —igual que `olva.ts` y `shalom-orders.ts`—:
// lo importan las Edge Functions Y `npm test`. Nada de Deno, nada de red; la
// key la resuelve cada función con su helper (`shalomLatApiKey` en `shalom.ts`).
//
// ⚠️ La doc de Shalom LAT publica los REQUESTS pero no las respuestas. Todo lo
// que lee este archivo lo hace por búsqueda defensiva —claves a cualquier
// profundidad, hitos o textos— en vez de asumir una forma exacta: si acertamos
// de más, mejor; si el proveedor mueve un campo, seguimos leyendo.

export const SHALOM_LAT_BASE = 'https://api.shalom-api.lat'

/** Mismos literales que `Phase` de tracking.ts (el nombre del front). */
export type TrackingPhase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (v: unknown): string => deaccent(String(v ?? '')).replace(/\s+/g, ' ').trim().toUpperCase()
const digitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')
const limpio = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()

// ─── Fase ────────────────────────────────────────────────────────────────────
// Dos lecturas, en este orden:
//   1. HITOS, si el proveedor los da como los da Shalom PE (clave → objeto).
//      Es determinista y es lo que preferimos.
//   2. TEXTOS, si solo hay descripciones (lo que hace Olva). Se miran únicamente
//      los VALORES string, nunca los nombres de campo: un `{"entregado": null}`
//      es un hito que NO ocurrió, y leer su clave lo daría por entregado.

const PHASE_BY_MILESTONE: [string, TrackingPhase][] = [
  ['entregado', 'ENTREGADO'],
  ['reparto', 'EN_DESTINO'],
  ['destino', 'EN_DESTINO'],
  ['transito', 'EN_TRANSITO'],
  ['origen', 'EN_ORIGEN'],
]

// `registrado` no está, en ninguna de las dos lecturas y en ningún proveedor:
// que la guía exista no dice dónde está el paquete, que puede seguir en nuestro
// almacén. Mapearlo borraría el hueco entre "emití la guía" y "la dejé en la
// agencia", que es donde se pierde la plata en contraentrega.
const PHASE_BY_TEXT: [TrackingPhase, RegExp][] = [
  ['ENTREGADO', /ENTREGAD/],
  ['EN_DESTINO', /EN DESTINO|AGENCIA DESTINO|DISPONIBLE|RECOJO|REPARTO|LISTO PARA/],
  ['EN_TRANSITO', /TRANSITO|TRASLADO|EN RUTA|DESPACHAD|SALIO/],
  ['EN_ORIGEN', /ORIGEN|ADMITID|RECEPCIONAD|EN AGENCIA/],
]

/** Los hitos que vengan marcados (clave conocida → objeto), a cualquier
 *  profundidad. Es también lo que se guarda como `status` para el chat. */
export function milestonesOf(payload: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  const conocidos = new Set([...PHASE_BY_MILESTONE.map(([m]) => m), 'registrado', 'demora'])
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase()
      if (conocidos.has(key) && isObj(raw) && !out[key]) out[key] = raw
      else visit(raw, depth + 1)
    }
  }
  visit(payload, 0)
  return out
}

/** Todos los VALORES de texto del payload, en mayúsculas y sin tildes. */
function textos(payload: unknown): string {
  const partes: string[] = []
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return
    if (typeof v === 'string') { partes.push(v); return }
    if (typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const raw of Object.values(v as Record<string, unknown>)) visit(raw, depth + 1)
  }
  visit(payload, 0)
  return norm(partes.join(' § '))
}

/** La fase más avanzada que el payload permita afirmar, o null. */
export function derivePhase(payload: unknown): TrackingPhase | null {
  const hitos = milestonesOf(payload)
  for (const [milestone, phase] of PHASE_BY_MILESTONE) {
    if (hitos[milestone]) return phase
  }
  const texto = textos(payload)
  for (const [phase, rule] of PHASE_BY_TEXT) {
    if (rule.test(texto)) return phase
  }
  return null
}

/** La fecha del hito `demora`, si el proveedor lo marcó. No es una fase: es una
 *  alerta que convive con cualquiera (un envío demorado sigue en tránsito). */
export function demoraOf(payload: unknown): string | null {
  const demora = milestonesOf(payload).demora
  if (!demora) return null
  for (const k of ['fecha', 'date', 'fecha_hora', 'datetime']) {
    const v = demora[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

// ─── Rastreo ─────────────────────────────────────────────────────────────────
// `POST /track` y `POST /track/batch` piden `orderNumber` (la guía) y
// `orderCode` (el código de 4). NO hay `ose_id` acá: una guía que solo tenga el
// id interno de Shalom PE no es rastreable por LAT, y el router no se la manda.

export interface LatTrackable { numero: string | null; codigo: string | null }

export const esRastreablePorLat = (t: LatTrackable): boolean =>
  /^\d{8,10}$/.test(digitos(t.numero)) && /^[A-Z0-9]{4}$/.test(String(t.codigo ?? '').trim().toUpperCase())

export function trackBody(t: LatTrackable): { orderNumber: string; orderCode: string } {
  return {
    orderNumber: digitos(t.numero),
    orderCode: String(t.codigo ?? '').trim().toUpperCase(),
  }
}

/**
 * El batch de LAT NO acepta un `custom_id` como el de Shalom PE, así que la
 * correlación se hace por el número de guía que venga en cada resultado. Se
 * busca a cualquier profundidad y por varios nombres: la doc no publica la
 * respuesta, y quedarse sin correlacionar es peor que buscar de más.
 */
export function numeroDeResultado(raw: unknown): string | null {
  const claves = ['ordernumber', 'numero', 'guia', 'nroguia', 'numeroguia', 'order_number']
  const found = new Map<string, string>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z_]/g, '')
      if ((typeof val === 'string' || typeof val === 'number')) {
        const s = digitos(val)
        if (s && !found.has(key)) found.set(key, s)
      } else visit(val, depth + 1)
    }
  }
  visit(raw, 0)
  for (const k of claves) {
    const v = found.get(k)
    if (v && /^\d{6,12}$/.test(v)) return v
  }
  return null
}

/** ¿Este resultado del batch dice que la guía no existe? */
export function esNoEncontrado(raw: unknown): boolean {
  return /NOT.?FOUND|NO (SE )?(ENCONTR|EXISTE)|SIN RESULTADOS|INEXISTENTE/.test(textos(raw))
}

// ─── Emitir la guía ──────────────────────────────────────────────────────────
// `POST /account/register` (individual). Obligatorios según su doc: instanceId,
// origen, destino, documento, name, firstname, lastname, phone. Mandamos además
// `content` (el tamaño, que es de donde sale la tarifa) y `clave` (la clave de
// retiro, la MISMA que elige el generador de Shalom PE).
//
// Diferencias con Shalom PE que importan al armar:
//   · No hay `person_id`: LAT siempre quiere los nombres, así que sin RENIEC no
//     se emite (registrar mal a alguien en la cuenta del cliente no se deshace).
//   · El tamaño viaja como TEXTO ("PAQUETE XS"), no como el id del catálogo de
//     la cuenta. Por eso LAT puede emitir aunque `GET /v1/products` de Shalom PE
//     no responda — que es justo uno de los casos de caída que cubre.
//   · `destino` va como string: su doc reserva el prefijo "0" para aéreo. No lo
//     usamos — Kross despacha por terrestre, el aéreo se cotiza aparte.

import type { ShalomSize } from './shalom-orders.ts'

/** Cómo se llama cada tamaño en el `content` de LAT. */
export const LAT_CONTENT: Record<ShalomSize, string> = {
  SOBRE: 'SOBRE',
  XXS: 'PAQUETE XXS',
  XS: 'PAQUETE XS',
  S: 'PAQUETE S',
  M: 'PAQUETE M',
  L: 'PAQUETE L',
  OTRA_MEDIDA: 'OTRA MEDIDA',
}

export interface LatGuideRequest {
  instanceId: string
  /** Ids de agencia (`ter_id`), los mismos de `src/data/agencies/shalom.json`. */
  originTerminalId: string | number
  destinyTerminalId: string | number
  size: ShalomSize | null
  receiver: {
    dni: string
    /** Nombres, apellido paterno y apellido materno — de RENIEC, nunca de
     *  partir un nombre por espacios. */
    name?: string | null
    lastName?: string | null
    surName?: string | null
    phone: string
  }
  pickupCode: string
}

export type LatBuildResult =
  | { ok: true; body: Record<string, unknown> }
  /** `faltan` se le muestra a Logística tal cual, igual que en Shalom PE. */
  | { ok: false; faltan: string[] }

const entero = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Valida y arma. Devuelve TODO lo que falta de una vez, no el primer error. */
export function buildLatRegisterPayload(r: LatGuideRequest): LatBuildResult {
  const faltan: string[] = []

  const instanceId = limpio(r.instanceId)
  const origen = entero(r.originTerminalId)
  const destino = entero(r.destinyTerminalId)
  const dni = digitos(r.receiver?.dni)
  const telefono = digitos(r.receiver?.phone).slice(-9)
  const name = norm(r.receiver?.name)
  const lastName = norm(r.receiver?.lastName)
  const surName = norm(r.receiver?.surName)

  if (!instanceId) faltan.push('instancia de Shalom LAT conectada')
  if (!origen) faltan.push('agencia de origen del producto')
  if (!destino) faltan.push('sede de recojo del pedido')
  if (!r.size) faltan.push('tamaño del paquete en el producto')
  if (!/^\d{8}$/.test(dni)) faltan.push('DNI del destinatario (8 dígitos)')
  if (!/^9\d{8}$/.test(telefono)) faltan.push('celular del destinatario (9 dígitos)')
  if (!(name && lastName && surName)) faltan.push('nombre y apellidos del destinatario (RENIEC)')
  if (!/^\d{4}$/.test(r.pickupCode)) faltan.push('clave de retiro válida')

  if (faltan.length) return { ok: false, faltan }

  return {
    ok: true,
    body: {
      instanceId,
      origen,
      // String a propósito: es lo que su doc muestra (el "0" delantero queda
      // reservado para aéreo, que no usamos).
      destino: String(destino),
      content: LAT_CONTENT[r.size as ShalomSize],
      documento: dni,
      name,
      firstname: lastName,
      lastname: surName,
      phone: Number(telefono),
      clave: r.pickupCode,
    },
  }
}

/**
 * Busca en `POST /account/pending-shipments` un envío ya creado para este DNI.
 *
 * Es la MISMA cuenta Shalom Pro que usa Shalom PE, y en eso está la gracia: los
 * pendientes de LAT también ven lo que emitió PE. Por eso esta consulta es la
 * reconciliación ANTES de emitir por contingencia — un timeout de PE no
 * significa que la guía no se creó, y emitir la segunda cuesta plata y manda un
 * paquete fantasma.
 */
export function buscarPendientePorDni(json: unknown, dni: string): { numero: string | null; codigo: string | null } | null {
  const buscado = digitos(dni)
  if (!/^\d{8}$/.test(buscado)) return null

  const candidatos: Record<string, unknown>[] = []
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    const o = v as Record<string, unknown>
    candidatos.push(o)
    for (const raw of Object.values(o)) visit(raw, depth + 1)
  }
  visit(json, 0)

  for (const o of candidatos) {
    // El envío es "de este DNI" si alguno de sus valores planos ES el documento
    // (no un pedazo de otro número: la comparación es exacta).
    const suyo = Object.entries(o).some(([k, v]) =>
      /doc|dni|documento/i.test(k) && digitos(v) === buscado)
    if (!suyo) continue
    const numero = numeroDeResultado(o)
    const codigo = codigoDeResultado(o)
    if (numero) return { numero, codigo }
  }
  return null
}

/** El código de 4 caracteres, por los nombres con que puede venir. */
export function codigoDeResultado(raw: unknown): string | null {
  const claves = ['ordercode', 'codigo', 'clave', 'order_code', 'codigoguia', 'securitycode']
  const found = new Map<string, string>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z_]/g, '')
      if (typeof val === 'string' || typeof val === 'number') {
        const s = String(val).trim().toUpperCase()
        if (s && !found.has(key)) found.set(key, s)
      } else visit(val, depth + 1)
    }
  }
  visit(raw, 0)
  for (const k of claves) {
    const v = found.get(k)
    if (v && /^[A-Z0-9]{4}$/.test(v)) return v
  }
  return null
}

// ─── Webhook ─────────────────────────────────────────────────────────────────
// LAT también empuja cambios de estado (PUT /webhooks devuelve un secreto HMAC
// una sola vez) pero su doc NO dice ni el nombre del header de firma ni el
// formato del digest. Se aceptan las dos formas que usa todo el mundo —y la de
// Shalom PE— sobre el CUERPO CRUDO:
//   · `t=<epoch>,v1=<hex>`  → HMAC de `t + "." + cuerpo` (formato Stripe/PE)
//   · `sha256=<hex>` o hex pelado → HMAC del cuerpo
// Todas se comparan en tiempo constante. Lo que NO se acepta es una firma que
// no valide: un webhook sin auth es una puerta abierta a mover pedidos ajenos.

export const LAT_SIGNATURE_HEADERS = [
  'x-shalom-signature', 'x-signature', 'x-hub-signature-256', 'x-webhook-signature',
]

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

const igualEnTiempoConstante = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifica la firma de un evento de Shalom LAT. `nowMs` entra por parámetro
 *  para poder probar la ventana anti-replay. */
export async function validLatSignature(
  raw: string, header: string | null, secret: string, nowMs: number = Date.now(),
): Promise<boolean> {
  const h = (header ?? '').trim()
  if (!h || !secret) return false

  // Formato con timestamp (el de Shalom PE): con ventana anti-replay de 5 min.
  if (/(^|,)\s*t=/.test(h) && /v1=/.test(h)) {
    const parts = Object.fromEntries(h.split(',').map(kv => {
      const i = kv.indexOf('=')
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    }))
    const t = parts.t, v1 = (parts.v1 ?? '').toLowerCase()
    if (!t || !v1) return false
    if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false
    return igualEnTiempoConstante(await hmacHex(secret, `${t}.${raw}`), v1)
  }

  // Digest pelado del cuerpo, con o sin prefijo de algoritmo.
  const v = h.replace(/^sha256=/i, '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(v)) return false
  return igualEnTiempoConstante(await hmacHex(secret, raw), v)
}

/** El secreto de firma que devuelve `PUT /webhooks`, venga con el nombre que
 *  venga (`signing_secret`, `secret`, `signingSecret`…). */
export function signingSecretOf(json: unknown): string | null {
  const claves = ['signingsecret', 'secret', 'webhooksecret', 'hmacsecret']
  const found = new Map<string, string>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 5 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '')
      if (typeof val === 'string' && val.trim().length >= 16 && !found.has(key)) found.set(key, val.trim())
      else if (val && typeof val === 'object') visit(val, depth + 1)
    }
  }
  visit(json, 0)
  for (const k of claves) {
    const v = found.get(k)
    if (v) return v
  }
  return null
}

/** Lo que un evento de LAT aporta al reflejo. Sin forma publicada: se lee con
 *  las mismas búsquedas defensivas que el resto del módulo. */
export interface LecturaLat {
  numero: string | null
  codigo: string | null
  phase: TrackingPhase | null
  /** Fecha cruda del hito `demora` ('' = marcado sin fecha), o null. */
  demora: string | null
  /** El `challenge` de un ping de verificación de propiedad, si lo trae. */
  challenge: string | null
}

export function lecturaDeEvento(event: unknown): LecturaLat {
  const data = isObj(event) && isObj((event as Record<string, unknown>).data)
    ? (event as Record<string, unknown>).data
    : event
  let challenge: string | null = null
  const visit = (v: unknown, depth: number) => {
    if (depth > 5 || !isObj(v)) return
    for (const [k, val] of Object.entries(v)) {
      if (k.toLowerCase() === 'challenge' && typeof val === 'string' && val) challenge ??= val
      else visit(val, depth + 1)
    }
  }
  visit(event, 0)
  return {
    numero: numeroDeResultado(data),
    codigo: codigoDeResultado(data),
    phase: derivePhase(data),
    demora: demoraOf(data),
    challenge,
  }
}

// ─── Instancias ──────────────────────────────────────────────────────────────
// LAT no manda las credenciales de Shalom Pro en cada request (como sí hace
// Shalom PE con `X-Shalom-Email/Password`): mantiene una **instancia** con la
// sesión persistida, que se crea una vez por marca y se loguea cuando caduca.
// El id de esa instancia es lo único que guardamos (`store_secrets
// .shalom_lat_instance_id`); la contraseña sigue viviendo donde ya vivía.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El `instanceId` de una respuesta de `POST /instances` o `GET /instances`. */
export function instanceIdOf(json: unknown): string | null {
  let porClave: string | null = null
  let cualquiera: string | null = null
  const visit = (v: unknown, depth: number) => {
    if (depth > 5 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && UUID.test(val.trim())) {
        const key = k.toLowerCase().replace(/[^a-z]/g, '')
        if ((key === 'instanceid' || key === 'id') && !porClave) porClave = val.trim()
        else cualquiera ??= val.trim()
      } else visit(val, depth + 1)
    }
  }
  visit(json, 0)
  return porClave ?? cualquiera
}

/** ¿`POST /instances/status` dice que la instancia YA tiene sesión en Shalom
 *  Pro? Sin forma publicada: se acepta cualquiera de las señales usuales. En la
 *  duda responde `false`, que solo cuesta un login de más — mientras que un
 *  `true` equivocado cuesta una emisión rechazada. */
export function sesionActiva(json: unknown): boolean {
  const s = JSON.stringify(json ?? null)
  if (/"(logged_?in|authenticated|connected|active|ready|has_?session)"\s*:\s*true/i.test(s)) return true
  return /"(status|state|session)"\s*:\s*"(active|connected|authenticated|logged_?in|ready|online)"/i.test(s)
}
