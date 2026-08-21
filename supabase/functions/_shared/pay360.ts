// ─── Contrato con el API de 360pay ───────────────────────────────────────────
// Fijado contra los OpenAPI oficiales (Public v1.1.0 y Partner v1.0.0) leídos el
// 18-ago-2026, más las respuestas del partner sobre lo que el spec no documenta.
// Ver docs/06-360PAY.md.
//
// El modelo NO es el de Culqi, y confundirlos cuesta dinero:
//
//   · Culqi COBRA: se le manda celular + OTP y la misma llamada dice si entró.
//   · 360pay EMITE una orden de cobro (el "cupón"). Quien cobra es Yape, vía su
//     deep link de pago de servicios. La confirmación llega por webhook.
//
// Tres trampas, todas ya pagadas por alguien:
//   · `amount` va en SOLES con decimales (150.5). Culqi va en céntimos. Un
//     `Math.round(pen * 100)` heredado cobraría CIEN VECES de más.
//   · `success: true` es del TRANSPORTE, no del pago. El estado real vive en
//     `data.status`. Tratarlos como lo mismo da pedidos por pagados sin un sol.
//   · El secreto de firma del webhook se muestra UNA sola vez, al crear el
//     negocio. Si no se captura ahí, toca rotarlo.
//
// REGLA DE LOGGING: por aquí pasa la llave de partner. Ningún log lleva el body,
// la llave ni el header de firma: solo `{ status, code }`.

/** Bases por ambiente. El sandbox es host propio, no un prefijo de ruta. */
export const PAY360_HOSTS = {
  live: 'https://api.360pay.pe',
  sandbox: 'https://sandbox.api.360pay.pe',
} as const

export type Pay360Env = keyof typeof PAY360_HOSTS

/** `public` = llave del NEGOCIO; `partner` = nuestra llave de partner. */
export type Pay360Api = 'public' | 'partner'

export function pay360BaseUrl(env: Pay360Env, api: Pay360Api): string {
  return `${PAY360_HOSTS[env]}${api === 'partner' ? '/partners/v1' : '/v1'}`
}


/**
 * Elige la llave de partner del ambiente que toca.
 *
 * Son DOS llaves distintas —pruebas y producción— y usar una sola las
 * confundiría en silencio: una tienda marcada `live` cobrando con la llave de
 * sandbox no falla de forma visible, simplemente nunca recibe el dinero.
 *
 * `live` cae a la de sandbox si no hay una propia, porque 360pay podría usar la
 * misma para ambos — el `pt_live_` de partner ya funcionó contra sandbox.
 *
 * Pura a propósito: este módulo lo typechequea también el build del front, así
 * que no puede tocar `Deno.env`. Cada Edge Function le pasa lo que leyó.
 */
export function pickPartnerKey(env: Pay360Env, sandboxKey: string, liveKey: string): string {
  // `trim()` no es cosmético: un espacio al final del secreto viaja dentro del
  // header y 360pay responde 401 — un fallo que se ve idéntico a "llave mala" y
  // manda a buscar donde no es. Pegar la llave con un espacio de más es lo más
  // fácil del mundo, y una API key nunca lleva espacios con significado.
  const sandbox = sandboxKey.trim()
  const live = liveKey.trim()
  return env === 'live' ? (live || sandbox) : sandbox
}

/** Deno no pone timeout al fetch: sin esto una caída de 360pay deja al
 *  comprador mirando el spinner, y vuelve a tocar mucho antes. */
const TIMEOUT_MS = 30_000

export interface Pay360Failure {
  ok: false
  status: number
  error: string | null
  /** Lo que el `403` dice que falta. Ahorra adivinar qué scope pedir. */
  requiredScopes?: string[]
  /**
   * No hubo respuesta: el cupón PUDO haberse creado igual. El caller NO debe
   * reintentar a ciegas — se busca por `external_ref` antes de emitir otro,
   * o el comprador termina con dos cupones y paga el que no era.
   */
  network?: true
}

export type Pay360Result<T> = { ok: true; data: T } | Pay360Failure

/**
 * Desenvuelve el sobre `{ success, data, message }`.
 *
 * `success: false` con HTTP 2xx es posible según el esquema de error, así que
 * NO alcanza con mirar `res.ok`: se exige el sobre bien formado. Y `data`
 * ausente en un supuesto éxito se trata como error de contrato, no como dato
 * vacío — un cupón sin `_id` no es un cupón.
 */
