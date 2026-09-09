// ─── Lo que la tarjeta del pedido le dice al comprador — PURO ────────────────
//
// El chat del comprador (`/p/:token`) tenía seis bloques fijos antes del hilo:
// la cabecera con «Ver pedido», el tracker de etapas, la dirección, el envío
// con su propia barra y el saldo. Dos barras de progreso decían casi lo mismo
// y el chat —para lo que existe esa pantalla— quedaba en unos 130 px.
//
// Desde el 09-set-2026 es UNA tarjeta con tres cosas: qué pedido es, en qué
// paso va y UNA acción, la que toca ahora. Este módulo decide las dos últimas
// a partir de los `pasos` del ticket (`buildTicket`, los mismos que pinta
// «Así va tu pedido» en `/pedido/:token`) y del pedido: así el chat y la página
// hermana nunca dicen cosas distintas del mismo envío. Sin React, para poder
// probarlo.

import type { TicketStep } from './checkout/ticket'
import { stageVigente } from './order-stages'
import { isPickupDispatch } from './session'
import { puedePagarSaldo } from './order-money'
import type { PedidoConPlata } from './order-money'

export interface PedidoDeLaTarjeta extends PedidoConPlata {
  status?: string | null
  stage?: string | null
  dispatch_type?: string | null
  address_verified?: boolean | null
  /** Llega al comprador solo cuando ya no debe nada (`get-session`). */
  shalom_pickup_code?: string | null
  payment_provider?: string | null
}

/** La ÚNICA acción de la tarjeta. Nunca dos botones. */
export type AccionDeLaTarjeta = 'gps' | 'saldo' | 'clave' | null

export interface EstadoDeLaTarjeta {
  /** Cómo se pinta el punto: en marca mientras avanza, verde al llegar, rojo
   *  cuando el pedido se cerró sin entregar. */
  tono: 'activo' | 'entregado' | 'cerrado'
  titulo: string
  detalle?: string
  /** El color de cada tramo de la barra; `null` cuando no hay recorrido que
   *  enseñar (cancelado, anulado, cerrado sin entregar). */
  pasos: TicketStep['estado'][] | null
  accion: AccionDeLaTarjeta
  /** Bajo el botón de pagar: qué trae pagar. */
  notaDePago?: string
}

/** Índices de los pasos del ticket, para no comparar etiquetas. */
const RECOJO = { EN_CAMINO: 2, LLEGO: 3 } as const
const DOMICILIO = { PREPARANDO: 1 } as const

export function estadoDeLaTarjeta(p: PedidoDeLaTarjeta, pasos: TicketStep[]): EstadoDeLaTarjeta {
  const esRecojo = isPickupDispatch(p.dispatch_type)

  // Cierres. Sin barra: un recorrido que ya no va a ninguna parte no
  // tranquiliza a nadie. El chat sigue abierto para retomar la venta.
  if (p.status === 'cancelado') {
    return { tono: 'cerrado', titulo: 'Pedido cancelado', detalle: 'Si quieres retomarlo, escríbenos por aquí.', pasos: null, accion: null }
  }
  if (p.status === 'anulado') {
    return { tono: 'cerrado', titulo: 'Pedido anulado', detalle: 'Este pedido quedó sin efecto. Si es un error, escríbenos por aquí.', pasos: null, accion: null }
  }
  const etapa = stageVigente(p.stage)
  if (etapa === 'no_entregado') {
    return {
      tono: 'cerrado',
      titulo: 'Pedido cerrado',
      detalle: 'Este pedido se cerró sin entregarse. Si quieres retomarlo, escríbenos por aquí y lo vemos al toque.',
      pasos: null, accion: null,
    }
  }

  // Entregado: lo dice la etapa (la marca una persona) o el courier (todos
  // los pasos hechos). Ya no hay nada que hacer, y la clave ya no abre nada.
  const entregado = etapa === 'entregado' || (pasos.length > 0 && pasos.every(s => s.estado === 'hecho'))
  if (entregado) {
    return {
      tono: 'entregado',
      titulo: 'Pedido entregado',
      detalle: '¿Todo bien con tu pedido? Escríbenos por aquí.',
      pasos: pasos.length ? pasos.map(() => 'hecho') : null,
      accion: null,
    }
  }

  const i = pasos.findIndex(s => s.estado === 'actual')
  const actual = i >= 0 ? pasos[i] : pasos[pasos.length - 1]
  if (!actual) return { tono: 'activo', titulo: 'Tu pedido', pasos: null, accion: null }

  // La acción, por prioridad. A domicilio, sin la dirección verificada no hay
  // entrega que valga: va antes que el saldo (que ahí se paga en la puerta
  // igual). En recojo, con saldo se paga; sin saldo y con clave, la clave.
  const clave = esRecojo ? (p.shalom_pickup_code ?? null) : null
  const accion: AccionDeLaTarjeta = !esRecojo && !p.address_verified
    ? 'gps'
    : puedePagarSaldo(p) ? 'saldo' : clave ? 'clave' : null

  // El detalle: el del paso, salvo donde la tarjeta sabe algo más —que el
  // botón de abajo cobra, o que la clave ya está a la vista— o donde el paso
  // no trae ninguno y hace falta decir qué viene.
  let detalle = actual.detail
  if (esRecojo && i === RECOJO.LLEGO) {
    if (accion === 'saldo') detalle = 'Ya llegó. Paga tu saldo y te damos tu clave para recogerlo.'
    else if (accion === 'clave') detalle = 'Ya puedes recogerlo. Lleva tu DNI y esta clave al mostrador.'
  }
  if (!detalle) {
    detalle = esRecojo
      ? (i === RECOJO.EN_CAMINO ? 'Te avisamos por aquí cuando llegue a la agencia.' : 'Te avisamos por aquí cada avance.')
      : (i === DOMICILIO.PREPARANDO ? 'Te avisamos por aquí cuando salga el motorizado.' : 'Te avisamos por aquí cada avance.')
  }

  return {
    tono: 'activo',
    titulo: actual.label,
    detalle,
    pasos: pasos.map(s => s.estado),
    accion,
    notaDePago: accion === 'saldo'
      ? (esRecojo ? 'Al pagar te llega tu clave de recojo.' : 'O si prefieres, lo pagas al recibir.')
      : undefined,
  }
}
