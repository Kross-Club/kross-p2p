// ─── SALES ENGINE · Fases del pago del checkout ──────────────────────────────
// Reducer PURO de la máquina que gobierna el submit en dos fases:
//
//   IDLE ─registro ok─▶ (sin cobro en línea) DONE paid:false
//        └────────────▶ ISSUING ─cupón ok─▶ AWAITING ─pagó─▶ DONE paid:true
//                          └─fallo───────▶ ISSUE_FAILED ─retry─▶ ISSUING
//                                             └──"que me escriban"──▶ DONE unpaid
//
// El cobro NO ocurre dentro de la llamada: se emite una orden de cobro (el
// cupón) y quien cobra es Yape, en otra app. La confirmación llega después, por
// webhook, y el front la ve por el polling del pedido. `AWAITING` es esa espera,
// y es el camino NORMAL, no el excepcional.
//
// Aquí vivió también la rama de Culqi, que era síncrona —la respuesta del cargo
// ya decía si el dinero entró— y traía tres estados propios: `CHARGING`,
// `CHARGE_FAILED` y `CONFIRMING` (red caída DESPUÉS de enviar el cargo, donde
// no se puede reintentar porque el dinero pudo salir). Se eliminó con el motor
// completo: 360pay es asíncrono de punta a punta y no necesita ninguno.
//
// Vive fuera del componente por dos razones: el pie sticky y los guards de
// doble-tap se deciden por la fase (no por `state.status`), y una máquina que
// mueve dinero se testea sin montar React. Invariantes que el reducer impone:
//   · desde ISSUING no se admite otra emisión (el doble tap muere aquí),
//   · el retry NUNCA re-registra: solo existe desde ISSUE_FAILED,
//   · un cupón que llega fuera de ISSUING se descarta: es la respuesta atrasada
//     de un intento anterior, y su enlace apunta a un cupón ya anulado.

import type { Proveedor } from '../../../supabase/functions/_shared/comision.ts'

interface OrderRef {
  token: string
  orderCode: string
  sessionId: string
  /** Por qué riel se cobra. Lo dijo el SERVIDOR al registrar; el modal lo
   *  sigue. `null` = sin cobro en línea. Viaja en la referencia porque el
   *  retry, que ocurre varios renders después, tiene que saber a qué servicio
   *  volver a llamar. */
  rail: Proveedor | null
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
  | ({ k: 'ISSUING' } & OrderRef)
  | ({ k: 'AWAITING'; coupon: CouponRef } & OrderRef)
  | ({ k: 'ISSUE_FAILED' } & OrderRef)
  | ({ k: 'DONE'; paid: boolean; unpaid?: boolean } & OrderRef)

export type PayPhaseEvent =
  | ({ type: 'REGISTERED_MANUAL' } & OrderRef)     // sin cobro en línea: a DONE
  | ({ type: 'REGISTERED_ONLINE' } & OrderRef)     // con riel: a emitir (cupón u orden)
  | { type: 'COUPON_ISSUED'; coupon: CouponRef }
  | { type: 'ISSUE_FAILED' }
  | { type: 'PAID' }                               // el polling vio MATCHED
  | { type: 'RETRY' }                              // solo desde ISSUE_FAILED
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
        ? { k: 'DONE', paid: false, token: ev.token, orderCode: ev.orderCode, sessionId: ev.sessionId, rail: null }
        : phase
    case 'REGISTERED_ONLINE':
      return phase.k === 'IDLE'
        ? { k: 'ISSUING', token: ev.token, orderCode: ev.orderCode, sessionId: ev.sessionId, rail: ev.rail }
        : phase
    case 'COUPON_ISSUED':
      // Solo desde ISSUING: un cupón que llega en cualquier otro estado es una
      // respuesta atrasada de un intento anterior, y pintar su enlace mandaría
      // al comprador a pagar un cupón que ya se anuló.
      return phase.k === 'ISSUING'
        ? { k: 'AWAITING', coupon: ev.coupon, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId, rail: phase.rail }
        : phase
    case 'ISSUE_FAILED':
      return phase.k === 'ISSUING'
        ? { k: 'ISSUE_FAILED', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId, rail: phase.rail }
        : phase
    case 'PAID':
      // Desde AWAITING (el camino normal) y también desde ISSUE_FAILED: el
      // cupón anterior pudo pagarse mientras se reintentaba, y decirle "falló"
      // a quien ya pagó es el peor final posible.
      return (phase.k === 'AWAITING' || phase.k === 'ISSUE_FAILED' || phase.k === 'ISSUING')
        ? { k: 'DONE', paid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId, rail: phase.rail }
        : phase
    case 'RETRY':
      // SOLO desde el estado de fallo: desde ISSUING sería el doble tap, y
      // desde AWAITING sería emitir un cupón nuevo teniendo uno vivo esperando
      // pago — y el banco cobra siempre el más antiguo.
      return phase.k === 'ISSUE_FAILED'
        ? { k: 'ISSUING', token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId, rail: phase.rail }
        : phase
    case 'GIVE_UP':
      return (phase.k === 'ISSUE_FAILED' || phase.k === 'AWAITING')
        ? { k: 'DONE', paid: false, unpaid: true, token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId, rail: phase.rail }
        : phase
    default:
      return phase
  }
}
