// ─── Contrato con el API de Flow ─────────────────────────────────────────────
// Fijado contra las diez páginas de developers.flow.cl leídas el 01-sep-2026
// (Primeros pasos, Quickstart, Flujo de integración, Creación / Estado /
// Confirmación / Finalización de orden, Comercios Asociados, Liquidaciones y
// Credenciales de prueba). Ver docs/12-FLOW.md.
//
// El modelo es un **checkout alojado con redirect**, no un cargo directo:
// `payment/create` devuelve `url` + `token`, el comercio manda al comprador a
// `url?token=…`, y ahí —en la página de Flow— es donde teclea su celular y su
// código de aprobación de Yape. Ninguna llamada de la API acepta el código.
// La confirmación llega por POST a `urlConfirmation` con SOLO el token, sin
// estado: el estado se pregunta con `payment/getStatus`.
//
// Tres trampas, de las que dos ya se pagaron en 360pay y una es nueva:
//   · **La firma es sobre los parámetros, no sobre el body.** Ordenados
//     alfabéticamente y concatenados `nombre+valor` sin separador, HMAC-SHA256
//     con la secret key, en el parámetro `s`. Distinto de 360pay, que firma el
//     body crudo con un timestamp.
//   · **El body va `application/x-www-form-urlencoded`**, no JSON. Un
//     `JSON.stringify` acá responde 4xx sin decir por qué.
//   · **La unidad de `amount` para PEN no está documentada**: los ejemplos son
//     CLP enteros. Vive en `montoParaFlow` para que sea UNA línea cuando el
//     sandbox lo confirme.
//
// REGLA DE LOGGING: por aquí pasan la API key y la secret key de plataforma.
// Ningún log lleva el body, la firma ni las llaves: solo `{ status, code }`.
//
// Sin APIs de Deno: este módulo lo typechequea también el build del front.

/** Bases por ambiente. El sandbox es host propio, no un prefijo de ruta. */
export const FLOW_HOSTS = {
  live: 'https://www.flow.cl/api',
  sandbox: 'https://sandbox.flow.cl/api',
} as const

export type FlowEnv = keyof typeof FLOW_HOSTS

export function flowBaseUrl(env: FlowEnv): string {
  return FLOW_HOSTS[env]
}

export interface FlowKeys {
  apiKey: string
  secretKey: string
}

/**
 * Las llaves del ambiente que toca.
 *
 * Son DOS juegos —sandbox y producción— y usar uno solo los confundiría en
 * silencio: una tienda marcada `live` cobrando contra sandbox no falla de forma
 * visible, simplemente nunca recibe el dinero. Y Flow tiene cuentas SEPARADAS
 * por ambiente (`sandbox.flow.cl/app/web/register.php`), así que acá no hay
 * fallback de `live` a `sandbox` como en 360pay: la de sandbox no vale en
 * producción y hacerla valer sería justo ese silencio.
 *
 * `trim()`: un espacio al final de la secret key firma distinto y Flow responde
 * un rechazo idéntico al de "firma mal armada".
 */
export function pickFlowKeys(env: FlowEnv, k: {
  sandboxKey: string; sandboxSecret: string; liveKey: string; liveSecret: string
}): FlowKeys {
  return env === 'live'
    ? { apiKey: k.liveKey.trim(), secretKey: k.liveSecret.trim() }
    : { apiKey: k.sandboxKey.trim(), secretKey: k.sandboxSecret.trim() }
}

// ─── Firma ───────────────────────────────────────────────────────────────────

/** Un parámetro que viaja. `undefined`/`null` NO viajan ni se firman: Flow
 *  firmaría "paymentMethodundefined" y rechazaría la orden. */
export type FlowParams = Record<string, string | number | boolean | null | undefined>

/** Los parámetros como strings, sin los vacíos, que es lo que se firma Y lo
 *  que se manda. Convertir dos veces —una para firmar y otra para el body—
 *  es la forma más fácil de que un `30000` se firme como `"30000"` y viaje
 *  como `"30000.00"`. */
