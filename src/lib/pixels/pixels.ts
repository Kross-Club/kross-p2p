// ─── SALES ENGINE · Pixels de Meta + TikTok (cliente) ────────────────────────
// Carga los pixels de anuncios de la MARCA (multi-tenant: cada tienda trae sus
// propios IDs desde `stores`). Se inyecta el snippet estándar de `fbq` y `ttq`
// una sola vez, y solo si la marca tiene ID configurado. El navegador cubre el
// embudo (ViewContent → InitiateCheckout → AddToCart → Lead); el Purchase lo
// reporta el servidor por CAPI (ver supabase/functions/_shared/capi.ts), porque
// se confirma por webhook cuando el comprador ya se fue a Yape.
//
// Regla dura: los pixels NUNCA pueden tumbar la landing. Todo va con guardas y
// se salta en SSR. Ver docs/09-PIXELS-CAPI.md.

type AnyFn = (...args: unknown[]) => void

interface FbqStub extends AnyFn {
  callMethod?: AnyFn
  queue: unknown[]
  loaded?: boolean
  version?: string
  push?: unknown
}

interface TtqStub {
  push: AnyFn
  track: AnyFn
  page: AnyFn
  load: AnyFn
  methods?: string[]
  _i?: Record<string, unknown>
  [key: string]: unknown
}

declare global {
  interface Window {
    fbq?: FbqStub
    _fbq?: FbqStub
    ttq?: TtqStub
    TiktokAnalyticsObject?: string
  }
}

const FB_SRC = 'https://connect.facebook.net/en_US/fbevents.js'
const TT_SRC = 'https://analytics.tiktok.com/i18n/pixel/events.js'

let metaReady = false
let tiktokReady = false

function injectScript(src: string): void {
  const first = document.getElementsByTagName('script')[0]
  const el = document.createElement('script')
  el.async = true
  el.src = src
  if (first?.parentNode) first.parentNode.insertBefore(el, first)
  else document.head.appendChild(el)
}

/** Bootstrap de `fbq` idéntico al snippet oficial, en TypeScript (sin eval). */
function bootstrapMeta(): FbqStub {
  if (window.fbq) return window.fbq
  const fbq = function (this: unknown, ...args: unknown[]) {
    const n = fbq as FbqStub
    if (n.callMethod) n.callMethod(...args)
    else n.queue.push(args)
  } as FbqStub
  fbq.queue = []
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.push = fbq
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq
  return fbq
}

/** Bootstrap de `ttq` equivalente al snippet oficial de TikTok. */
function bootstrapTiktok(): TtqStub {
  if (window.ttq) return window.ttq
  window.TiktokAnalyticsObject = 'ttq'
  const ttq = [] as unknown as TtqStub
  const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once',
    'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']
  ttq.methods = methods
  const setAndDefer = (target: TtqStub, method: string) => {
    target[method] = (...args: unknown[]) => { (target as unknown as { push: AnyFn }).push([method, ...args]) }
  }
  for (const m of methods) setAndDefer(ttq, m)
  ttq.load = ((id: string) => {
    ttq._i = ttq._i || {}
    ttq._i[id] = []
    injectScript(`${TT_SRC}?sdkid=${encodeURIComponent(id)}&lib=ttq`)
  }) as AnyFn
  window.ttq = ttq
  return ttq
}

/** Enciende el pixel de Meta de la marca. Idempotente. */
export function initMeta(pixelId: string): void {
  if (metaReady || !pixelId || typeof window === 'undefined' || typeof document === 'undefined') return
  metaReady = true
  const fbq = bootstrapMeta()
  injectScript(FB_SRC)
  fbq('init', pixelId)
  fbq('track', 'PageView')
}

/** Enciende el pixel de TikTok de la marca. Idempotente. */
export function initTiktok(pixelId: string): void {
  if (tiktokReady || !pixelId || typeof window === 'undefined' || typeof document === 'undefined') return
  tiktokReady = true
  const ttq = bootstrapTiktok()
  ttq.load(pixelId)
  ttq.page()
}

export interface PixelIds {
  metaPixelId?: string | null
  tiktokPixelId?: string | null
}

/**
 * Enciende los pixels que la marca tenga configurados. Seguro de llamar en cada
 * montaje de la landing: las guardas internas evitan doble carga.
 */
export function initPixels({ metaPixelId, tiktokPixelId }: PixelIds): void {
  try {
    if (metaPixelId) initMeta(metaPixelId)
    if (tiktokPixelId) initTiktok(tiktokPixelId)
  } catch {
    // Un pixel jamás puede romper la página que vende.
  }
}

/** ¿Se cargó algún pixel? Lo usa el sink para no armar payloads en vano. */
export function anyPixelActive(): boolean {
  return metaReady || tiktokReady
}

// Solo para tests: reinicia las guardas de carga entre casos.
export function __resetPixelsForTest(): void {
  metaReady = false
  tiktokReady = false
}
