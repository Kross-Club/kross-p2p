// ─── Cómo se le cuenta al comprador que su pedido cambió ─────────────────────
//
// El mensaje decía una sola cifra: "Nuevo total: S/175". Y esa cifra, sola, es
// la que MENOS le sirve a quien la lee — porque ya adelantó parte. Lo que
// necesita saber es **cuánto le falta**, y con un total suelto tiene que
// acordarse de lo que pagó y restar de cabeza. La mitad de las veces la
// pregunta que sigue es "¿entonces cuánto debo?", y esa pregunta la contesta un
// asesor a mano.
//
// Así que el mensaje lleva las cuatro cifras que cierran la conversación: qué
// se agregó, cuánto vale ahora el pedido, cuánto está abonado y cuánto queda.
//
// Vive en `_shared` porque lo escriben LOS DOS lados —`order-manage` cuando el
// comprador acepta la oferta de verdad, y el demo cuando se enseña— y un
// mensaje que se lee distinto según quién lo generó es un mensaje en el que no
// se puede confiar.

/** Con dos decimales solo cuando los hay: "S/ 175", "S/ 87.50". Los céntimos
 *  de más en un mensaje de WhatsApp se leen como un error de sistema. */
export function montoTexto(n: number): string {
  const v = Math.max(0, Number(n) || 0)
  return `S/ ${Number.isInteger(v) ? v : v.toFixed(2)}`
}

/**
 * El detalle de un pedido que acaba de cambiar.
 *
 * Lo mismo sirve para "te agregué algo", "te cambié la cantidad" y "te quité un
 * producto": lo único que cambia es la primera línea, y por eso `encabezado` y
 * `cambio` entran como texto.
 */
export function resumenDelPedido(input: {
  /** La primera línea con emoji: "🛍️ Producto agregado: Test". */
  cambio: string
  total: number
  /** Lo COBRADO y cruzado. No lo prometido: si el adelanto no entró, no está
   *  abonado, y decirle que sí es prometerle una entrega que no va a salir. */
  abonado: number
  /** Si el pedido se entrega junto. Falso lo omite en vez de decir lo contrario:
   *  una promesa de logística de más es una queja después. */
  entregaJunta?: boolean
}): string {
  const pendiente = Math.max(0, input.total - input.abonado)
  const lineas = [
    '¡Pedido actualizado con éxito! Aquí tienes el detalle:',
    '',
    input.cambio,
    `💰 Nuevo total: ${montoTexto(input.total)}`,
    `✅ Monto abonado: ${montoTexto(input.abonado)}`,
    `📌 Saldo pendiente: ${montoTexto(pendiente)}`,
  ]
  if (input.entregaJunta) lineas.push('📦 Entrega: Todo llegará junto en un solo paquete')
  return lineas.join('\n')
}
