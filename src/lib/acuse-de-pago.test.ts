import { describe, it, expect } from 'vitest'
import { acuseDePago } from '../../supabase/functions/_shared/acuse-de-pago.ts'

// ─── Lo que se le dice al comprador cuando entra su plata ────────────────────
//
// Las frases están AQUÍ, literales, y no derivadas de la función: es copy que ve
// un cliente y que dos sitios escriben —el webhook y el demo—. Si alguien la
// cambia, esta prueba lo obliga a mirar qué está cambiando y para quién.

describe('acuseDePago', () => {
  // Quien adelantó la mitad y recoge en agencia: lo que necesita saber a
  // continuación es DÓNDE paga el saldo, porque el counter no cobra.
  it('adelanto con saldo, en agencia: el saldo se paga por la app', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 75, total: 150, esRecojo: true })).toBe(
      '✅ ¡Recibimos tu adelanto de S/75! Te queda un saldo de S/75'
      + ' que nos pagas por esta misma app —no en la agencia— cuando te enviemos la guía'
      + ' de tu envío. Apenas lo pagues te entregamos tu clave de recojo.'
      + ' Ya estamos preparando tu pedido. Por aquí te avisamos cuando salga.',
    )
  })

  it('adelanto con saldo, a domicilio: el saldo se paga al recibir', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 75, total: 150, esRecojo: false })).toBe(
      '✅ ¡Recibimos tu adelanto de S/75! Te queda un saldo de S/75'
      + ' que pagas al recibir tu pedido.'
      + ' Ya estamos preparando tu pedido. Por aquí te avisamos cuando salga.',
    )
  })

  // El saldo va DERIVADO del pedido, no asumido: decirle "tu adelanto" a quien
  // pagó todo suena a que aún falta plata.
  it('quien pagó el total no oye hablar de adelantos', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 150, total: 150, esRecojo: true })).toBe(
      '✅ ¡Recibimos tu pago completo de S/150! No te queda ningún saldo pendiente.'
      + ' Ya estamos preparando tu pedido. Por aquí te avisamos cuando salga.',
    )
  })

  // Al pagar el saldo lo que espera es su clave, no un "estamos preparando": su
  // pedido ya está en la agencia.
  it('el saldo promete la clave de recojo, no la preparación', () => {
    expect(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: true })).toBe(
      '✅ ¡Recibimos tu saldo de S/75! Ya no te queda nada pendiente.'
      + ' Te enviamos tu clave de recojo por acá.',
    )
  })

  // Un `extra` es plata de ENCIMA del pedido. Decirle "te queda un saldo de S/X"
  // a quien acaba de pagar su flete es inventarle una deuda.
  it('un extra no habla de saldos, y dice de qué era', () => {
    expect(acuseDePago({ tipo: 'extra', pagado: 20, total: 150, esRecojo: true, concepto: 'Flete a Piura' }))
      .toBe('✅ ¡Recibimos tu pago de S/20 por Flete a Piura! Gracias.')
  })

  it('un extra sin concepto agradece igual', () => {
    expect(acuseDePago({ tipo: 'extra', pagado: 20, total: 150, esRecojo: true, concepto: '  ' }))
      .toBe('✅ ¡Recibimos tu pago de S/20! Gracias.')
  })

  // Un pago por MÁS del precio no puede dejar un saldo negativo escrito en el
  // chat del comprador.
  it('nunca se anuncia un saldo negativo', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 200, total: 150, esRecojo: false }))
      .toContain('No te queda ningún saldo pendiente')
  })
})
