import { toStage } from './order-stages'
import type { OrderStage } from './order-stages'
// ─── CONTRATO CENTRAL DEL CLIENTE (Core) ─────────────────────────────────────
// Fuente única de verdad que los 3 módulos (Sales / Logistics / Loyalty) leen y
// escriben. NO es una tabla: se ENSAMBLA en lectura desde `buyers` + `order_sessions`.
// Ver docs/00-CORE-ARCHITECTURE.md. Este archivo reemplaza al viejo src/types/index.ts
// (que era el modelo mock de seed.ts) para todo lo que toque datos reales.

export type PaymentMethod = 'YAPE_PLIN' | 'CONTRAENTREGA' | 'TARJETA'
/**
 * Cómo llega el pedido. Son TRES casos, no dos: el reparto a domicilio en
 * provincia no es ni un motorizado de Lima ni un recojo en mostrador.
 *
 * Existía solo como "no es agencia → Lima" y se colaba como pedido limeño: otro
 * courier, otros tiempos y otro costo, en el tablero equivocado. Antes casi no
 * pasaba porque la cobertura rara vez elegía domicilio fuera de Lima; con el
 * checkout B es una opción que el comprador marca a propósito.
 */
export type DispatchType =
  | 'MOTORIZADO_LIMA' | 'MOTORIZADO_PROVINCIA'
  | 'AGENCIA_PROVINCIA' | 'AGENCIA_LIMA'

/**
 * ¿Este pedido lo RECOGE el comprador, o se lo llevan?
 *
 * **La única definición de "es recojo" del repo**, y desde hoy vive en
 * `supabase/functions/_shared/despacho.ts`: el servidor no puede importar de
 * `src/`, así que el webhook de 360pay llevaba su propia copia escrita a mano —
 * la misma trampa que esta función existe para cerrar, un nivel más arriba.
 * Acá se reexporta para que el frontend la siga pidiendo donde siempre.
 *
 * Tener DOS ya costó: `order-tracking.ts` llevaba su propia lista sin
 * `AGENCIA_LIMA`, así que un recojo en Lima —lo único que vende Kross Shop hoy,
 * con el domicilio apagado— recibía la línea de vida del motorizado, no aparecía
 * en el mapa en vivo, y **descartaba en silencio las fases que Shalom sí estaba
 * reportando**.
 */
export { isPickupDispatch } from '../../supabase/functions/_shared/despacho.ts'
export type AgencyName = 'SHALOM' | 'OLVA' | 'OTRO'
export type ClosedBy = 'AI_CLOSER' | 'DIRECT_CHECKOUT'

/** Fases canónicas del envío (02-SMART-LOGISTICS §3). Mismo literal que el
 *  `TrackingPhase` de los servicios de tracking; aquí vive el del contrato. */
export type ShipmentPhase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'
/** Couriers con reflejo de tracking construido. */
export type ShipmentCourier = 'SHALOM' | 'OLVA'

// Etapas REALES del pedido (alineadas a order_sessions.stage)
// El tipo vive en `order-stages.ts` junto con el orden y las etiquetas: tenerlo
// aquí duplicado ya provocó que una pantalla mostrara un orden y otra, otro.
export type { OrderStage } from './order-stages'

// El objeto que define el spec (docs). Es la vista unificada del cliente + su pedido.
export interface MerchantCustomerSession {
  customer: {
    dni: string | null
    fullName: string | null
    phone: string | null
  }
  delivery: {
    lat: number | null
    lng: number | null
    addressText: string | null
    reference: string | null
    dispatchType: DispatchType
    agencyName?: AgencyName | null
    /** Id de la sede de recojo dentro de `agencyName` (§27.b). Con él, el chat
     *  puede decir A QUÉ agencia va el paquete en vez del distrito del
     *  comprador — que es otra cosa y ya se ve en su ficha. */
    agencyBranchId?: string | null
  }
  sale: {
    productId: string | null
    productName: string | null
    productPrice: number | null
    paymentMethod: PaymentMethod
    closedBy: ClosedBy
    stage: OrderStage
  }
  /** Envío por agencia con tracking por API. `null` = sin guía registrada.
   *  La fase dispara la cobranza del saldo al llegar a EN_DESTINO, pero NUNCA
   *  mueve `stage` sola: el pipeline lo avanza una persona. */
  shipment: {
    courier: ShipmentCourier
    /** Shalom rastrea por numero+codigo (u oseId); Olva por numero+year (YY). */
    ref: { numero: string | null; codigo: string | null; oseId: string | null; year: string | null }
    phase: ShipmentPhase | null
    phaseAt: string | null
    /** Alerta de demora del courier. NO es una fase: convive con cualquiera. */
    demoraAt: string | null
  } | null
  loyalty: {
    points: number
    pointsEarned: number
    nextReorderDate: string | null // derivado en Loyalty; null hasta que se calcule
  }
}

