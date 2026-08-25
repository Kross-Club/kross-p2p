// ─── SALES ENGINE · CAPI (Conversions API de Meta + Events API de TikTok) ────
// Envío de conversiones SERVER-SIDE. El pixel del navegador (src/lib/pixels)
// cubre el embudo mientras el comprador está en la página; esto cubre lo que el
// navegador no puede: el Purchase se confirma por webhook cuando el comprador
// ya se fue a Yape, y muchos Lead se pierden por ad-blockers / iOS. CAPI los
// reporta igual, deduplicados con el navegador por `event_id`.
//
// Sin APIs exclusivas de Deno A PROPÓSITO (usa Web Crypto `crypto.subtle`, que
// existe también en Node): así el test corre bajo Vitest importando este módulo
// por ruta relativa — mismo patrón que `_shared/advance.ts` y `_shared/pay360.ts`.
//
// Regla dura del módulo: **el tracking nunca puede tumbar un cobro ni un
// registro.** `dispatchConversion` NUNCA lanza; el caller además la envuelve.
// Ver docs/09-PIXELS-CAPI.md.

// ─── Nombres de evento por plataforma ────────────────────────────────────────
// El mismo hecho de negocio tiene distinto nombre en cada red. Se mapea aquí,
// en un solo sitio, para que los callers hablen en conceptos (PURCHASE/LEAD).
export type ConversionEvent = 'PURCHASE' | 'LEAD'

export const META_EVENT: Record<ConversionEvent, string> = {
  PURCHASE: 'Purchase',
  LEAD: 'Lead',
}
export const TIKTOK_EVENT: Record<ConversionEvent, string> = {
  PURCHASE: 'CompletePayment',
  LEAD: 'CompleteRegistration',
}

// ─── Hashing de PII ──────────────────────────────────────────────────────────

/** SHA-256 en hex de un valor YA normalizado. Meta y TikTok exigen los datos de
 *  identidad (teléfono, nombre, external_id) hasheados con SHA-256. */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Normaliza (trim + lowercase) y hashea un dato de identidad de texto (nombre,
 *  email, id). Devuelve null si no hay nada que hashear — un hash de "" sería un
 *  dato falso que ensucia el match. */
export async function hashNormalized(value: string | null | undefined): Promise<string | null> {
  const norm = (value ?? '').trim().toLowerCase()
  if (!norm) return null
  return await sha256Hex(norm)
}

/**
 * Teléfono peruano a E.164 en dígitos (sin `+`), con código de país 51. Meta y
 * TikTok piden el número en formato internacional y sin símbolos ANTES de
 * hashear; un mismo número escrito de dos formas hashea distinto y no cruza.
 */
export function normalizePhonePE(phone: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^0+/, '')           // quita ceros de marcado a la izquierda
  if (d.startsWith('51')) return d    // ya trae el país
  if (d.length === 9) return '51' + d // celular local peruano (9 dígitos)
  return d                            // otro formato: se manda tal cual en dígitos
}

/** Teléfono normalizado a PE y hasheado. */
export async function hashPhonePE(phone: string | null | undefined): Promise<string | null> {
  const n = normalizePhonePE(phone)
  return n ? await sha256Hex(n) : null
}

// ─── Entrada común ───────────────────────────────────────────────────────────

export interface AdUserData {
  /** Crudo: se normaliza a PE y se hashea aquí dentro. */
  phone?: string | null
  /** Nombre para partir en fn/ln si no vienen por separado. */
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  /** Id estable del comprador (buyers.id). Se hashea. Une eventos de una persona. */
  externalId?: string | null
  // Identificadores del clic — NO se hashean.
  fbp?: string | null
  fbc?: string | null
  ttp?: string | null
  ttclid?: string | null
  clientIp?: string | null
  clientUserAgent?: string | null
}

