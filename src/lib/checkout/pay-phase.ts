// ─── SALES ENGINE · Fases del pago del checkout ──────────────────────────────
// Reducer PURO de la máquina que gobierna el submit en dos fases:
//
//   IDLE ─registro ok─▶ (manual) DONE paid:false         ← flujo actual intacto
//        └────────────▶ CHARGING ─ok─▶ DONE paid:true      ← Culqi (síncrono)
//                          │ └─fallo─▶ CHARGE_FAILED ─retry─▶ CHARGING
//                          │                │ └─"que me escriban"─▶ DONE unpaid
//                          └─network_after─▶ CONFIRMING (sin retry: se consulta)
//
// Y la rama de 360pay, que NO es simétrica y por eso vive aparte:
//
//   IDLE ─▶ ISSUING ─cupón ok─▶ AWAITING ─pagó─▶ DONE paid:true
//              └─fallo──────▶ ISSUE_FAILED ─retry─▶ ISSUING
//
// Con Culqi el cobro ocurre DENTRO de la llamada: la respuesta ya dice si entró.
// Con 360pay se emite una orden de cobro y quien cobra es Yape, en otra app; la
// confirmación llega por webhook. `AWAITING` es esa espera, y es el camino
// NORMAL, no el excepcional — de ahí que tenga su propio estado en vez de
// reusar `CONFIRMING`, que significa "el dinero pudo salir y hay que averiguar".
// Confundirlos haría que un pedido recién emitido se leyera como un cobro en
// duda.
//
// Vive fuera del componente por dos razones: el pie sticky y los guards de
// doble-tap se deciden por la fase (no por `state.status`), y una máquina que
// mueve dinero se testea sin montar React. Invariantes que el reducer impone:
//   · desde CHARGING no se admite otro cobro (el doble tap muere aquí),
//   · el retry NUNCA re-registra: solo existe desde CHARGE_FAILED,
//   · network_after va a CONFIRMING, que no tiene salida de reintento — solo
//     `CONFIRMED` (la consulta vio MATCHED) o `GIVE_UP` (asesor cobra).

import type { CulqiFailure } from './culqi-errors'

interface OrderRef {
  token: string
  orderCode: string
  sessionId: string
}

/** Lo que el comprador necesita para ir a pagar: el botón y el respaldo. */
export interface CouponRef {
  /** Enlace que abre Yape pre-llenado. Lo arma el SERVIDOR.
   *  `null` cuando 360pay no devuelve enlace y la plataforma no tiene los
   *  identificadores del servicio: el cupón sigue siendo pagable tecleando el
   *  código, así que esto oculta el botón, no rompe el cobro. */
  deeplink: string | null
  /** Código de pago, para tipearlo a mano si el enlace no abre (desktop). */
  consumerCode: string
  amountPen: number
}

export type PayPhase =
  | { k: 'IDLE' }
  | ({ k: 'CHARGING' } & OrderRef)
  | ({ k: 'ISSUING' } & OrderRef)
  | ({ k: 'AWAITING'; coupon: CouponRef } & OrderRef)
  | ({ k: 'ISSUE_FAILED' } & OrderRef)
  | ({ k: 'CHARGE_FAILED'; fail: CulqiFailure } & OrderRef)
  | ({ k: 'CONFIRMING' } & OrderRef)              // network_after: consultar, no cobrar
  | ({ k: 'DONE'; paid: boolean; unpaid?: boolean } & OrderRef)

export type PayPhaseEvent =
  | ({ type: 'REGISTERED_MANUAL' } & OrderRef)     // sin Culqi: directo a DONE
  | ({ type: 'REGISTERED_CULQI' } & OrderRef)      // con Culqi: a cobrar
  | ({ type: 'REGISTERED_PAY360' } & OrderRef)     // con 360pay: a emitir cupón
  | { type: 'COUPON_ISSUED'; coupon: CouponRef }
  | { type: 'ISSUE_FAILED' }
  | { type: 'PAID' }                               // el polling vio MATCHED
  | { type: 'CHARGE_OK' }
  | { type: 'CHARGE_FAILED'; fail: CulqiFailure }
  | { type: 'RETRY' }                              // solo desde CHARGE_FAILED
  | { type: 'CONFIRMED' }                          // la consulta vio MATCHED
  | { type: 'GIVE_UP' }                            // "prefiero que me escriban"

