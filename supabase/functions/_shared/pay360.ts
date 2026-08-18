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
 * `amount` en SOLES (no céntimos) y `external_ref` es NUESTRA llave: ahí va el
 * id de la sesión del pedido, y es por donde el webhook vuelve a encontrarlo.
 * Es lo que hace el cruce determinístico, a diferencia del flujo manual, que
 * adivina por monto + código de 3 dígitos.
 */
export function createCoupon(
  base: string, apiKey: string,
  input: {
    amount: number
    external_ref: string
    customer_id?: string
    customer?: Record<string, unknown>
    description?: string
    expiry_date?: string
  },
): Promise<Pay360Result<Pay360Coupon>> {
  return request(`${base}/coupons`, apiKey, { method: 'POST', body: input })
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

// ─── Firma del webhook ───────────────────────────────────────────────────────
// El partner confirmó que se firma el BODY CRUDO. Por eso el handler tiene que
// leer `await req.text()` y verificar ANTES de parsear: si se re-serializa el
// JSON, cualquier diferencia de orden o espacios rompe la firma de un evento
// legítimo.

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

/** HMAC-SHA256 del body crudo, en hex. */
export async function signBody(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
}

/**
 * Verifica `X-360Pay-Signature`. Tolera el prefijo `sha256=` que usan varias
 * pasarelas y la firma pelada, porque el formato exacto no está documentado.
 *
 * ⚠️ Pendiente de confirmar contra un evento real: algoritmo (se asume
 * HMAC-SHA256) y codificación (se asume hex). Hasta entonces esta función NO
 * debe ser lo único que autoriza marcar un pedido como pagado — el webhook
 * re-consulta el cupón con `getCoupon`, igual que hace `culqi-webhook`.
 */
export async function verifySignature(
  secret: string, rawBody: string, header: string | null,
): Promise<boolean> {
  if (!secret || !header) return false
  const received = header.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(received)) return false
  return timingSafeEqual(await signBody(secret, rawBody), received)
}
