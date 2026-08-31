// ─── Volver a pedir el saldo, por el chat ────────────────────────────────────
//
// El comprador YA tiene una tarjeta permanente para pagar su saldo al final de
// su chat (`PagarSaldo`). Lo que faltaba era el empujón: esa tarjeta solo la ve
// quien abre la app, y el que debe un saldo es justamente el que dejó de
// abrirla. Un cobro que espera a que el cliente se acuerde no se cobra.
//
// Así que el vendedor puede **mandarlo como mensaje**. Y siendo un mensaje,
// llega por donde llega todo lo demás: push y, si no hay push, WhatsApp. Es la
// diferencia entre una tarjeta que está y un aviso que suena.
//
// **No hace falta nada nuevo en el servidor.** `chat_messages.type` es texto
// libre y `seller-send-message` lo pasa tal cual, con su broadcast y su
// notificación. El tipo `cobro` solo le dice al chat del comprador que pinte el
// botón de pago debajo del texto.

/** El tipo de mensaje. Vale para las dos puntas: la que lo manda y la que lo
 *  pinta. Vive acá para que no se escriba a mano en dos archivos. */
export const TIPO_COBRO = 'cobro'

/**
 * El morado de Yape. El MISMO valor que la caja de pago del checkout
 * (`Pay360Box`), y por eso vive acá y no dentro de un componente: el comprador
 * ya pagó el adelanto con un botón de ese color, así que reconocerlo es más
 * rápido que leerlo. Si los dos sitios se separan, el segundo botón deja de
 * significar "esto abre Yape" y pasa a significar "otro botón más".
 */
export const MORADO_YAPE = '#742284'

/**
 * Lo que dice el mensaje.
 *
 * **Tiene que bastarse solo**, y eso decide cómo está escrito: este mismo texto
 * es el que sale en la notificación push y en WhatsApp, donde no hay botón que
 * tocar ni tarjeta que mirar. Un "toca el botón de abajo" ahí no significa
 * nada. Por eso lleva el monto y el porqué, que es lo que hace que alguien
 * abra: no "tienes un pago pendiente", sino cuánto y a cambio de qué.
 */
export function textoDeCobro(monto: string): string {
  return `Te queda un saldo de ${monto}. Págalo desde tu Yape por acá y te enviamos tu clave de recojo.`
}

/** Lo que dice el botón. También del lado del vendedor, en el aviso de que ya
 *  se envió, para que las dos pantallas nombren la misma acción. */
export function etiquetaDePago(monto: string): string {
  return `Pagar ${monto} con Yape`
}


/**
 * El monto que muestra una tarjeta de pago.
 *
 * Es el del COBRO, no el saldo que quede hoy. Suena a lo mismo hasta que se
 * paga: ahí "lo que falta" pasa a cero y la tarjeta enseñaba **S/ 0** encima de
 * su propio texto diciendo "te queda un saldo de S/ 60". Un recibo que se
 * contradice a sí mismo no vale como recibo.
 *
 * `saldo_amount` es el importe del cupón emitido y no se mueve al cobrarse, así
 * que es lo que la tarjeta tiene que decir toda su vida. El saldo pendiente es
 * el respaldo para el rato en que todavía no se emitió ninguno.
 */
export function montoDeLaTarjeta(
  p: { saldo_amount?: number | string | null }, saldoPendiente: number,
): number {
  const delCobro = Math.max(0, Number(p.saldo_amount ?? 0) || 0)
  return delCobro > 0 ? delCobro : saldoPendiente
}


/**
 * ¿Se le puede mandar la tarjeta de pago de ESTE cobro?
 *
 * Un cobro se paga cuando está pendiente, tiene monto y la tienda cobra en
 * línea. El adelanto no entra: ese ya se pagó o se está pagando en el checkout,
 * y mandarle una tarjeta por el chat lo mandaría a pagar dos veces.
 *
 * El saldo tiene además su propia condición —el adelanto ya cruzado, porque el
 * banco cobra el cupón más antiguo— y esa la sigue respondiendo
 * `puedePagarSaldo`. Acá va lo que vale para cualquiera.
 */
export function seCobraPorChat(
  cobro: { tipo: string; verificado: boolean; monto: number },
  pedido: { payment_provider?: string | null },
): boolean {
  if (cobro.verificado || !(cobro.monto > 0)) return false
  if (cobro.tipo === 'adelanto' || cobro.tipo === 'total') return false
  return pedido.payment_provider === '360PAY'
}

/** El texto del cobro extra: lleva el concepto, porque un monto sin razón no lo
 *  paga nadie — y este mismo texto sale en la push y en WhatsApp. */
export function textoDeCobroExtra(monto: string, concepto: string): string {
  return `${concepto}: ${monto}. Págalo desde tu Yape por acá.`
}


/**
 * ¿De qué cobro es esta tarjeta de pago?
 *
 * Mientras un pedido tenía dos cobros, la respuesta era siempre "del saldo" y
 * no hacía falta preguntarla. Con los `extra` (bloque §36) sí: el mismo mensaje
 * puede ser el flete, la diferencia de talla o el saldo, y pintarlo todo contra
 * el saldo del pedido enseñaba un monto que no era y —peor— un botón que cobraba
 * otra cosa distinta de la que el texto pedía.
 *
 * El mensaje solo lleva el PUNTERO (`cobro_id`, bloque §37); el monto y el
 * estado se leen de la lista del pedido, que es donde viven. Por eso una tarjeta
 * vieja se sigue pagando bien aunque el pedido haya cambiado de monto: se pinta
 * contra el pedido de HOY.
 *
 * `null` = la tarjeta es del saldo, como fue siempre. Es la respuesta correcta
 * para los mensajes de antes de la columna y para los que no apuntan a nada.
 */
export function cobroDeLaTarjeta<T extends { id?: string | null }>(
  mensaje: { cobro_id?: string | null },
  cobros: T[],
): T | null {
  if (!mensaje.cobro_id) return null
  return cobros.find(c => c.id === mensaje.cobro_id) ?? null
}