export function unwrap<T>(status: number, body: unknown): Pay360Result<T> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status, error: null }
  }
  const b = body as Record<string, unknown>
  if (b.success === true && b.data && typeof b.data === 'object') {
    return { ok: true, data: b.data as T }
  }
  const scopes = Array.isArray(b.required_scopes)
    ? b.required_scopes.filter((s): s is string => typeof s === 'string')
    : undefined
  return {
    ok: false,
    status,
    error: typeof b.error === 'string' ? b.error : null,
    ...(scopes?.length ? { requiredScopes: scopes } : {}),
  }
}

async function request<T>(
  url: string, apiKey: string, init: { method: string; body?: unknown },
): Promise<Pay360Result<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // El motivo no se loguea: el error de fetch de Deno puede arrastrar la URL.
    return { ok: false, status: 0, error: null, network: true }
  }
  const body = await res.json().catch(() => null)
  return unwrap<T>(res.status, body)
}

// ─── Clientes ────────────────────────────────────────────────────────────────
// Forma tomada de la respuesta REAL de `GET /customers/{id}`, no del spec.
// `coupon_code` y `payment_code` traen el mismo valor: el código de pago que
// definimos nosotros. Eso es lo que confirmó que el `consumerCode` del deeplink
// es el `coupon_code` y no el `payment_reference` del cupón.

export interface Pay360Customer {
  _id: string
  business_id?: string
  name?: string
  email?: string
  phone?: string
  document_type?: string
  document_number?: string
  coupon_code?: string
  payment_code?: string
  account_status?: number
  pending_coupons?: number
  [k: string]: unknown
}

// ─── Cupones ─────────────────────────────────────────────────────────────────

export interface Pay360Coupon {
  _id: string
  business_id?: string
  customer_id?: string
  coupon_code?: string
  /** Referencia de pago que devuelve el Partner API. */
  payment_reference?: string
  external_ref?: string
  amount?: number
  status?: string
  paid_at?: string
  payment_date?: string
  bank_tx_id?: string | null
  operation_number?: string | null
  fee_platform?: number | null
  fee_partner?: number | null
  [k: string]: unknown
}

/**
 * Cuánto vive un cupón antes de vencer.
 *
 * El OpenAPI declara `expiry_date` como OPCIONAL, pero el API real la exige
 * ("Missing required fields: expiry_date"). Es la clase de diferencia que solo
 * aparece contra el servicio de verdad, no leyendo el spec.
 *
 * 7 días y no 24 horas: el riesgo no es simétrico. Si vence muy pronto, quien
 * paga tarde se encuentra con un cupón muerto en Yape y un pedido a medias. Si
 * vence tarde no pasa nada, porque antes de emitir uno nuevo se anulan los
 * pendientes de ese comprador — o sea, nunca hay dos vivos compitiendo.
 */
export const COUPON_TTL_DAYS = 7

