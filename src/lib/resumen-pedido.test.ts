import { describe, it, expect } from 'vitest'
import { resumenDelPedido, montoTexto } from '../../supabase/functions/_shared/resumen-pedido.ts'

describe('el detalle que se le manda al comprador', () => {
  const base = { cambio: '🛍️ Producto agregado: Test', total: 175, abonado: 75, entregaJunta: true }

  // La cifra que MÁS le sirve a quien lee es la que faltaba: ya adelantó parte,
  // así que un total suelto lo obliga a restar de cabeza. Y esa resta termina
  // en un "¿entonces cuánto debo?" que contesta un asesor a mano.
  it('dice lo que falta, no solo el total', () => {
    const t = resumenDelPedido(base)
    expect(t).toContain('💰 Nuevo total: S/ 175')
    expect(t).toContain('✅ Monto abonado: S/ 75')
    expect(t).toContain('📌 Saldo pendiente: S/ 100')
  })

  it('y el saldo sale de la resta, no de un dato aparte', () => {
    expect(resumenDelPedido({ ...base, total: 300, abonado: 120 })).toContain('📌 Saldo pendiente: S/ 180')
    // Pagado entero: cero, nunca negativo.
    expect(resumenDelPedido({ ...base, total: 100, abonado: 150 })).toContain('📌 Saldo pendiente: S/ 0')
  })

  it('el cambio es la primera línea, con su emoji', () => {
    expect(resumenDelPedido(base).split('\n')[2]).toBe('🛍️ Producto agregado: Test')
  })

  // Una promesa de logística de más es una queja después.
  it('la entrega junta solo se promete si es cierta', () => {
    expect(resumenDelPedido(base)).toContain('📦 Entrega')
    expect(resumenDelPedido({ ...base, entregaJunta: false })).not.toContain('📦 Entrega')
  })
})

describe('cómo se escribe un monto', () => {
  // Los céntimos de más en un mensaje de WhatsApp se leen como un error del
  // sistema, no como precisión.
  it('sin decimales cuando no los hay', () => {
    expect(montoTexto(175)).toBe('S/ 175')
    expect(montoTexto(87.5)).toBe('S/ 87.50')
    expect(montoTexto(-5)).toBe('S/ 0')
  })
})
