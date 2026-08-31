import { describe, it, expect } from 'vitest'
import { TIPO_COBRO, textoDeCobro, etiquetaDePago, montoDeLaTarjeta, seCobraPorChat, textoDeCobroExtra, cobroDeLaTarjeta } from './cobro-por-chat'

describe('el mensaje que vuelve a pedir el saldo', () => {
  // Se basta solo porque este MISMO texto sale en la push y en WhatsApp, donde
  // no hay botón que tocar. Sin el monto, el aviso no da razones para abrir.
  it('lleva el monto y a cambio de qué', () => {
    const t = textoDeCobro('S/ 60')
    expect(t).toContain('S/ 60')
    expect(t).toContain('clave de recojo')
  })

  // Nada de "toca el botón de abajo": en una notificación no hay abajo.
  it('no se apoya en algo que en una notificación no existe', () => {
    expect(textoDeCobro('S/ 60').toLowerCase()).not.toMatch(/bot[óo]n|aqu[íi] abajo|m[áa]s abajo/)
  })

  it('el botón nombra la acción con su monto', () => {
    expect(etiquetaDePago('S/ 60')).toBe('Pagar S/ 60 con Yape')
  })

  it('el tipo es uno solo para quien lo manda y quien lo pinta', () => {
    expect(TIPO_COBRO).toBe('cobro')
  })
})

// ─── El monto que enseña la tarjeta ──────────────────────────────────────────
//
// El bug que esto cierra estaba a la vista en una captura: la tarjeta decía
// **S/ 0** y justo debajo su propio texto decía "Te queda un saldo de S/ 60".
// Se pintaba con "lo que falta del pedido HOY", y al pagarse eso es cero.

describe('el monto de una tarjeta de pago', () => {
  it('es el del cobro, y no se mueve al pagarse', () => {
    expect(montoDeLaTarjeta({ saldo_amount: 60 }, 60)).toBe(60)
    // Pagado: el pedido ya no debe nada, pero la tarjeta sigue siendo de S/ 60.
    expect(montoDeLaTarjeta({ saldo_amount: 60 }, 0)).toBe(60)
  })

  it('sin cupón emitido todavía, lo que falta del pedido', () => {
    expect(montoDeLaTarjeta({}, 110)).toBe(110)
    expect(montoDeLaTarjeta({ saldo_amount: null }, 110)).toBe(110)
    expect(montoDeLaTarjeta({ saldo_amount: 0 }, 110)).toBe(110)
  })

  it('acepta el numérico como texto, que es como llega de Postgres', () => {
    expect(montoDeLaTarjeta({ saldo_amount: '75.00' }, 0)).toBe(75)
  })
})

// ─── Qué cobro se puede mandar por el chat ───────────────────────────────────

describe('seCobraPorChat', () => {
  const enLinea = { payment_provider: '360PAY' }
  const extra = { tipo: 'extra', verificado: false, monto: 20 }

  it('un cobro pendiente de una tienda que cobra en línea', () => {
    expect(seCobraPorChat(extra, enLinea)).toBe(true)
    expect(seCobraPorChat({ tipo: 'saldo', verificado: false, monto: 60 }, enLinea)).toBe(true)
  })

  // Ese ya se pagó o se está pagando en el checkout: mandarle una tarjeta lo
  // mandaría a pagar dos veces.
  it('el adelanto no se cobra por el chat', () => {
    expect(seCobraPorChat({ tipo: 'adelanto', verificado: false, monto: 75 }, enLinea)).toBe(false)
    expect(seCobraPorChat({ tipo: 'total', verificado: false, monto: 150 }, enLinea)).toBe(false)
  })

  it('ni lo ya cobrado, ni un monto vacío', () => {
    expect(seCobraPorChat({ ...extra, verificado: true }, enLinea)).toBe(false)
    expect(seCobraPorChat({ ...extra, monto: 0 }, enLinea)).toBe(false)
  })

  // Sin pasarela el saldo lo coordina un asesor: prometer un botón que no cobra
  // es peor que no ponerlo.
  it('ni en una tienda que no cobra en línea', () => {
    expect(seCobraPorChat(extra, { payment_provider: null })).toBe(false)
  })
})

describe('el texto de un cobro extra', () => {
  it('lleva el concepto: un monto sin razón no lo paga nadie', () => {
    expect(textoDeCobroExtra('S/ 20', 'Flete a Piura')).toBe('Flete a Piura: S/ 20. Págalo desde tu Yape por acá.')
  })
})

// ─── De qué cobro es la tarjeta ──────────────────────────────────────────────
//
// Mientras un pedido tenía dos cobros, la respuesta era siempre "del saldo". Con
// los `extra` puede ser el flete, la diferencia o el saldo, y equivocarse no es
// un detalle de pintura: es un botón que abre Yape por OTRO monto del que el
// texto del mensaje pide.

describe('cobroDeLaTarjeta', () => {
  const cobros = [
    { id: 'a', tipo: 'total', monto: 150, verificado: true },
    { id: 'x', tipo: 'extra', monto: 20, verificado: false },
  ]

  it('con puntero, el cobro al que apunta', () => {
    expect(cobroDeLaTarjeta({ cobro_id: 'x' }, cobros)?.monto).toBe(20)
  })

  // Los mensajes de antes de la columna (§37) no apuntan a nada, y ahí la
  // tarjeta es del saldo — que es exactamente lo que era cuando se mandó.
  it('sin puntero, ninguno: la tarjeta vuelve a ser la del saldo', () => {
    expect(cobroDeLaTarjeta({}, cobros)).toBeNull()
    expect(cobroDeLaTarjeta({ cobro_id: null }, cobros)).toBeNull()
  })

  // Un cobro dado de baja desaparece de la lista, y su tarjeta vieja se queda
  // sin cobro. Cae al saldo en vez de romperse.
  it('apuntando a uno que ya no está, ninguno', () => {
    expect(cobroDeLaTarjeta({ cobro_id: 'x' }, [cobros[0]])).toBeNull()
  })
})
