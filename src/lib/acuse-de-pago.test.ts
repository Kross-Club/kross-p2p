import { describe, it, expect } from 'vitest'
import { acuseDePago } from '../../supabase/functions/_shared/acuse-de-pago.ts'

// ─── Lo que se le dice al comprador cuando entra su plata ────────────────────
//
// Las frases están AQUÍ, literales, y no derivadas de la función: es copy que ve
// un cliente y que dos sitios escriben —el webhook y el demo—. Si alguien la
// cambia, esta prueba lo obliga a mirar qué está cambiando y para quién.

describe('acuseDePago', () => {
  // Corto a propósito: entró la plata y qué sigue. Cuánto falta y dónde se paga
  // lo dice la tarjeta del pedido, con la cifra de hoy.
  it('adelanto con saldo, en agencia: confirma y no repite el saldo', () => {
    const m = acuseDePago({ tipo: 'adelanto', pagado: 75, total: 150, esRecojo: true })
    expect(m).toBe('✅ ¡Recibimos tu adelanto de S/75! Ya estamos preparando tu pedido y te avisamos por aquí cuando salga.')
    expect(m).not.toMatch(/saldo|agencia|Yape/)
  })

  it('adelanto con saldo, a domicilio: la misma frase', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 75, total: 150, esRecojo: false })).toBe(
      '✅ ¡Recibimos tu adelanto de S/75! Ya estamos preparando tu pedido y te avisamos por aquí cuando salga.',
    )
  })

  // "adelanto" o "pago completo" DERIVADO del pedido, no asumido: decirle "tu
  // adelanto" a quien pagó todo suena a que aún falta plata.
  it('quien pagó el total no oye hablar de adelantos', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 150, total: 150, esRecojo: true })).toBe(
      '✅ ¡Recibimos tu pago completo de S/150! Ya estamos preparando tu pedido y te avisamos por aquí cuando salga.',
    )
  })

  // Al pagar el saldo en agencia lo que espera es su clave.
  it('el saldo en agencia promete la clave de recojo', () => {
    expect(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: true })).toBe(
      '✅ ¡Recibimos tu saldo de S/75! Tu clave de recojo te llega por aquí.',
    )
  })

  it('el saldo a domicilio no habla de claves', () => {
    expect(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: false })).toBe(
      '✅ ¡Recibimos tu saldo de S/75! Tu pedido queda pagado por completo.',
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

  // Un pago por MÁS del precio es un pago completo, nunca un saldo negativo.
  it('nunca se anuncia un saldo negativo', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 200, total: 150, esRecojo: false }))
      .toContain('pago completo de S/200')
  })

  // Los arranques que `cobroDelAviso` reconoce no cambian.
  it('conserva los arranques que el hilo reconoce', () => {
    expect(acuseDePago({ tipo: 'adelanto', pagado: 75, total: 150, esRecojo: true })).toMatch(/^✅ ¡Recibimos tu adelanto de S\/75!/)
    expect(acuseDePago({ tipo: 'adelanto', pagado: 150, total: 150, esRecojo: true })).toMatch(/^✅ ¡Recibimos tu pago completo de S\/150!/)
    expect(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: true })).toMatch(/^✅ ¡Recibimos tu saldo de S\/75!/)
  })
})