/** Fecha de vencimiento de un cupón emitido ahora. */
export function couponExpiryFrom(nowMs: number): string {
  return new Date(nowMs + COUPON_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * `amount` en SOLES (no céntimos) y `external_ref` es NUESTRA llave: ahí va el
 * id de la sesión del pedido, y es por donde el webhook vuelve a encontrarlo.
 * Es lo que hace el cruce determinístico, a diferencia del flujo manual, que
 * adivina por monto + código de 3 dígitos.
 *
 * `expiry_date` es OBLIGATORIO pese a lo que dice el spec — ver COUPON_TTL_DAYS.
 *
 * `code` también: el API responde "customer_id or code is required" si no va, y
 * NO le basta con el `coupon_code` anidado dentro de `customer` que documenta el
 * OpenAPI. Se mandan los dos —el de arriba identifica al cliente para este
 * cupón, el de adentro lo crea si no existe— porque son el mismo valor y omitir
 * cualquiera de los dos ya falló una vez.
 */
export function createCoupon(
  base: string, apiKey: string,
  input: {
    amount: number
    external_ref: string
    /** Código de pago del comprador, al nivel de arriba. Ver la nota de abajo. */
    code?: string
    customer_id?: string
    customer?: Record<string, unknown>
    description?: string
    expiry_date?: string
  },
): Promise<Pay360Result<Pay360Coupon>> {
  return request(`${base}/coupons`, apiKey, { method: 'POST', body: input })
}

/**
 * Crea el CLIENTE con sus datos reales.
 *
 * Existe porque `POST /coupons` con solo el `code` crea un cliente genérico
 * llamado **`Internal Customer`**, sin documento ni teléfono — el objeto
 * `customer` anidado que documenta el spec se ignora por completo (verificado
 * contra el cupón real `6a87c28e…`). Con veinte pedidos, el comercio ve veinte
 * clientes idénticos en su panel y no puede conciliar nada.
 *
 * Los campos son PLANOS y salen de la respuesta real de `GET /customers/{id}`,
 * no del spec. `coupon_code` es el mismo código de pago del comprador: es lo
 * que enlaza a este cliente con los cupones que se le emitan después.
 */
export function createCustomer(
  base: string, apiKey: string, input: {
    name: string
    coupon_code: string
    phone?: string
    email?: string
    document_type?: string
    document_number?: string
  },
): Promise<Pay360Result<Pay360Customer>> {
  return request(`${base}/customers`, apiKey, { method: 'POST', body: input })
}

/** La verdad sobre un cupón. Es lo que se consulta cuando el webhook no llegó,
 *  o para confirmar antes de dar un pedido por pagado. */
export function getCoupon(
  base: string, apiKey: string, id: string,
): Promise<Pay360Result<Pay360Coupon>> {
  return request(`${base}/coupons/${encodeURIComponent(id)}`, apiKey, { method: 'GET' })
}

/** Solo se anulan cupones activos (409 si no). Se usa para no dejar cupones
 *  viejos vivos: si el comprador reintenta, el anterior deja de ser pagable. */
export function annulCoupon(
  base: string, apiKey: string, id: string,
): Promise<Pay360Result<Pay360Coupon>> {
  return request(`${base}/coupons/${encodeURIComponent(id)}/annul`, apiKey, { method: 'PUT' })
}

/** ¿Este cupón está pagado? Única lectura del estado — jamás mirar `success`. */
export function isPaid(coupon: Pick<Pay360Coupon, 'status'>): boolean {
  return String(coupon.status ?? '').toLowerCase() === 'paid'
}

// ─── Alta de negocio (Partner API) ───────────────────────────────────────────

export interface Pay360BusinessCreated {
  business_id: string
  payment_prefix?: string
  config_id?: string
  hook_ids?: string[]
  /** Se devuelven UNA sola vez. Van a `store_secrets`, jamás a `stores`. */
  hook_signing_secrets?: Array<{ hook_id: string; signing_secret: string }>
  [k: string]: unknown
}

/**
 * Crea el negocio y sus webhooks en la MISMA llamada, que es la única forma de
 * recibir `hook_signing_secrets`. Crear el negocio primero y los hooks después
 * obliga a rotar para conocer el secreto.
 *
 * La respuesta viene con doble sobre: `{success, data:{success, business_id…}}`.
 * `unwrap` quita el de afuera; `business_id` vive en el de adentro.
 */
export function createBusiness(
  base: string, apiKey: string,
  input: {
    business: { name: string; email?: string; payment_prefix?: string }
    config: Record<string, unknown>
    hooks?: Array<{ type: string; url: string; active?: boolean }>
  },
): Promise<Pay360Result<Pay360BusinessCreated>> {
  return request(`${base}/businesses`, apiKey, { method: 'POST', body: input })
}

// ─── Deep link de pago de servicios de Yape ──────────────────────────────────
// Esto NO está en el OpenAPI: es un mecanismo de Yape, no un endpoint de
// 360pay. Es lo que convierte "anda a pagar tu cupón" en un botón.
//
// Es un universal link `https://`, no el `yape://` que se eliminó del checkout
// por no abrir nada (ver el encabezado de YapeBox.tsx). La diferencia importa:
// Android e iOS resuelven este, y si la app no está instalado cae en una página
// web en vez de en la pantalla de error del navegador.

export const YAPE_SERVICES_PAY_URL = 'https://www.yape.com.pe/app/services-pay/pickService'

/**
 * Identidad del servicio **360Pay** dentro del catálogo de Yape.
 *
 * Son constantes del RECAUDADOR, no de cada marca — que es justo lo que el
 * partner quiso decir con *"son internos, no los mapees"* (§15 del doc). Quien
 * distingue a la marca no es el `serviceId` sino el **prefijo del código de
 * pago**: `KSH…` es Kross Shop.
 *
 * Verificado contra el deeplink que **Cobrana**, otro partner de 360pay,
 * entrega a sus compradores: mismos dos GUIDs, mismo logo, mismo `name`, y lo
 * único distinto es el prefijo del código (`LSV…` el suyo). No son secretos:
 * viajan en una URL que se le da al comprador.
 *
 * Van como valor por defecto y no como configuración obligatoria porque una
 * tienda nueva no debería nacer sin botón de pago. `PAY360_YAPE_COMPANY_ID` y
 * `PAY360_YAPE_SERVICE_ID` siguen mandando si 360pay algún día los cambia:
 * se rota por secreto, sin desplegar.
 */
export const YAPE_360PAY = {
  companyId: '1E6B58C0-32C5-4575-B1B4-FA1AAECD5EBB',
  serviceId: 'A274CCCE-B6ED-48C8-8E61-D1D2D383C87E',
  logo: 'https://staceu2yapefrntp10.blob.core.windows.net/$web/bill-payment/companies/360pay/360pay.png',
} as const

/**
 * Arma el enlace que abre Yape con el servicio y el código ya puestos.
 *
 * El monto NO viaja en la URL: lo resuelve Yape leyendo el cupón, del lado del
 * servidor. Es la propiedad de seguridad que más vale de este flujo — el
 * comprador no puede editarlo (confirmado con el partner), así que no hay forma
 * de pagar S/1 un adelanto de S/25 manipulando el enlace.
 */
export function yapeDeeplink(input: {
  companyId: string
  serviceId: string
  consumerCode: string
  name?: string
  logo?: string
}): string {
  const q = new URLSearchParams({
    companyId: input.companyId,
    serviceId: input.serviceId,
    consumerCode: input.consumerCode,
    origin: 'deeplink-externo',
    origin_detail: 'tercero-web',
  })
  if (input.name) q.set('name', input.name)
  if (input.logo) q.set('logo', input.logo)
  return `${YAPE_SERVICES_PAY_URL}?${q.toString()}`
}

// ─── Código de pago (`consumerCode`) ─────────────────────────────────────────
// Confirmado con el partner: identifica al **CLIENTE**, no al cupón, y lo
// definimos nosotros. Formato: prefijo del negocio (3) + sufijo, **14 en total**
// como máximo (ejemplos reales: `TED1234`, `TED46558912`, `TED19478876653`).
//
// Dos decisiones que no son de estilo:
//
// · **Solo dígitos en el sufijo.** El spec dice "alfanumérico", pero los tres
//   ejemplos del partner son numéricos y esto termina tecleado en un flujo de
//   pago de servicios bancario. Si después se confirma que aceptan letras, se
//   amplía sin romper códigos ya emitidos; al revés no.
// · **Derivado por HMAC, no del teléfono ni del DNI.** Lo evidente era
//   `prefijo + celular`: estable, único y legible. Pero el código se teclea en
//   Yape y devuelve los cupones pendientes de ese cliente — o sea, quien
//   adivine un código ve cuánto debe esa persona y a qué marca. Con el celular
//   como código, adivinarlo es saber un número que medio mundo tiene. El HMAC
//   con el secreto de la tienda mantiene la estabilidad y quita la adivinanza.

export const CONSUMER_CODE_MAX = 14
export const CONSUMER_CODE_PREFIX_LEN = 3

/**
 * Código de pago del comprador. **Estable por comprador**: el mismo `buyerKey`
 * da siempre el mismo código, que es justo lo que hace falta cuando el mismo
 * cliente vuelve a comprar — 360pay lo resuelve al mismo `customer`.
 *
 * `buyerKey` debe identificar al comprador DENTRO de la tienda (id de buyer, o
 * `store_id:celular`). `secret` es de la tienda y nunca sale del servidor.
 */
export async function consumerCodeFor(
  prefix: string, secret: string, buyerKey: string,
): Promise<string> {
  const p = prefix.trim().toUpperCase().slice(0, CONSUMER_CODE_PREFIX_LEN)
  if (p.length !== CONSUMER_CODE_PREFIX_LEN) {
    throw new Error('consumerCodeFor: el prefijo del negocio es de 3 caracteres')
  }
  const digits = CONSUMER_CODE_MAX - p.length
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(buyerKey)),
  )
  // Se consumen bytes hasta llenar los dígitos: tomar el entero de los primeros
  // 8 bytes pasaría por Number y perdería precisión sobre 2^53.
  let out = ''
  for (let i = 0; out.length < digits; i++) out += (mac[i % mac.length] % 10).toString()
  return p + out
}

