import { tiendaDemo, esPedidoDemo } from './tienda-demo'
import { cambiosDemo, conCambios } from './cambios-demo'
import type { PedidoDemo } from './cambios-demo'
import { cobrosDelPedido, valorDelPedido, cobradoDelPedido } from '../order-money'
import type { DatosDeComprobante } from '../../../supabase/functions/_shared/comprobante.ts'

// ─── El comprobante, enseñando ───────────────────────────────────────────────
//
// Sin esto, el botón "Ver mi comprobante" del demo abría una página que decía
// "este comprobante no existe": el cobro vive en el dispositivo y `get-comprobante`
// pregunta por él a una base donde no está. Justo el final del flujo que se está
// enseñando, roto.
//
// Sale de los MISMOS datos que el panel: la lista de cobros del pedido y
// `cobrosDelPedido`. Un demo que armara su comprobante por otro camino
// enseñaría una hoja que la tienda de verdad no emite.

/** ¿Este id es de un cobro de la tienda de ejemplo? */
export function esCobroDemo(cobroId: string | null | undefined): boolean {
  return !!cobroId && /^demo-(cob|extra)-/.test(cobroId)
}

/**
 * El pedido al que pertenece un cobro del demo.
 *
 * Dos caminos, porque hay dos orígenes: los que arma el generador llevan el
 * índice del pedido EN el id (`demo-cob-<i>-a`), y los que se crean enseñando
 * viven en los cambios del dispositivo, así que se buscan ahí.
 */
async function pedidoDelCobro(cobroId: string): Promise<PedidoDemo | null> {
  const t = await tiendaDemo()

  const delGenerador = /^demo-cob-(\d+)-/.exec(cobroId)
  if (delGenerador) {
    const p = t.pedidos.find(x => x.id === `demo-ped-${delGenerador[1]}`)
    return p ? conCambios(p) : null
  }

  // Creado enseñando: el id no dice de quién es, así que se busca en los
  // cambios guardados —que es donde vive— y de ahí sale la sesión.
  const cambios = cambiosDemo()
  const sessionId = Object.keys(cambios).find(id =>
    (cambios[id].cobros ?? []).some(c => c.id === cobroId))
  if (!sessionId || !esPedidoDemo(sessionId)) return null
  const p = t.pedidos.find(x => x.id === sessionId)
  return p ? conCambios(p) : null
}

/**
 * La constancia de un cobro del demo, con la forma exacta que devuelve
 * `get-comprobante`. La página no distingue: recibe lo mismo de los dos lados.
 */
export async function comprobanteDemo(
  cobroId: string, tienda: { nombre?: string | null; logo_url?: string | null },
): Promise<DatosDeComprobante | null> {
  const pedido = await pedidoDelCobro(cobroId)
  if (!pedido) return null

  const cobro = cobrosDelPedido(pedido).find(c => c.id === cobroId)
  // Solo el que entró, igual que en el servidor: una constancia de un cobro
  // pendiente diría que se pagó algo que no se pagó.
  if (!cobro?.verificado) return null

  const total = valorDelPedido(pedido)
  const pagado = cobradoDelPedido(pedido)

  return {
    cobro_id: cobroId,
    pedido: pedido.order_id ?? null,
    tienda: tienda.nombre ?? null,
    logo: tienda.logo_url ?? null,
    comprador: pedido.buyer_name ?? null,
    // El tipo GUARDADO, no el que deduce el panel: `total` no existe en la
    // base, es un adelanto que cubre el precio entero. Lo vuelve a deducir la
    // página, contra el valor de hoy, igual que con un pedido de verdad.
    tipo: cobro.fila?.tipo ?? (cobro.tipo === 'saldo' ? 'saldo' : cobro.tipo === 'extra' ? 'extra' : 'adelanto'),
    concepto: cobro.concepto ?? null,
    monto: cobro.monto,
    cobrado_en: cobro.matchedAt ?? null,
    payment_code: cobro.paymentCode ?? null,
    // El rastro bancario del demo sale del pedido, que es donde el generador lo
    // sembró: dos operaciones distintas, una por cobro, igual que en la tienda
    // real.
    operation_number: (cobro.tipo === 'saldo' ? pedido.saldo_trace : pedido.payment_trace)?.operation_number ?? null,
    bank: (cobro.tipo === 'saldo' ? pedido.saldo_trace : pedido.payment_trace)?.bank ?? null,
    total,
    pagado,
    saldo: Math.max(0, total - pagado),
  }
}
