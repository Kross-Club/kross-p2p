// ─── La tarjeta de pago del saldo — la copy y su formato de plata ────────────
//
// Vivía en `src/lib/cobro-por-chat.ts` porque solo la escribía el panel (el
// vendedor mandándola a mano). Desde que el tracking también la manda —el
// envío entra a la agencia de origen y la cobranza empieza sola—, la escriben
// tres: el panel, `_shared/tracking.ts` y el demo. Se mudó acá (el frontend la
// re-exporta) por la regla de siempre: si el mensaje automático dijera otra
// frase que el del vendedor, el comprador recibiría dos cobros que no se
// parecen para la misma deuda.
//
// PURO a propósito: sin Deno, sin red — lo importan el panel y el generador
// del demo igual que `mensaje-de-guia.ts`.

/**
 * Soles, como se escriben en Perú.
 *
 * Se redondea al sol: los céntimos no cambian ninguna decisión del panel y
 * hacen que una columna de totales deje de alinearse. Es EL formato de plata
 * del producto (era de `order-money.ts`, que lo re-exporta): si el mensaje del
 * cobro escribiera "S/75" y el panel "S/ 75", serían dos montos a ojo.
 */
export function soles(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return `S/ ${Math.round(Number.isFinite(v) ? v : 0).toLocaleString('es-PE')}`
}

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
