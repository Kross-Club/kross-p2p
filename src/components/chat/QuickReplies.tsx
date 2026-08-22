// ─── Respuestas rápidas del comprador ────────────────────────────────────────
// Fichas tocables encima del campo de texto, al estilo de las plantillas de
// WhatsApp. Sirven a dos cosas a la vez:
//
//   · bajan el costo de la primera interacción —escribir de cero a un
//     desconocido cuesta más que tocar un botón—, y
//   · le enseñan que ESTE chat es donde se resuelve su pedido, que es lo que
//     sostiene la tasa de entrega.
//
// Se DERIVAN del estado del pedido, no se guardan en la base. Guardadas por
// mensaje quedarían obsoletas: "¿Ya llegó mi pago?" seguiría ofreciéndose una
// semana después de que el pago cuadró. Así la ficha siempre corresponde a lo
// que le pasa al pedido en este momento.

interface QuickRepliesProps {
  stage: string | null | undefined
  /** Se ocultan en cuanto el comprador escribe: ya cumplieron su trabajo, y
   *  dejarlas para siempre convierte la ayuda en estorbo sobre el teclado. */
  buyerHasWritten: boolean
  /** `isPickupDispatch(dispatch_type)`: recoge en agencia, no le llega a la
   *  puerta. Sus dudas son OTRAS —la guía, dónde recoger— y ofrecerle "quiero
   *  cambiar mi dirección" enseña que estas fichas no le hablan a él. */
  esRecojo?: boolean
  /** Lo que le falta pagar cuando dejó un adelanto parcial (precio − adelanto).
   *  0 = pagó todo o es contraentrega puro: en ambos casos la ficha del saldo
   *  sobra, preguntarlo sembraría la duda que el mensaje de bienvenida cerró. */
  saldoPendiente?: number
  onPick: (text: string) => void
}

function repliesFor(
  stage: string | null | undefined,
  ctx: { esRecojo?: boolean; saldoPendiente?: number } = {},
): string[] {
  const { esRecojo = false, saldoPendiente = 0 } = ctx
  // Solo para quien de verdad debe. En recojo el saldo se paga POR LA APP —la
  // clave de recojo se entrega contra ese pago—, así que la ficha útil no es
  // preguntar el monto sino INICIAR el pago. A domicilio se paga en la puerta:
  // ahí la duda sí es cuánto llevar.
  const saldoChip = saldoPendiente > 0
    ? [esRecojo ? 'Quiero pagar mi saldo' : '¿Cuánto me falta pagar?']
    : []
  switch (stage) {
    // Pagó y estamos cuadrando. Las dos dudas reales de ese momento —y la
    // segunda además nos trae el comprobante justo cuando puede hacer falta,
    // en vez de pedírselo a todos por si acaso en el checkout.
    case 'validando':
      return ['¿Ya llegó mi pago?', 'Te envío mi comprobante']
    case 'confirmado':
    case 'preparando':
      // En recojo la espera es por la GUÍA (prometida en la bienvenida), no por
      // un timbrazo en la puerta.
      return esRecojo
        ? ['¿Ya tienen la guía de mi envío?', '¿Dónde recojo mi pedido?', ...saldoChip]
        : ['¿Cuándo llega mi pedido?', 'Quiero cambiar mi dirección', ...saldoChip]
    case 'en_camino':
      // "¿Pueden venir después?" a alguien que va a ir él mismo al mostrador
      // no significa nada. Con saldo, lo que le abre la puerta es pagarlo (eso
      // suelta la clave); ya pagado, lo que necesita a mano es la clave misma.
      return esRecojo
        ? ['¿Ya puedo recoger mi pedido?',
           ...(saldoPendiente > 0 ? saldoChip : ['¿Me reenvías mi clave de recojo?']),
           '¿Me reenvías la guía?']
        : ['¿Cuánto falta?', 'No voy a estar, ¿pueden venir después?']
    case 'entregado':
      return ['Ya lo recibí, gracias', 'Tengo un problema con mi pedido']
    default:
      return esRecojo
        ? ['¿Cuándo puedo recoger mi pedido?', ...(saldoChip.length ? saldoChip : ['¿Dónde recojo mi pedido?'])]
        : ['¿Cuándo llega mi pedido?', 'Quiero cambiar mi dirección']
  }
}

export default function QuickReplies({ stage, buyerHasWritten, esRecojo, saldoPendiente, onPick }: QuickRepliesProps) {
  if (buyerHasWritten) return null
  const replies = repliesFor(stage, { esRecojo, saldoPendiente })
  if (replies.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 -mb-1"
      style={{ scrollbarWidth: 'none' }}>
      {replies.map(text => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="flex-shrink-0 text-[12px] font-bold px-3.5 py-2 rounded-full bg-white
            border active:scale-95 transition-transform
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export { repliesFor }
