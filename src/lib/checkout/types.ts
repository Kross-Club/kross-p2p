// ─── SALES ENGINE · Tipos del Checkout ───────────────────────────────────────
// Contrato del estado del checkout multi-paso. Se alinea con el estado central
// `MerchantCustomerSession` (src/lib/session.ts) — lo que aquí se captura es lo
// que Logistics entrega y Loyalty retiene. Ver docs/00-CORE-ARCHITECTURE.md.

import type { AgencyName, DispatchType, PaymentMethod } from '../session'

export type { AgencyName, DispatchType, PaymentMethod }

/** Identificador de pack. Los precios vienen del producto, no de la config. */
export type PackId = string

export type CheckoutStepId = 1 | 2 | 3

export type LocationType = 'LIMA' | 'PROVINCIA'

export type DeliveryMethod = 'DOMICILIO' | 'AGENCIA'

/**
 * Resultado de evaluar el punto del comprador contra la cobertura del courier.
 * - IN_ZONE     el motorizado llega a la puerta
 * - OUT_OF_ZONE fuera de cobertura → agencia
 * - BORDERLINE  dentro pero pegado al borde, o zona de visita semanal. Se ofrece
 *               agencia: prometer domicilio y fallar cuesta más que ofrecer
 *               agencia de más.
 * - NOT_CHECKED hay ciudad pero aún no se evaluó un punto
 */
export type CoverageResult = 'IN_ZONE' | 'OUT_OF_ZONE' | 'BORDERLINE' | 'NOT_CHECKED'

/** Cómo se determina la cobertura de una región. Configurable por región. */
export type CoverageMode =
  | 'DISTRICT' // cubierto o no según el distrito elegido; no necesita coordenadas
  | 'POLYGON'  // el courier llega a la ciudad pero no a todo el distrito

export type PaymentVerification = 'NOT_REQUIRED' | 'PENDING' | 'MATCHED' | 'UNMATCHED'

export type CheckoutStatus = 'DRAFT' | 'SUBMITTING' | 'SUBMITTED' | 'ERROR'

export interface CustomerInfo {
  dni: string
  whatsapp: string
  receiverName: string
}

export interface LimaAddress {
  district: string | null
  /** null permitido: en modo DISTRICT el pedido se cierra sin pin. */
  lat: number | null
  lng: number | null
  addressText: string
  reference: string
}

export interface ProvinciaConfig {
  /** Distrito elegido: es lo que DECIDE la cobertura. */
  department: string | null
  province: string | null
  district: string | null
  /** Ciudad/agencia del courier a la que pertenece el distrito (derivado). */
  city: string | null
  /** Tiempo de entrega declarado por el courier ("48h"). Derivado. */
  eta: string | null
  lat: number | null
  lng: number | null
  coverageResult: CoverageResult | null
  deliveryMethod: DeliveryMethod | null
  selectedAgency: AgencyName | null
  /** Solo Shalom: id de sede del listado oficial. */
  selectedAgencyBranchId: string | null
  /** Solo Olva: texto libre, marca el pedido para verificación manual. */
  olvaBranchText: string | null
  address?: { addressText: string; reference: string }
}

export interface PaymentVoucher {
  url: string
  uploadedAt: string
}

export interface PaymentState {
  verification: PaymentVerification
  matchedAt: string | null
  /** Por qué no hizo match — para la persona que valida, nunca para el comprador. */
  reason: string | null
}

/**
 * Estado completo del checkout. `advanceAmount`, `coverageResult`,
 * `deliveryMethod` y `needsLocationConfirmation` son DERIVADOS: los calcula el
 * reducer, nunca los setea la UI a mano.
 */