export interface AdEventInput {
  eventId: string
  /** Epoch en ms. Default `Date.now()`. En tests se pasa fijo para determinismo. */
  eventTimeMs?: number
  sourceUrl?: string | null
  value?: number | null
  currency?: string
  /** Id del producto para `contents`. */
  contentId?: string | null
  /** Propiedades extra (p. ej. `order_value` = precio total del pedido). */
  custom?: Record<string, unknown>
  user: AdUserData
}

// ─── Helpers puros ───────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now()
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** fn/ln explícitos ganan; si no, se parten de `fullName`. */
function splitName(u: AdUserData): { fn: string | null; ln: string | null } {
  if (u.firstName || u.lastName) return { fn: u.firstName ?? null, ln: u.lastName ?? null }
  const parts = (u.fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { fn: null, ln: null }
  if (parts.length === 1) return { fn: parts[0], ln: null }
  return { fn: parts[0], ln: parts.slice(1).join(' ') }
}

/** Envuelve un hash en el array que espera Meta, u omite la clave si no hay dato. */
async function hashedArray(p: Promise<string | null>): Promise<string[] | undefined> {
  const v = await p
  return v ? [v] : undefined
}

/** Borra claves con valor undefined para no mandar ruido a la API. */
function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k]
  return obj
}

// ─── Builders ────────────────────────────────────────────────────────────────

/** Un evento en la forma de la Conversions API de Meta (`data[]`). */
export async function buildMetaEvent(kind: ConversionEvent, input: AdEventInput): Promise<Record<string, unknown>> {
  const u = input.user
  const { fn, ln } = splitName(u)
  const user_data = prune({
    ph: await hashedArray(hashPhonePE(u.phone)),
    fn: await hashedArray(hashNormalized(fn)),
    ln: await hashedArray(hashNormalized(ln)),
    external_id: await hashedArray(hashNormalized(u.externalId)),
    fbp: u.fbp ?? undefined,
    fbc: u.fbc ?? undefined,
    client_ip_address: u.clientIp ?? undefined,
    client_user_agent: u.clientUserAgent ?? undefined,
  })
  const custom_data: Record<string, unknown> = { currency: input.currency ?? 'PEN' }
  if (typeof input.value === 'number' && Number.isFinite(input.value)) custom_data.value = round2(input.value)
  if (input.contentId) {
    custom_data.content_type = 'product'
    custom_data.contents = [{ id: input.contentId, quantity: 1 }]
  }
  Object.assign(custom_data, input.custom ?? {})

  return prune({
    event_name: META_EVENT[kind],
    event_time: Math.floor((input.eventTimeMs ?? nowMs()) / 1000),
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.sourceUrl ?? undefined,
    user_data,
    custom_data,
  })
}

/** Un evento en la forma de la Events API v1.3 de TikTok (`data[]`). */
export async function buildTiktokEvent(kind: ConversionEvent, input: AdEventInput): Promise<Record<string, unknown>> {
  const u = input.user
  const user = prune({
    phone: (await hashPhonePE(u.phone)) ?? undefined,
    external_id: (await hashNormalized(u.externalId)) ?? undefined,
    ttp: u.ttp ?? undefined,
    ttclid: u.ttclid ?? undefined,
    ip: u.clientIp ?? undefined,
    user_agent: u.clientUserAgent ?? undefined,
  })
  const properties: Record<string, unknown> = { currency: input.currency ?? 'PEN' }
  if (typeof input.value === 'number' && Number.isFinite(input.value)) properties.value = round2(input.value)
  if (input.contentId) {
    properties.contents = [{ content_id: input.contentId, content_type: 'product', quantity: 1 }]
  }
  Object.assign(properties, input.custom ?? {})

  return prune({
    event: TIKTOK_EVENT[kind],
    event_time: Math.floor((input.eventTimeMs ?? nowMs()) / 1000),
    event_id: input.eventId,
    user,
    properties,
    page: input.sourceUrl ? { url: input.sourceUrl } : undefined,
  })
}

