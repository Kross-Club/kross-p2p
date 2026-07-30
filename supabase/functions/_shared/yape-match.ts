// ─── SALES ENGINE · Regla de cruce pago ↔ pedido ─────────────────────────────
// El cruce ocurre en los DOS sentidos y con segundos de diferencia:
//
//   · el comprador yapea y DESPUÉS termina el pedido → el pago ya estaba guardado
//   · el comprador termina el pedido y DESPUÉS yapea → el pago llega al rato
//
// Las dos direcciones tienen que decidir igual, así que la regla vive aquí una
// sola vez y la usan `yape-ingest` y `register-buyer`. Funciones puras: se
// prueban sin base de datos.
//
// Jerarquía de la decisión, de fuerte a débil:
//   1. Código de seguridad tecleado por el comprador. Es lo único que no se
//      puede adivinar mirando el monto. Si calza, cuadra.
//   2. Monto, y SOLO si hay un único candidato. Con dos pedidos de S/10
//      esperando, elegir "el más antiguo" acierta la mitad de las veces — y la
//      otra mitad le da por pagado el pedido a quien no pagó.
//   3. Nada. Va a revisión humana con el motivo escrito.
//
// El NOMBRE nunca decide. En COD paga la mamá, el vecino o el esposo: rechazar
// por nombre distinto sería rechazar pagos reales. Solo se anota como aviso.

import { nameMatches } from './yape.ts'

export interface PendingOrder {
  id: string
  order_id: string
  buyer_name: string | null
  advance_amount: number | string | null
  /** Código que TECLEÓ el comprador al subir su comprobante. */
  advance_yape_code: string | null
}

export interface StoredPayment {
  id: string
  amount_pen: number | string | null
  sender_name: string | null
  security_code: string | null
}

export interface MatchDecision<T> {
  chosen: T | null
  /** Por qué no cuadró, o qué revisar aunque haya cuadrado. Nunca se le muestra
   *  al comprador: decirle "tu pago no existe" por un fallo nuestro es fatal. */
  reason: string | null
}

/** Dinero en céntimos: `10.1 - 10` no da 0 en punto flotante. */
const cents = (n: number | string | null | undefined): number => Math.round(Number(n ?? 0) * 100)

const code = (s: string | null | undefined): string => (s ?? '').trim()

/** Un pago recién llegado contra los pedidos que esperan adelanto. */
export function matchPaymentToOrders(
  payment: StoredPayment,
  orders: PendingOrder[],
): MatchDecision<PendingOrder> {
  const amount = cents(payment.amount_pen)
  const sameAmount = orders.filter(o => cents(o.advance_amount) === amount)

  const byCode = code(payment.security_code)
    ? sameAmount.find(o => code(o.advance_yape_code) === code(payment.security_code))
    : undefined
  if (byCode) return { chosen: byCode, reason: nameWarning(payment.sender_name, byCode.buyer_name) }

  if (sameAmount.length === 1) {
    return { chosen: sameAmount[0], reason: nameWarning(payment.sender_name, sameAmount[0].buyer_name) }
  }
  if (sameAmount.length > 1) {
    return { chosen: null, reason: `${sameAmount.length} pedidos esperan S/${money(payment.amount_pen)}: sin código no se puede decidir` }
  }
  return { chosen: null, reason: `Sin pedido pendiente por S/${money(payment.amount_pen)}` }
}

/** Un pedido recién creado contra los pagos que entraron y nadie consumió. */
export function matchOrderToPayments(
  order: PendingOrder,
  payments: StoredPayment[],
): MatchDecision<StoredPayment> {
  const amount = cents(order.advance_amount)
  const sameAmount = payments.filter(p => cents(p.amount_pen) === amount)

  const byCode = code(order.advance_yape_code)
    ? sameAmount.find(p => code(p.security_code) === code(order.advance_yape_code))
    : undefined
  if (byCode) return { chosen: byCode, reason: nameWarning(byCode.sender_name, order.buyer_name) }

  if (sameAmount.length === 1) {
    return { chosen: sameAmount[0], reason: nameWarning(sameAmount[0].sender_name, order.buyer_name) }
  }
  if (sameAmount.length > 1) {
    return { chosen: null, reason: `${sameAmount.length} pagos de S/${money(order.advance_amount)} sin asignar: los revisa una persona` }
  }
  return { chosen: null, reason: null } // lo normal: el pago todavía no llega
}

function nameWarning(fromYape: string | null, fromBuyer: string | null): string | null {
  if (!fromYape || !fromBuyer) return null
  return nameMatches(fromYape, fromBuyer)
    ? null
    : `Monto correcto pero el nombre no coincide (Yape: ${fromYape} · pedido: ${fromBuyer})`
}

const money = (n: number | string | null | undefined): string => String(Number(n ?? 0))