export function isValidConsumerCode(code: string): boolean {
  return /^[A-Z0-9]{4,14}$/.test(code) && code.length <= CONSUMER_CODE_MAX
}

/**
 * ¿El cupón trae su propio enlace de pago?
 *
 * El partner pidió NO mapear `companyId`/`serviceId` — son internos suyos. La
 * lectura sana de eso es que el enlace debería salir de ellos, no armarse de
 * nuestro lado con identificadores que no nos toca conocer. El esquema declara
 * `additionalProperties: true`, así que puede venir un campo que el OpenAPI no
 * lista, y hoy no se puede comprobar: el negocio está en `pending_activation`
 * hasta que se firme el contrato.
 *
 * Por eso se BUSCA en vez de asumir. Si aparece, gana sobre el enlace que
 * armamos nosotros; si no, `yapeDeeplink` sigue siendo el camino. Se prueba una
 * lista corta de nombres plausibles: fallar por el nombre del campo sería
 * fallar por una letra.
 */
export function paymentUrlOf(coupon: Record<string, unknown>): string | null {
  for (const k of ['payment_url', 'payment_link', 'deeplink', 'deep_link', 'yape_url', 'checkout_url']) {
    const v = coupon[k]
    if (typeof v === 'string' && v.startsWith('https://')) return v
  }
  return null
}

