// ─── SALES ENGINE · Instrumentación del Checkout ─────────────────────────────
// Sin esto no hay CRO, solo opiniones. Hoy el proyecto no tiene capa de
// analítica (ni gtag, ni Pixel, ni PostHog), así que el sink por defecto es la
// consola y la interfaz queda lista para enchufar la real sin tocar la UI.
//
// Los eventos que más pesan en la decisión de producto:
//   pin_skipped  → el costo de conversión exacto del mapa. Con este número se
//                  decide si el pin se queda o se va.
//   coverage_checked → cuánta demanda a domicilio se pierde por ciudad; es el
//                  insumo para negociar cobertura con el courier.

import type { AgencyName, CheckoutStepId, CoverageResult, LocationType } from './types'

export type CheckoutEvent =
  | { name: 'checkout_opened' }
  | { name: 'step_viewed'; step: CheckoutStepId }
  | { name: 'step_completed'; step: CheckoutStepId; msOnStep: number }
  | { name: 'field_error'; field: string }
  | { name: 'location_selected'; locationType: LocationType }
  | { name: 'geo_optin_clicked' }
  | { name: 'geo_permission_result'; result: 'granted' | 'denied' | 'unavailable' }
  | { name: 'pin_adjusted' }
  /** Llegó al mapa y siguió sin colocar el pin. */
  | { name: 'pin_skipped' }
  | { name: 'coverage_checked'; place: string; result: CoverageResult }
  | { name: 'agency_selected'; agency: AgencyName }
  | { name: 'olva_branch_typed'; length: number }
  | { name: 'voucher_uploaded' }
  | { name: 'payment_verification_result'; result: 'MATCHED' | 'UNMATCHED' | 'TIMEOUT'; seconds: number }
  | { name: 'order_submitted'; orderId: string }
  | { name: 'order_failed'; orderId: string; reason: string }
  | { name: 'checkout_abandoned'; lastStep: CheckoutStepId }

/** Destino de los eventos. Se reemplaza por el real sin tocar los call sites. */
export interface AnalyticsSink {
  track(event: CheckoutEvent): void
}

const consoleSink: AnalyticsSink = {
  track(event) {
    const { name, ...props } = event
    if (import.meta.env.DEV) console.info(`[checkout] ${name}`, props)
  },
}

let sink: AnalyticsSink = consoleSink

/** Enchufa la capa real de analítica (Pixel, GA4, PostHog…). */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next
}

export function trackEvent(event: CheckoutEvent): void {
  try {
    sink.track(event)
  } catch {
    // La analítica NUNCA puede tumbar un checkout.
  }
}

/**
 * Cronómetro por paso, para `step_completed`. Se instancia una vez por sesión de
 * checkout y se le avisa cada vez que se entra a un paso.
 */
export function createStepTimer() {
  let currentStep: CheckoutStepId | null = null
  let enteredAt = 0

  return {
    enter(step: CheckoutStepId) {
      currentStep = step
      enteredAt = Date.now()
      trackEvent({ name: 'step_viewed', step })
    },
    complete() {
      if (currentStep === null) return
      trackEvent({ name: 'step_completed', step: currentStep, msOnStep: Date.now() - enteredAt })
    },
  }
}
