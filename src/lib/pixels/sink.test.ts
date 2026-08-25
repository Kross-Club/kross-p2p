import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PixelSink, trackLandingView } from './sink'

// Vitest corre en Node (sin jsdom): se stubea `window` con los pixels.
let fbq: ReturnType<typeof vi.fn>
let ttqTrack: ReturnType<typeof vi.fn>

beforeEach(() => {
  fbq = vi.fn()
  ttqTrack = vi.fn()
  ;(globalThis as unknown as { window: unknown }).window = { fbq, ttq: { track: ttqTrack } }
})
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('PixelSink', () => {
  it('checkout_opened → InitiateCheckout en ambas redes', () => {
    new PixelSink({ contentId: 'prod-9' }).track({ name: 'checkout_opened' })
    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', expect.objectContaining({
      currency: 'PEN', content_ids: ['prod-9'],
    }), expect.objectContaining({ eventID: expect.any(String) }))
    expect(ttqTrack).toHaveBeenCalledWith('InitiateCheckout', expect.objectContaining({
      currency: 'PEN', contents: [{ content_id: 'prod-9', content_type: 'product', quantity: 1 }],
    }), expect.objectContaining({ event_id: expect.any(String) }))
  })

  it('step_completed paso 2 → AddToCart; otros pasos no disparan', () => {
    const sink = new PixelSink({ contentId: 'prod-9' })
    sink.track({ name: 'step_completed', step: 1, msOnStep: 10 })
    expect(fbq).not.toHaveBeenCalled()
    sink.track({ name: 'step_completed', step: 2, msOnStep: 20 })
    expect(fbq).toHaveBeenCalledWith('track', 'AddToCart', expect.any(Object), expect.any(Object))
    expect(ttqTrack).toHaveBeenCalledWith('AddToCart', expect.any(Object), expect.any(Object))
  })

  it('order_submitted → Lead/CompleteRegistration con event_id = orderId (dedup con el servidor)', () => {
    new PixelSink({ contentId: 'prod-9' }).track({ name: 'order_submitted', orderId: 'uuid-abc' })
    expect(fbq).toHaveBeenCalledWith('track', 'Lead', expect.any(Object), { eventID: 'uuid-abc' })
    expect(ttqTrack).toHaveBeenCalledWith('CompleteRegistration', expect.any(Object), { event_id: 'uuid-abc' })
  })

  it('un evento no mapeado no toca los pixels', () => {
    new PixelSink().track({ name: 'field_error', field: 'dni' })
    expect(fbq).not.toHaveBeenCalled()
    expect(ttqTrack).not.toHaveBeenCalled()
  })

  it('sin window no lanza', () => {
    delete (globalThis as unknown as { window?: unknown }).window
    expect(() => new PixelSink().track({ name: 'checkout_opened' })).not.toThrow()
  })
})

describe('trackLandingView', () => {
  it('ViewContent en ambas redes con el producto', () => {
    trackLandingView('prod-9', 189)
    expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', expect.objectContaining({
      content_ids: ['prod-9'], value: 189, currency: 'PEN',
    }), expect.any(Object))
    expect(ttqTrack).toHaveBeenCalledWith('ViewContent', expect.objectContaining({
      value: 189, currency: 'PEN',
    }), expect.any(Object))
  })
})