export function normalizar(params: FlowParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    out[k] = String(v)
  }
  return out
}

/**
 * La cadena que se firma. VERIFICADA contra el ejemplo de la doc:
 *   { apiKey:'XXXX-XXXX-XXXX', currency:'CLP', amount:5000 }
 *   → "amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP"
 *
 * El orden es el de `Array.prototype.sort()` sin comparador, que es el mismo
 * que usan los tres ejemplos oficiales (`sort($keys)`, `keys.sort()`,
 * `keys.sort()`): por unidad de código, mayúsculas antes que minúsculas y `_`
 * después de las letras — `paymentMethod` va antes que `payment_currency`.
 */
export function cadenaAFirmar(params: Record<string, string>): string {
  return Object.keys(params).sort().map(k => k + params[k]).join('')
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA256 en hex, con WebCrypto (vale en Deno y en el navegador). */
export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

/** Los parámetros listos para viajar: normalizados y con su `s`. */
export async function firmar(params: FlowParams, secretKey: string): Promise<Record<string, string>> {
  const n = normalizar(params)
  const s = await hmacHex(secretKey, cadenaAFirmar(n))
  return { ...n, s }
}

// ─── Transporte ──────────────────────────────────────────────────────────────

/** Deno no pone timeout al fetch: sin esto una caída de Flow deja al comprador
 *  mirando el spinner, y vuelve a tocar mucho antes. */
const TIMEOUT_MS = 30_000

export interface FlowFailure {
  ok: false
  status: number
  error: string | null
  /**
   * No hubo respuesta: la orden PUDO haberse creado igual. El caller NO debe
   * reintentar a ciegas — si ya hay un token guardado se consulta su estado
   * antes de emitir otra. En Flow no hay "cupón más antiguo" que secuestre el
   * pago, pero una orden vieja que se pague después de que la fila apunte a la
   * nueva es un pago sin fila que lo conozca.
   */
  network?: true
}

export type FlowResult<T> = { ok: true; data: T } | FlowFailure

/**
 * Lee la respuesta. Flow responde JSON con 200 en el éxito; el error trae
 * `{ code, message }` con 4xx. Un 2xx que no sea un objeto se trata como error
 * de contrato, no como dato vacío — una orden sin `token` no es una orden.
 */
export function unwrap<T>(status: number, body: unknown): FlowResult<T> {
  if (!body || typeof body !== 'object') return { ok: false, status, error: null }
  const b = body as Record<string, unknown>
  if (status >= 200 && status < 300) return { ok: true, data: body as T }
  return {
    ok: false, status,
    error: typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : null,
  }
}

async function post<T>(url: string, body: Record<string, string>): Promise<FlowResult<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // El motivo no se loguea: el error de fetch de Deno puede arrastrar la URL.
    return { ok: false, status: 0, error: null, network: true }
  }
  const json = await res.json().catch(() => null)
  return unwrap<T>(res.status, json)
}