export interface CheckoutState {
  /** uuid generado al abrir el modal. Clave de idempotencia del pedido. */
  orderId: string
  step: CheckoutStepId
  selectedPack: PackId | null
  customerInfo: CustomerInfo
  locationType: LocationType | null
  limaAddress: LimaAddress | null
  provinciaConfig: ProvinciaConfig | null
  /** true si falta lat/lng o el resultado de cobertura es BORDERLINE. */
  needsLocationConfirmation: boolean
  paymentVoucher: PaymentVoucher | null
  /**
   * Código de seguridad de 3 dígitos que el comprador copia de su propio
   * comprobante de Yape. Es la **llave fuerte** del cruce automático: viaja
   * también en la notificación que le llega a la marca, así que es lo único que
   * permite decidir sin ambigüedad entre dos pedidos del mismo monto.
   */
  advanceYapeCode: string
  /** Derivado del destino Y de la agencia elegida. Nunca editable a mano. */
  advanceAmount: number
  /** Descuento de retención aplicado, en soles. Se resta de CADA pack. */
  discountPen: number
  /** Ya se le ofreció el descuento al intentar salir: no se insiste. */
  exitOfferShown: boolean
  status: CheckoutStatus
  payment: PaymentState
  /** Costo extra del courier por zona (recargo Aliclic). No lo paga el comprador. */
  courierSurcharge: number | null
  /** Aviso operativo de la zona ("entrega 1 vez por semana"), si lo hay. */
  deliveryNote: string | null
}

// ─── Cobertura ───────────────────────────────────────────────────────────────

export interface CoverageZone {
  label: string
  /** Recargo del courier en soles. `null` = hay recargo pero se desconoce cuánto. */
  surcharge: number | null
  /** El courier solo visita esta zona una vez por semana. */
  weekly: boolean
  /** Zona de ciudad piloto del courier. */
  pilot: boolean
  note: string | null
}

export interface CoverageCheck {
  result: CoverageResult
  /** Zona que contiene el punto, si cayó dentro de alguna. */
  zone: CoverageZone | null
  /** Distancia en metros al borde más cercano. */
  distanceToEdgeM: number | null
  /** Motivo legible del veredicto — se registra, no se muestra al comprador. */
  reason: string
}

/** Una opción del selector de distrito: todo el país, con su cobertura resuelta. */
export interface DistrictOption {
  department: string
  province: string
  district: string
  covered: boolean
  city: string | null
  weekly: boolean
  eta: string | null
}

/** Veredicto de cobertura por distrito — el que decide la rama del checkout. */
export interface DistrictCoverage {
  result: CoverageResult
  /** Ciudad/agencia del courier. */
  city: string | null
  /** Tiempo de entrega declarado por el courier ("48h"). */
  eta: string | null
  /** Tarifa base del courier en soles. Costo de la marca, no del comprador. */
  tariff: number | null
  /** El courier solo visita esta zona una vez por semana. */
  weekly: boolean
  /** Entrega restringida a días hábiles. */
  weekdaysOnly: boolean
  /** El tarifario da un rango: dentro del distrito hay zonas de distinto costo. */
  zoned: boolean
  /** Motivo legible del veredicto — se registra, no se le muestra al comprador. */
  reason: string
}

export interface CityCoverage {
  city: string
  covered: boolean
  mode: CoverageMode
  /** Centro para anclar el mapa `[lng, lat]`. */
  center: [number, number] | null
}

// ─── Agencias ────────────────────────────────────────────────────────────────

export interface AgencyBranch {
  id: string
  name: string
  district: string | null
  province: string
  department: string
  address: string
  /** `null` en las pocas sedes que la fuente publica sin coordenadas. Siguen
   *  siendo elegibles desde el listado buscable, solo no se ordenan por
   *  cercanía — descartarlas dejaría a esos distritos sin su agencia. */
  lat: number | null
  lng: number | null
}

/** Sede con distancia calculada. Solo la produce `getNearest`, así que aquí las
 *  coordenadas sí están garantizadas. */
export interface NearbyBranch extends AgencyBranch {
  lat: number
  lng: number
  distanceKm: number
}