// ─── Firma del webhook ───────────────────────────────────────────────────────
// Headers que manda 360pay (documentados):
//
//   X-360Pay-Event-Id     id ESTABLE del evento → idempotencia
//   X-360Pay-Delivery-Id  cambia entre reintentos → NO sirve para deduplicar
//   X-360Pay-Hook-Id      qué hook lo originó → con qué secreto verificar
//   X-360Pay-Timestamp    fecha ISO **usada para firmar**
//   X-360Pay-Signature    HMAC-SHA256 en formato `sha256=<hex>`
//   X-360Pay-Attempt      número de intento
//
// El `Event-Id` es el que va al `dedupe_key` de `payment_events`: deduplicar por
// `Delivery-Id` no deduplica nada, porque cada reintento trae uno nuevo y el
// mismo pago entraría tantas veces como intentos haga 360pay.

export const PAY360_HEADERS = {
  eventId: 'X-360Pay-Event-Id',
  deliveryId: 'X-360Pay-Delivery-Id',
  hookId: 'X-360Pay-Hook-Id',
  timestamp: 'X-360Pay-Timestamp',
  signature: 'X-360Pay-Signature',
  attempt: 'X-360Pay-Attempt',
} as const

/** Ventana de replay. Una firma válida es válida para siempre: sin esto, quien
 *  capture un evento legítimo puede re-enviarlo cuando quiera. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60_000

/**
 * Qué se firma. El header de fecha se documenta como *"usada para firmar el
 * payload"*, así que la fecha entra en la cadena — firmar solo el body dejaría
 * el timestamp sin proteger y el replay abierto.
 *
 * VERIFICADO contra el ejemplo oficial de `/docs/webhooks`:
 *   crypto.createHmac('sha256', signingSecret).update(timestamp + '.' + rawBody)
 * y la ventana que usan es `Math.abs(now - timestamp) > 5 * 60 * 1000`, o sea
 * acotada por ambos lados — igual que `SIGNATURE_TOLERANCE_MS`.
 */
export function signedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`
}

/** Comparación en tiempo constante: un `===` sobre firmas filtra, por el
 *  tiempo que tarda en fallar, cuántos bytes iniciales acertó quien prueba. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA256 en hex de una cadena cualquiera. */
export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

export interface SignatureCheck {
  ok: boolean
  /** Por qué falló — para el log del servidor, jamás para una respuesta. */
  reason?: 'no_secret' | 'no_signature' | 'no_timestamp' | 'bad_format' | 'stale' | 'mismatch'
}

/**
 * Verifica `X-360Pay-Signature` contra el body CRUDO.
 *
 * El handler tiene que llamar a esto con `await req.text()` y ANTES de parsear:
 * re-serializar el JSON cambia orden y espacios, y rompe la firma de un evento
 * legítimo.
 *
 * `nowMs` se inyecta para poder testear la ventana de replay sin reloj falso.
 */
export async function verifySignature(
  secret: string,
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null },
  nowMs: number = Date.now(),
): Promise<SignatureCheck> {
  if (!secret) return { ok: false, reason: 'no_secret' }
  if (!headers.signature) return { ok: false, reason: 'no_signature' }
  if (!headers.timestamp) return { ok: false, reason: 'no_timestamp' }

  const received = headers.signature.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(received)) return { ok: false, reason: 'bad_format' }

  const ts = Date.parse(headers.timestamp)
  if (Number.isNaN(ts)) return { ok: false, reason: 'no_timestamp' }
  // Se acota por ambos lados: un timestamp del futuro es tan sospechoso como
  // uno viejo, y sin el límite superior bastaría con adelantarlo para que la
  // firma capturada no venza nunca.
  if (Math.abs(nowMs - ts) > SIGNATURE_TOLERANCE_MS) return { ok: false, reason: 'stale' }

  const expected = await hmacHex(secret, signedPayload(headers.timestamp, rawBody))
  return timingSafeEqual(expected, received) ? { ok: true } : { ok: false, reason: 'mismatch' }
}
