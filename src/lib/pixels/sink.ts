// ─── SALES ENGINE · Sink de analítica → Pixels de Meta + TikTok ──────────────
// Enchufa el bus de eventos del checkout (`AnalyticsSink` de
// src/lib/checkout/analytics.ts) a los pixels del navegador. Traduce cada
// `CheckoutEvent` al evento estándar de cada red para que la marca vea el
// embudo en SU Events Manager: dónde llegan y en qué etapa se quedan.
//
//   checkout_opened        → InitiateCheckout
//   step_completed{step:2} → AddToCart        (terminó datos + entrega)
//   order_submitted        → Lead / CompleteRegistration
//   (landing, aparte)      → ViewContent      (+ PageView lo hace el init)
//   (adelanto pagado)      → SOLO servidor, por CAPI — el navegador ya no está
//
// El `event_id` del Lead es `state.orderId` (= `checkout_id`), el MISMO que usa
// register-buyer al disparar el Lead server-side: Meta/TikTok deduplican los dos.
//
// Nunca lanza: la analítica jamás puede tumbar un checkout (analytics.ts:87).

import type { AnalyticsSink, CheckoutEvent } from '../checkout/analytics'

const CURRENCY = 'PEN'

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fallthrough */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Props por plataforma a partir del producto y (opcional) el valor. */
function buildProps(contentId: string | null, value?: number | null): {
  meta: Record<string, unknown>; tiktok: Record<string, unknown>
} {
  const meta: Record<string, unknown> = { currency: CURRENCY }
  const tiktok: Record<string, unknown> = { currency: CURRENCY }
  if (contentId) {
    meta.content_type = 'product'
    meta.content_ids = [contentId]
    tiktok.content_type = 'product'
    tiktok.contents = [{ content_id: contentId, content_type: 'product', quantity: 1 }]
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    meta.value = value
    tiktok.value = value
  }
  return { meta, tiktok }
}

function metaTrack(name: string, props: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined' || !window.fbq) return
  try { window.fbq('track', name, props, eventId ? { eventID: eventId } : undefined) } catch { /* ignore */ }
}

function tiktokTrack(name: string, props: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined' || !window.ttq) return
  try { window.ttq.track(name, props, eventId ? { event_id: eventId } : undefined) } catch { /* ignore */ }
}

export interface PixelSinkOptions {
  /** Id del producto de la landing, para `contents` / `content_ids`. */
  contentId?: string | null
}

/** Implementación de `AnalyticsSink` que emite a los pixels de Meta y TikTok. */
export class PixelSink implements AnalyticsSink {
  private readonly contentId: string | null

  constructor(opts: PixelSinkOptions = {}) {
    this.contentId = opts.contentId ?? null
  }

  track(event: CheckoutEvent): void {
    try { this.route(event) } catch { /* nunca rompe el checkout */ }
  }

  private route(event: CheckoutEvent): void {
    switch (event.name) {
      case 'checkout_opened': {
        const { meta, tiktok } = buildProps(this.contentId)
        const id = randomId()
        metaTrack('InitiateCheckout', meta, id)
        tiktokTrack('InitiateCheckout', tiktok, id)
        break
      }
      case 'step_completed': {
        // Terminar datos + entrega (paso 2) es la señal de intención más fuerte
        // antes del registro: es la etapa donde más se cae el embudo.
        if (event.step !== 2) break
        const { meta, tiktok } = buildProps(this.contentId)
        const id = randomId()
        metaTrack('AddToCart', meta, id)
        tiktokTrack('AddToCart', tiktok, id)
        break
      }
      case 'order_submitted': {
        const { meta, tiktok } = buildProps(this.contentId)
        metaTrack('Lead', meta, event.orderId)
        tiktokTrack('CompleteRegistration', tiktok, event.orderId)
        break
      }
      // El resto de eventos son diagnósticos internos del CRO; no van a los
      // pixels para no ensuciar el embudo que ve el anunciante.
    }
  }
}

/**
 * Vista de la landing: `ViewContent` en ambas redes. El `PageView` ya lo dispara
 * el init del pixel; esto agrega el producto visto, que es lo que arma el
 * público de "vieron el producto" para el retargeting.
 */
export function trackLandingView(contentId: string | null, value?: number | null): void {
  try {
    const { meta, tiktok } = buildProps(contentId, value)
    const id = randomId()
    metaTrack('ViewContent', meta, id)
    tiktokTrack('ViewContent', tiktok, id)
  } catch { /* nunca rompe la landing */ }
}
