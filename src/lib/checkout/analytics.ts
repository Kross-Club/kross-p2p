// ─── SALES ENGINE · Instrumentación del Checkout ─────────────────────────────
// Sin esto no hay CRO, solo opiniones. Hoy el proyecto no tiene capa de
// analítica (ni gtag, ni Pixel, ni PostHog), así que el sink por defecto es la
// consola y la interfaz queda lista para enchufar la real sin tocar la UI.
//
// El evento que más pesa en la decisión de producto es `coverage_checked`: dice
// cuánta demanda a domicilio se pierde por distrito, y es el insumo para
// negociar cobertura con el courier.
//
// Los eventos de GPS y de pin quedaron fuera a propósito: el checkout ya no
// tiene mapa. La coordenada se captura después de la venta (AddressBar, en el
// chat del pedido), donde el comprador ya está comprometido.

import type { AgencyName, CheckoutStepId, CoverageResult, LocationType } from './types'

export type CheckoutEvent =
  | { name: 'checkout_opened' }
  | { name: 'step_viewed'; step: CheckoutStepId }
  | { name: 'step_completed'; step: CheckoutStepId; msOnStep: number }
  | { name: 'field_error'; field: string }
  | { name: 'location_selected'; locationType: LocationType }
  /** Veredicto de cobertura del distrito elegido. `place` = "Distrito, Provincia". */
  | { name: 'coverage_checked'; place: string; result: CoverageResult }
  /** Se le prometió domicilio y el distrito tiene zonas de distinto costo: es
   *  donde el distrito puede quedarse corto frente al polígono. */
  | { name: 'coverage_zoned_district'; place: string }
  | { name: 'agency_selected'; agency: AgencyName }
  // Variante B: qué eligió el comprador cuando SE LE PREGUNTÓ. Es la única
  // métrica que dice si valía la pena preguntarle — si casi todos eligen lo
  // mismo que la cobertura habría decidido sola, la variante no aporta.
  | { name: 'delivery_method_selected'; method: 'DOMICILIO' | 'AGENCIA' }
  | { name: 'olva_branch_typed'; length: number }
  /** Intentó salir con datos ingresados y se le ofreció el descuento. */
  | { name: 'exit_offer_shown'; step: CheckoutStepId }
  /** Aceptó el descuento y se quedó. Contra `exit_offer_shown` da la tasa de
   *  rescate; contra `order_submitted` dice si además terminó comprando. */
  | { name: 'exit_discount_applied'; amount: number }
  | { name: 'voucher_uploaded' }
  | { name: 'payment_verification_result'; result: 'MATCHED' | 'UNMATCHED' | 'TIMEOUT'; seconds: number }
  | { name: 'order_submitted'; orderId: string }
  | { name: 'order_failed'; orderId: string; reason: string }
  /** El cobro en línea, por separado del registro: son dos embudos. `stage`
   *  dice DÓNDE murió el que falló — token vencido ≠ sin saldo ≠ red. */
  | { name: 'culqi_charge_ok'; orderId: string; alreadyPaid: boolean }
  | { name: 'culqi_charge_failed'; orderId: string; stage: string; code?: string }
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