// ─── Envío (I/O fino, no se testea unitariamente — igual que pay360.getCoupon) ─

export interface SendResult {
  ok: boolean
  skipped?: boolean
  status?: number
  body?: string
  error?: boolean
}

/** POST a la Conversions API de Meta. */
export async function sendMetaCapi(
  pixelId: string, token: string, events: Record<string, unknown>[], testCode?: string,
): Promise<SendResult> {
  if (!pixelId || !token || events.length === 0) return { ok: false, skipped: true }
  const body: Record<string, unknown> = { data: events }
  if (testCode) body.test_event_code = testCode
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  const text = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) }
}

/** POST a la Events API v1.3 de TikTok. El token va en el header `Access-Token`. */
export async function sendTiktokCapi(
  pixelId: string, token: string, events: Record<string, unknown>[], testCode?: string,
): Promise<SendResult> {
  if (!pixelId || !token || events.length === 0) return { ok: false, skipped: true }
  const body: Record<string, unknown> = { event_source: 'web', event_source_id: pixelId, data: events }
  if (testCode) body.test_event_code = testCode
  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) }
}

// ─── Orquestación por tienda ─────────────────────────────────────────────────

export interface AdsConfig {
  metaPixelId?: string | null
  metaToken?: string | null
  metaTestCode?: string | null
  tiktokPixelId?: string | null
  tiktokToken?: string | null
  tiktokTestCode?: string | null
}

/** True si la tienda tiene al menos una plataforma lista para CAPI (pixel+token). */
export function hasAnyCapi(cfg: AdsConfig): boolean {
  return Boolean((cfg.metaPixelId && cfg.metaToken) || (cfg.tiktokPixelId && cfg.tiktokToken))
}

/**
 * Corre la promesa DESPUÉS de responder cuando el runtime lo permite
 * (`EdgeRuntime.waitUntil` de Supabase/Deno): así el envío a CAPI no le suma
 * latencia al registro ni al 2xx del webhook —360pay reintenta si no lo ve
 * rápido—. Sin `waitUntil` la deja correr sin await. Nunca lanza.
 */
export function runInBackground(p: Promise<unknown>): void {
  const safe = p.then(() => {}, (e) => { console.error('[capi] background:', String(e)) })
  try {
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
    if (er?.waitUntil) er.waitUntil(safe)
  } catch { /* sin waitUntil: queda como fire-and-forget */ }
}

/**
 * Dispara la conversión a las plataformas configuradas. **NUNCA lanza**:
 * cualquier error se traga con `console.error` y el flujo del caller sigue. Un
 * fallo de CAPI jamás puede voltear un pago ya confirmado ni un registro hecho.
 * Devuelve un resumen para el log del caller.
 */
export async function dispatchConversion(
  kind: ConversionEvent, cfg: AdsConfig, input: AdEventInput,
): Promise<{ meta?: SendResult; tiktok?: SendResult }> {
  const out: { meta?: SendResult; tiktok?: SendResult } = {}
  if (cfg.metaPixelId && cfg.metaToken) {
    try {
      const ev = await buildMetaEvent(kind, input)
      out.meta = await sendMetaCapi(cfg.metaPixelId, cfg.metaToken, [ev], cfg.metaTestCode ?? undefined)
    } catch (e) {
      console.error(`[capi] meta ${kind} falló:`, String(e))
      out.meta = { ok: false, error: true }
    }
  }
  if (cfg.tiktokPixelId && cfg.tiktokToken) {
    try {
      const ev = await buildTiktokEvent(kind, input)
      out.tiktok = await sendTiktokCapi(cfg.tiktokPixelId, cfg.tiktokToken, [ev], cfg.tiktokTestCode ?? undefined)
    } catch (e) {
      console.error(`[capi] tiktok ${kind} falló:`, String(e))
      out.tiktok = { ok: false, error: true }
    }
  }
  return out
}
