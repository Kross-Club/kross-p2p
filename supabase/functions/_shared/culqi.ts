// ─── Contrato con el API de Culqi ────────────────────────────────────────────
// Lo comparten `culqi-charge` (camino principal) y `culqi-webhook` (red de
// seguridad). Fijado contra el CÓDIGO FUENTE de los SDKs oficiales
// (culqi-php/python/ruby/go/java), no contra blogs:
//
//   · El token Yape se crea en secure.culqi.com con la llave PÚBLICA — y se
//     puede crear server-to-server: todos los SDKs oficiales son de servidor.
//     Por eso la PWA no carga ningún script de Culqi: el navegador solo manda
//     celular + código de aprobación a `culqi-charge`.
//   · El cargo va a api.culqi.com con la llave SECRETA, `email` es obligatorio
//     y `source_id` acepta tokens `ype_` de primera clase, SIN order previo.
//   · Éxito = HTTP 2xx + `object === 'charge'`. Jamás mirar `paid` ni
//     `outcome`: el sandbox devuelve `paid:false` incluso en ventas exitosas.
//
// REGLA DE LOGGING: por aquí pasan las llaves de la marca y el celular + OTP
// del comprador. Ningún log lleva el request completo, ni la llave, ni el
// body: solo `{ status, code, charge_id }`. Un console.error descuidado en la
// pantalla del cobro es una filtración, no un log.

export const CULQI_SECURE = 'https://secure.culqi.com/v2'
export const CULQI_API = 'https://api.culqi.com/v2'

/** Deno no pone timeout al fetch: sin esto, una caída de Culqi deja al
 *  comprador mirando el spinner minutos, y vuelve a tocar mucho antes. */
const TIMEOUT_MS = 30_000

export interface CulqiError {
  object?: 'error'
  type?: string
  code?: string
  /** La respuesta real usa `decline_code`; algún parser antiguo, `declined_code`. */
  decline_code?: string
  declined_code?: string
  charge_id?: string
  merchant_message?: string
  user_message?: string
  param?: string
}

export interface CulqiCharge {
  object: 'charge'
  id: string                       // chr_...
  amount: number                   // céntimos
  currency_code: string
  email?: string
  metadata?: Record<string, string>
  total_fee?: number               // céntimos, si viene
  source?: unknown                 // PII (celular del pagador) — se recorta al persistir
  outcome?: unknown
  [k: string]: unknown
}

export type CulqiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: CulqiError }
  | { ok: false; status: 0; error: null; network: true }

async function post<T>(url: string, key: string, body: unknown): Promise<CulqiResult<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // El motivo exacto no se loguea aquí: el error de fetch de Deno puede
    // arrastrar la URL con material sensible. El caller sabe qué etapa falló.
    return { ok: false, status: 0, error: null, network: true }
  }
  const data = await res.json().catch(() => null)
  if (res.ok && data && typeof data === 'object') return { ok: true, data: data as T }
  return { ok: false, status: res.status, error: (data ?? {}) as CulqiError }
}

/** POST secure/tokens/yape con la llave PÚBLICA. `amount` en céntimos. */
export function createYapeToken(pk: string, input: {
  amount: number
  number_phone: string
  otp: string
  metadata?: Record<string, string>
}): Promise<CulqiResult<{ id: string }>> {
  return post(`${CULQI_SECURE}/tokens/yape`, pk, input)
}

/** POST api/charges con la llave SECRETA. Éxito = 2xx + object 'charge'. */
export async function createCharge(sk: string, input: {
  amount: number
  currency_code: 'PEN'
  email: string
  source_id: string
  description?: string
  metadata?: Record<string, string>
}): Promise<CulqiResult<CulqiCharge>> {
  const r = await post<CulqiCharge>(`${CULQI_API}/charges`, sk, input)
  if (r.ok && r.data.object !== 'charge') {
    // 2xx sin objeto charge no es un éxito: se trata como error de contrato.
    return { ok: false, status: 200, error: r.data as unknown as CulqiError }
  }
  return r
}

