// ─── SALES ENGINE · Fases del pago del checkout ──────────────────────────────
// Reducer PURO de la máquina que gobierna el submit en dos fases:
//
//   IDLE ─registro ok─▶ (sin Culqi) DONE paid:false      ← flujo actual intacto
//        └────────────▶ CHARGING ─ok─▶ DONE paid:true
//                          │ └─fallo─▶ CHARGE_FAILED ─retry─▶ CHARGING
//                          │                │ └─"que me escriban"─▶ DONE unpaid
//                          └─network_after─▶ CONFIRMING (sin retry: se consulta)
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

export type PayPhase =
  | { k: 'IDLE' }
  | ({ k: 'CHARGING' } & OrderRef)
  | ({ k: 'CHARGE_FAILED'; fail: CulqiFailure } & OrderRef)
  | ({ k: 'CONFIRMING' } & OrderRef)              // network_after: consultar, no cobrar
  | ({ k: 'DONE'; paid: boolean; unpaid?: boolean } & OrderRef)

export type PayPhaseEvent =
  | ({ type: 'REGISTERED_MANUAL' } & OrderRef)     // sin Culqi: directo a DONE
  | ({ type: 'REGISTERED_CULQI' } & OrderRef)      // con Culqi: a cobrar
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
      // SOLO desde CHARGE_FAILED: desde CHARGING sería el doble tap, y desde
      // CONFIRMING sería cobrar a ciegas un dinero que quizá ya salió.
      return phase.k === 'CHARGE_FAILED'
        ? { k: 'CHARGING', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'CONFIRMED':
      return phase.k === 'CONFIRMING'
        ? { k: 'DONE', paid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    case 'GIVE_UP':
      return (phase.k === 'CHARGE_FAILED' || phase.k === 'CONFIRMING')
        ? { k: 'DONE', paid: false, unpaid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
        : phase
    default:
      return phase
  }
}
