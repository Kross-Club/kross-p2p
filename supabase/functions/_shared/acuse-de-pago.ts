// ─── Lo que se le dice al comprador cuando entra su plata ────────────────────
//
// Un solo sitio, porque lo escriben dos: el webhook de 360pay, en una tienda de
// verdad, y el demo, que enseña ese mismo momento diez segundos después de
// mandar la tarjeta. Un demo que dijera otra frase estaría enseñando un producto
// que no existe.
//
// La copy es corta a propósito (09-set-2026): confirma que entró la plata y
// qué sigue, nada más. Cuánto falta y dónde se paga ya no van acá — viven en la
// tarjeta del pedido (el botón de Yape) y en las preguntas rápidas del chat, que
// lo contestan con la cifra de HOY. Un acuse que repite el saldo se lee como un
// reclamo, y además envejece: el pedido puede cambiar de monto después.
//
// Lo que sí se conserva:
//
//  · "adelanto" o "pago completo" DERIVADO del pedido, no asumido — "tu
//    adelanto" a quien pagó el total suena a que aún falta plata;
//  · al pagar el saldo en agencia lo que el comprador espera es su clave;
//  · un `extra` no habla de saldos: es plata de ENCIMA del pedido.
//
// `cobroDelAviso` (lib/comprobante.ts) reconoce los avisos viejos por su
// arranque —"¡Recibimos tu adelanto de", "…tu saldo de", "…tu pago de"—, así que
// esos arranques no cambian.

export interface Acuse {
  /** El tipo GUARDADO del cobro que acaba de entrar. */
  tipo: 'adelanto' | 'saldo' | 'extra'
  /** Lo que realmente se pagó, tal como lo reportó 360pay. */
  pagado: number
  /** El precio del pedido HOY. De acá sale el saldo, en vez de asumirlo. */
  total: number
  /** ¿Lo recoge en agencia? (`_shared/despacho.ts`). Cambia dónde se paga el
   *  saldo, que es lo único que el comprador necesita saber a continuación. */
  esRecojo: boolean
  /** Solo en los `extra`: qué se cobró. */
  concepto?: string | null
}

export function acuseDePago(a: Acuse): string {
  if (a.tipo === 'extra') {
    const por = (a.concepto ?? '').trim()
    return `✅ ¡Recibimos tu pago de S/${a.pagado}${por ? ` por ${por}` : ''}! Gracias.`
  }

  if (a.tipo === 'saldo') {
    return a.esRecojo
      ? `✅ ¡Recibimos tu saldo de S/${a.pagado}! Tu clave de recojo te llega por aquí.`
      : `✅ ¡Recibimos tu saldo de S/${a.pagado}! Tu pedido queda pagado por completo.`
  }

  const saldoRestante = Math.max(0, Number(a.total ?? 0) - a.pagado)
  const primero = saldoRestante > 0
    ? `✅ ¡Recibimos tu adelanto de S/${a.pagado}!`
    : `✅ ¡Recibimos tu pago completo de S/${a.pagado}!`
  return `${primero} Ya estamos preparando tu pedido y te avisamos por aquí cuando salga.`
}