/** GET api/charges/{id} con la SK — la ÚNICA verdad que el webhook acepta.
 *  Un cargo forjado o de otra cuenta da 404 con la llave de la tienda: esa es
 *  la verificación de autenticidad real (Culqi no firma sus webhooks). */
export async function getCharge(sk: string, chargeId: string): Promise<CulqiResult<CulqiCharge>> {
  let res: Response
  try {
    res = await fetch(`${CULQI_API}/charges/${encodeURIComponent(chargeId)}`, {
      headers: { Authorization: `Bearer ${sk}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 0, error: null, network: true }
  }
  const data = await res.json().catch(() => null)
  if (res.ok && data?.object === 'charge') return { ok: true, data: data as CulqiCharge }
  return { ok: false, status: res.status, error: (data ?? {}) as CulqiError }
}

/** El charge tal como se persiste en `payment_events.raw`: sin `source`, que
 *  trae el celular del pagador. La fila ya guarda la PII que necesitamos
 *  (amount, ids); el resto no se acumula. */
export function chargeForStorage(charge: CulqiCharge): Record<string, unknown> {
  const { source: _source, ...rest } = charge
  return rest
}

/** Código de decline, tolerando ambas grafías observadas. */
export function declineCodeOf(err: CulqiError | null): string | undefined {
  return err?.decline_code ?? err?.declined_code ?? err?.code
}

/** Máximo de `merchant_message` que entra al log. Es texto enlatado de Culqi;
 *  el corte solo evita que una respuesta rara infle la línea. */
const LOG_MSG_MAX = 300

/** Lo que de un error de Culqi SÍ se puede loguear: su propio diagnóstico.
 *  Nunca nuestro request — ni la llave, ni el celular, ni el OTP.
 *
 *  Existe porque el motivo NO siempre viaja en `code`. El 400 que devuelve un
 *  comercio sin permiso de API directa trae el porqué entero en `type` +
 *  `merchant_message` y `code` ausente: loguear `{status, code}` imprimía
 *  `{400, null}`, que costó una tarde de diagnóstico a ciegas.
 *
 *  `merchant_message` lo redacta Culqi PARA el comercio (a diferencia de
 *  `user_message`, que es para el pagador). Va a los logs de la función y SOLO
 *  ahí: jamás a `payment_reason` ni a un mensaje `sellers`, que pueden acabar
 *  frente al comprador por `get-session?viewer=seller`. */
export function errorForLog(status: number, err: CulqiError | null): Record<string, unknown> {
  return {
    status,
    type: err?.type ?? null,
    code: err?.code ?? null,
    decline_code: err?.decline_code ?? err?.declined_code ?? null,
    param: err?.param ?? null,
    charge_id: err?.charge_id ?? null,
    merchant_message: err?.merchant_message?.slice(0, LOG_MSG_MAX) ?? null,
  }
}

// ─── Parseo defensivo del webhook ────────────────────────────────────────────
// Culqi entrega el evento en (al menos) tres formas observadas en la calle:
//   1. { type: 'charge.creation.succeeded', data: '{"id":"chr_..."}' }  ← data STRING
//   2. { type: '...', data: { id: 'chr_...' } }                          ← data objeto
//   3. { object: 'charge', id: 'chr_...' }                               ← charge crudo
// Nada de esto se usa como verdad: solo para extraer el id y re-consultar.
// Puros y testeables desde vitest (mismo patrón que _shared/yape.ts).

function webhookData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.data === 'string') {
    try { return JSON.parse(p.data) as Record<string, unknown> } catch { return null }
  }
  if (p.data && typeof p.data === 'object') return p.data as Record<string, unknown>
  if (p.object === 'charge') return p
  return null
}

export function extractWebhookChargeId(payload: unknown): string | null {
  const d = webhookData(payload)
  const id = d?.id
  return typeof id === 'string' && /^chr_[A-Za-z0-9_]+$/.test(id) ? id : null
}

export function extractWebhookStoreId(payload: unknown): string | null {
  const d = webhookData(payload)
  const meta = d?.metadata
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  const v = m.kross_store_id ?? m.KROSS_STORE_ID
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
