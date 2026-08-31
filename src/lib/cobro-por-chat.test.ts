import { describe, it, expect } from 'vitest'
import { TIPO_COBRO, textoDeCobro, etiquetaDePago, montoDeLaTarjeta } from './cobro-por-chat'

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