/**
 * ¿El pedido YA existe en la base?
 *
 * Todo lo que sigue a `IDLE` ocurre después de `register-buyer`: registrar es lo
 * PRIMERO que hace el submit, antes de cobrar. Cerrar el modal a partir de ahí
 * no es abandonar un carrito — es salir de una compra hecha. Por eso no se pide
 * confirmación, no se ofrece el descuento de salida (ofrecerle plata por algo
 * que ya compró, y devolverlo al paso 1, es la peor pantalla posible) y no se
 * cuenta como `checkout_abandoned`, que mediría abandonos donde hubo ventas.
 */
export function orderRegistered(phase: PayPhase): boolean {
  return phase.k !== 'IDLE'
}

export function payPhaseReducer(phase: PayPhase, ev: PayPhaseEvent): PayPhase {
  switch (ev.type) {
    case 'REGISTERED_MANUAL':
      return phase.k === 'IDLE'
        ? { k: 'DONE', paid: false, token: ev.token, orderCode: ev.orderCode, sessionId: ev.sessionId }
        : phase
    case 'REGISTERED_CULQI':
      return phase.k === 'IDLE'
        ? { k: 'CHARGING', token: ev.token, orderCode: ev.orderCode, sessionId: ev.sessionId }
        : phase
    case 'REGISTERED_PAY360':
      return phase.k === 'IDLE'
        ? { k: 'ISSUING', token: ev.token, orderCode: ev.orderCode, sessionId: ev.sessionId }
        : phase
    case 'COUPON_ISSUED':
      // Solo desde ISSUING: un cupón que llega en cualquier otro estado es una
      // respuesta atrasada de un intento anterior, y pintar su enlace mandaría
      // al comprador a pagar un cupón que ya se anuló.
      return phase.k === 'ISSUING'
        ? { k: 'AWAITING', coupon: ev.coupon, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'ISSUE_FAILED':
      return phase.k === 'ISSUING'
        ? { k: 'ISSUE_FAILED', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'PAID':
      // Desde AWAITING (el camino normal) y también desde ISSUE_FAILED: el
      // cupón anterior pudo pagarse mientras se reintentaba, y decirle "falló"
      // a quien ya pagó es el peor final posible.
      return (phase.k === 'AWAITING' || phase.k === 'ISSUE_FAILED' || phase.k === 'ISSUING')
        ? { k: 'DONE', paid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'CHARGE_OK':
      return (phase.k === 'CHARGING' || phase.k === 'CONFIRMING' || phase.k === 'CHARGE_FAILED')
        ? { k: 'DONE', paid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'CHARGE_FAILED': {
      if (phase.k !== 'CHARGING') return phase
      const ref = { token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
      return ev.fail.stage === 'network_after'
        ? { k: 'CONFIRMING', ...ref }
        : { k: 'CHARGE_FAILED', fail: ev.fail, ...ref }
    }
    case 'RETRY':
      // SOLO desde un estado de fallo: desde CHARGING/ISSUING sería el doble
      // tap, y desde CONFIRMING sería cobrar a ciegas un dinero que quizá ya
      // salió. Desde AWAITING tampoco: el cupón está vivo y esperando pago.
      if (phase.k === 'CHARGE_FAILED') {
        return { k: 'CHARGING', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
      }
      if (phase.k === 'ISSUE_FAILED') {
        return { k: 'ISSUING', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
      }
      return phase
    case 'CONFIRMED':
      return phase.k === 'CONFIRMING'
        ? { k: 'DONE', paid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'GIVE_UP':
      return (phase.k === 'CHARGE_FAILED' || phase.k === 'CONFIRMING'
        || phase.k === 'ISSUE_FAILED' || phase.k === 'AWAITING')
        ? { k: 'DONE', paid: false, unpaid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    default:
      return phase
  }
}