async function get<T>(url: string, query: Record<string, string>): Promise<FlowResult<T>> {
  let res: Response
  try {
    res = await fetch(`${url}?${new URLSearchParams(query).toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 0, error: null, network: true }
  }
  const json = await res.json().catch(() => null)
  return unwrap<T>(res.status, json)
}

// ─── Órdenes ─────────────────────────────────────────────────────────────────

export interface FlowOrderCreated {
  /** A dónde mandar al comprador: `url + "?token=" + token`. */
  url: string
  token: string
  flowOrder: number
  [k: string]: unknown
}

/** El enlace del checkout de Flow, armado como dice la doc. */
export function checkoutUrl(o: Pick<FlowOrderCreated, 'url' | 'token'>): string {
  return `${o.url}?token=${encodeURIComponent(o.token)}`
}

/**
 * Cuánto vive una orden antes de expirar, en segundos (`timeout`).
 *
 * Los mismos 30 días de `COUPON_TTL_DAYS` en 360pay, y por la misma razón: el
 * saldo es el cobro que llega tarde. En Flow una orden sin `timeout` "no
 * expirará", pero una orden eterna es una fila que nunca se puede dar por
 * vencida en el panel; 30 días le pone fecha.
 */
export const ORDER_TTL_S = 30 * 24 * 60 * 60

export function orderExpiryFrom(nowMs: number): string {
  return new Date(nowMs + ORDER_TTL_S * 1000).toISOString()
}

/**
 * El `amount` que se manda a Flow por un monto en SOLES.
 *
 * ⚠️ **No verificado contra el servicio real.** La doc solo muestra CLP en
 * enteros (`30000`); para PEN puede ser soles con decimales o céntimos. Es la
 * trampa de 360pay al revés —allá `Math.round(pen * 100)` cobraba cien veces
 * de más—, y vive en una función para que sea UNA línea cuando el sandbox lo
 * diga. Hasta entonces: soles con decimales, que es lo que hace 360pay y lo
 * que el texto "Monto de la orden" sugiere.
 */
export function montoParaFlow(pen: number): number {
  return Math.round(pen * 100) / 100
}

/**
 * El email que exige `payment/create`.
 *
 * El checkout no lo pide y meter un campo más en el paso del cobro cuesta
 * conversión: se sintetiza del celular, práctica normal en COD y la misma
 * decisión que ya tomó `culqi-charge`. El dominio es nuestro para que un
 * correo de Flow al "pagador" no rebote en un buzón ajeno.
 */
export function emailSintetico(phone: string | null | undefined, fallback: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '').slice(-9)
  return `${digits || fallback}@buyers.krossclub.app`
}

/**
 * Crea la orden. `commerceOrder` es NUESTRA llave: ahí va el id de la fila de
 * `cobros`, y no el de la sesión — un pedido tiene N cobros y cada uno es su
 * propia orden en Flow. `paymentMethod` manda al comprador directo a la
 * pantalla de Yape, sin el selector; `merchantId` hace que la plata vaya al
 * comercio asociado y no al integrador.
 */
export function crearOrden(
  base: string, keys: FlowKeys,
  input: {
    commerceOrder: string
    subject: string
    amount: number
    email: string
    urlConfirmation: string
    urlReturn: string
    currency?: string
    payment_currency?: string
    paymentMethod?: number
    merchantId?: string
    optional?: Record<string, unknown>
    timeout?: number
  },
): Promise<FlowResult<FlowOrderCreated>> {
  return firmar({
    apiKey: keys.apiKey,
    commerceOrder: input.commerceOrder,
    subject: input.subject,
    amount: input.amount,
    email: input.email,
    urlConfirmation: input.urlConfirmation,
    urlReturn: input.urlReturn,
    currency: input.currency,
    payment_currency: input.payment_currency,
    paymentMethod: input.paymentMethod,
    merchantId: input.merchantId,
    optional: input.optional ? JSON.stringify(input.optional) : undefined,
    timeout: input.timeout,
  }, keys.secretKey).then(body => post<FlowOrderCreated>(`${base}/payment/create`, body))
}

// ─── Estado ──────────────────────────────────────────────────────────────────

/** Los cuatro estados de `payment/getStatus`, tal cual los numera la doc. */
export const FLOW_STATUS = {
  PENDIENTE: 1,
  PAGADA: 2,
  RECHAZADA: 3,
  ANULADA: 4,
} as const

export interface FlowPaymentData {
  date?: string
  media?: string
  conversionDate?: string
  conversionRate?: number
  amount?: number
  currency?: string
  /** Lo que se quedó Flow. Es el desglose para `cobros.costo_pasarela_pen`. */
  fee?: number
  balance?: number
  transferDate?: string
  [k: string]: unknown
}

export interface FlowStatus {
  flowOrder?: number
  commerceOrder?: string
  requestDate?: string
  status?: number
  subject?: string
  currency?: string
  amount?: number
  payer?: string
  optional?: unknown
  pending_info?: unknown
  paymentData?: FlowPaymentData | null
  merchantId?: string | null
  [k: string]: unknown
}

/** La verdad sobre una orden. Es lo que se consulta al recibir el token del
 *  webhook —que no trae estado— y al volver el comprador. */
export function estadoPorToken(
  base: string, keys: FlowKeys, token: string,
): Promise<FlowResult<FlowStatus>> {
  return firmar({ apiKey: keys.apiKey, token }, keys.secretKey)
    .then(q => get<FlowStatus>(`${base}/payment/getStatus`, q))
}

/** ¿Está pagada? Única lectura del estado — `status === 2` y nada más. */
export function esPagada(s: Pick<FlowStatus, 'status'>): boolean {
  return Number(s.status) === FLOW_STATUS.PAGADA
}

/** ¿Ya no se puede pagar? Rechazada o anulada: hay que emitir otra. Una
 *  PENDIENTE se reutiliza —su enlace sigue vivo— en vez de duplicarla. */
export function esFinalSinPago(s: Pick<FlowStatus, 'status'>): boolean {
  const n = Number(s.status)
  return n === FLOW_STATUS.RECHAZADA || n === FLOW_STATUS.ANULADA
}

/**
 * El desglose que trae el estado, para el bloque §39.
 *
 * `fee` es lo que se quedó Flow. La comisión de Kross NO viene acá —se
 * configura por contrato y no aparece en `getStatus`—, así que `comision`
 * queda `null` a propósito: no se rellena con la tarifa. Confundir una
 * comisión medida con una estimada es el error que `order-money.ts` no se
 * permite con el dinero. Se concilia contra la liquidación
 * (`settlement/getByIdv2`), no contra el evento.
 */
export function desgloseDeFlow(
  pd: FlowPaymentData | null | undefined,
): { comision: number | null; costo: number | null } {
  const fee = pd && typeof pd.fee === 'number' && Number.isFinite(pd.fee) ? Math.round(pd.fee * 100) / 100 : null
  return { comision: null, costo: fee }
}

// ─── Comercios asociados (integrador) ────────────────────────────────────────

export interface FlowMerchant {
  id: string
  name?: string
  url?: string
  createdate?: string
  /** 0 pendiente de aprobación · 1 aprobado · 2 rechazado. La aprobación es
   *  manual de Flow — es el `pending_activation` de 360pay. */
  status?: number | string
  verifydate?: string | null
  [k: string]: unknown
}

export const FLOW_MERCHANT_STATUS = { PENDIENTE: 0, APROBADO: 1, RECHAZADO: 2 } as const

export function comercioAprobado(m: Pick<FlowMerchant, 'status'>): boolean {
  return Number(m.status) === FLOW_MERCHANT_STATUS.APROBADO
}

/** Da de alta la marca como comercio asociado bajo la cuenta de Kross. El
 *  `id` lo elegimos nosotros y es por el que se referencia después
 *  (`merchantId` en `payment/create`). */
export function crearComercio(
  base: string, keys: FlowKeys, input: { id: string; name: string; url: string },
): Promise<FlowResult<FlowMerchant>> {
  return firmar({ apiKey: keys.apiKey, id: input.id, name: input.name, url: input.url }, keys.secretKey)
    .then(body => post<FlowMerchant>(`${base}/merchant/create`, body))
}

// ─── La confirmación (webhook) ───────────────────────────────────────────────

/**
 * Lo que manda Flow a `urlConfirmation`: un POST `application/x-www-form-
 * urlencoded` con SOLO `token`. Sin firma que verificar en el POST entrante —
 * la autenticidad la da re-consultar el estado con nuestra secret key: un
 * token inventado no devuelve una orden pagada.
 */
export function tokenDelWebhook(rawBody: string): string | null {
  const t = new URLSearchParams(rawBody).get('token')
  return t && t.trim() ? t.trim() : null
}
