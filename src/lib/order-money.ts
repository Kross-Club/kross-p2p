// ─── La plata de un pedido ───────────────────────────────────────────────────
//
// El tablero pasó de contar pedidos a contar plata, y ahí apareció la pregunta
// que no estaba escrita en ningún lado: ¿cuánto "vale" un pedido? Había dos
// respuestas sueltas en el repo —`estadoDePago` en live-map.ts y la resta del
// saldo en OrderChatPage— y ninguna con nombre. Acá viven las tres cifras que
// de verdad se usan, con la misma regla para todas las pantallas:
//
//   valor    → lo que cuesta el pedido.
//   cobrado  → lo que YA entró, y solo si 360pay lo cruzó.
//   saldo    → lo que falta cobrar (típicamente, contra entrega).
//
// "Cobrado" es la definición cara: un adelanto declarado que todavía no se
// cruza NO es plata que entró. Pintarlo como cobrado le mentiría al vendedor
// sobre su propia caja, que es justo el número por el que abre el tablero.

export interface PedidoConPlata {
  product_price?: number | string | null
  advance_amount?: number | string | null
  payment_verification?: string | null
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Lo que cuesta el pedido. */
export function valorDelPedido(p: PedidoConPlata): number {
  return Math.max(0, num(p.product_price))
}

/**
 * Lo que ya entró por este pedido.
 *
 * Se topa contra el valor a propósito: un adelanto mayor al precio es un dato
 * malo, y dejarlo pasar inflaría el total de una columna sin que nadie note de
 * dónde salió.
 */
export function cobradoDelPedido(p: PedidoConPlata): number {
  if (String(p.payment_verification ?? '').toUpperCase() !== 'MATCHED') return 0
  const adelanto = Math.max(0, num(p.advance_amount))
  const valor = valorDelPedido(p)
  return valor > 0 ? Math.min(adelanto, valor) : adelanto
}

/** Lo que falta cobrar. */
export function saldoDelPedido(p: PedidoConPlata): number {
  return Math.max(0, valorDelPedido(p) - cobradoDelPedido(p))
}

export interface Plata {
  valor: number
  cobrado: number
  saldo: number
}

/** Las tres cifras de un grupo de pedidos —una columna del tablero, un día—. */
export function plataDe(pedidos: PedidoConPlata[]): Plata {
  let valor = 0
  let cobrado = 0
  for (const p of pedidos) {
    valor += valorDelPedido(p)
    cobrado += cobradoDelPedido(p)
  }
  return { valor, cobrado, saldo: Math.max(0, valor - cobrado) }
}

/**
 * Soles, como se escriben en Perú.
 *
 * Se redondea al sol: los céntimos no cambian ninguna decisión del panel y
 * hacen que una columna de totales deje de alinearse.
 */
export function soles(n: number | string | null | undefined): string {
  return `S/ ${Math.round(num(n)).toLocaleString('es-PE')}`
}
