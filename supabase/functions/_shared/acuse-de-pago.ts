// ─── Lo que se le dice al comprador cuando entra su plata ────────────────────
//
// Un solo sitio, porque lo escriben dos: el webhook de 360pay, en una tienda de
// verdad, y el demo, que enseña ese mismo momento diez segundos después de
// mandar la tarjeta. Un demo que dijera otra frase estaría enseñando un producto
// que no existe.
//
// La copy está calibrada y no es intercambiable:
//
//  · el saldo DERIVADO y no asumido — "tu adelanto" a quien pagó el total suena
//    a que aún falta plata, y callar el saldo a quien pagó la mitad lo manda a
//    preguntar cuánto debe justo el día del recojo;
//  · en agencia el saldo se paga POR LA APP, nunca en el mostrador: la clave de
//    recojo se entrega contra ese pago, y prometer lo contrario deja al
//    comprador discutiendo con un counter que no cobra;
//  · un `extra` no habla de saldos. Es plata de ENCIMA del pedido —un flete, una
//    diferencia—, y decirle "te queda un saldo de S/X" a quien acaba de pagar su
//    flete es inventarle una deuda.
//
// Misma regla que el mensaje de bienvenida de `register-buyer`.

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

  // Al pagar el saldo lo que el comprador espera es su clave, no un "estamos
  // preparando": su pedido ya está en la agencia.
  if (a.tipo === 'saldo') {
    return `✅ ¡Recibimos tu saldo de S/${a.pagado}! Ya no te queda nada pendiente.`
      + ' Te enviamos tu clave de recojo por acá.'
  }

  const saldoRestante = Math.max(0, Number(a.total ?? 0) - a.pagado)
  const primero = saldoRestante > 0
    ? (a.esRecojo
        ? `✅ ¡Recibimos tu adelanto de S/${a.pagado}! Te queda un saldo de S/${saldoRestante}`
          + ' que nos pagas con Yape desde este mismo enlace de tu pedido —no en la agencia— cuando te enviemos la guía'
          + ' de tu envío. Apenas lo pagues te entregamos tu clave de recojo.'
        : `✅ ¡Recibimos tu adelanto de S/${a.pagado}! Te queda un saldo de S/${saldoRestante}`
          + ' que pagas al recibir tu pedido.')
    : `✅ ¡Recibimos tu pago completo de S/${a.pagado}! No te queda ningún saldo pendiente.`

  return `${primero} Ya estamos preparando tu pedido. Por aquí te avisamos cuando salga.`
}