// Forma cruda que devuelve get-session (order_sessions) — solo lo que consumimos aquí.
export interface RawOrderSession {
  buyer_phone?: string | null
  buyer_name?: string | null
  product_id?: string | null
  product_name?: string | null
  product_price?: number | null
  stage?: string | null
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  payment_method?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
  closed_by?: string | null
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_codigo?: string | null
  tracking_ose_id?: string | null
  tracking_year?: string | null
  tracking_phase?: string | null
  tracking_phase_at?: string | null
  tracking_demora_at?: string | null
}

// Datos del comprador (buyers) que enriquecen la sesión.
export interface RawBuyer {
  document_number?: string | null
  nombre?: string | null
  phone?: string | null
  puntos?: number | null
}

// ─── LECTOR ÚNICO ─────────────────────────────────────────────────────────────
// Ensambla el estado central desde el pedido (+ opcionalmente el comprador). Todos
// los módulos deben leer la sesión por aquí, no armando su propia forma.
/**
 * Id de la sede de recojo del pedido. Vive acá y no repetido en cada pantalla
 * porque tiene una sutileza: los pedidos anteriores a `agency_branch_id` (§27.b
 * del esquema) guardan ese id dentro de `delivery_reference`, que es un texto
 * libre donde también caben referencias de puerta — por eso solo se acepta si
 * son puros dígitos. Devuelve `null` para las agencias sin listado (`OTRO`),
 * que es lo correcto: ahí no hay sede que resolver.
 */
export function pickupBranchIdOf(order: {
  agency_branch_id?: string | null
  delivery_reference?: string | null
}): string | null {
  if (order.agency_branch_id) return String(order.agency_branch_id)
  const ref = String(order.delivery_reference ?? '')
  return /^\d+$/.test(ref) ? ref : null
}

export function toCustomerSession(order: RawOrderSession, buyer?: RawBuyer | null): MerchantCustomerSession {
  const asStage = (s?: string | null): OrderStage =>
    toStage(s)

  return {
    customer: {
      dni: buyer?.document_number ?? null,
      fullName: buyer?.nombre ?? order.buyer_name ?? null,
      phone: buyer?.phone ?? order.buyer_phone ?? null,
    },
    delivery: {
      lat: order.address_lat ?? null,
      lng: order.address_lng ?? null,
      addressText: order.address ?? null,
      reference: order.delivery_reference ?? null,
      dispatchType: (order.dispatch_type as DispatchType) ?? 'MOTORIZADO_LIMA',
      agencyName: (order.agency_name as AgencyName) ?? null,
      agencyBranchId: pickupBranchIdOf(order),
    },
    sale: {
      productId: order.product_id ?? null,
      productName: order.product_name ?? null,
      productPrice: order.product_price ?? null,
      paymentMethod: (order.payment_method as PaymentMethod) ?? 'CONTRAENTREGA',
      closedBy: (order.closed_by as ClosedBy) ?? 'DIRECT_CHECKOUT',
      stage: asStage(order.stage),
    },
    shipment: order.tracking_courier
      ? {
          courier: order.tracking_courier as ShipmentCourier,
          ref: {
            numero: order.tracking_numero ?? null,
            codigo: order.tracking_codigo ?? null,
            oseId: order.tracking_ose_id ?? null,
            year: order.tracking_year ?? null,
          },
          phase: (order.tracking_phase as ShipmentPhase) ?? null,
          phaseAt: order.tracking_phase_at ?? null,
          demoraAt: order.tracking_demora_at ?? null,
        }
      : null,
    loyalty: {
      points: buyer?.puntos ?? 0,
      pointsEarned: 0,
      nextReorderDate: null,
    },
  }
}
