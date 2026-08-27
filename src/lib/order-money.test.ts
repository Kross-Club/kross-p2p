import { describe, it, expect } from 'vitest'
import { valorDelPedido, cobradoDelPedido, saldoDelPedido, plataDe, soles } from './order-money'

describe('la plata de un pedido', () => {
  it('el valor es el precio, y nunca negativo', () => {
    expect(valorDelPedido({ product_price: 150 })).toBe(150)
    expect(valorDelPedido({ product_price: '180' })).toBe(180)
    expect(valorDelPedido({})).toBe(0)
    expect(valorDelPedido({ product_price: -50 })).toBe(0)
    expect(valorDelPedido({ product_price: 'gratis' })).toBe(0)
  })

  // La regla cara: adelanto declarado ≠ plata en caja. Solo cuenta lo cruzado.
  it('solo cuenta como cobrado el adelanto que 360pay cruzó', () => {
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75 })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'PENDING' })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'UNMATCHED' })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' })).toBe(75)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'matched' })).toBe(75)
  })

  it('un adelanto mayor al precio no infla la columna', () => {
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 900, payment_verification: 'MATCHED' })).toBe(150)
  })

  it('el saldo es lo que falta cobrar', () => {
    expect(saldoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' })).toBe(75)
    expect(saldoDelPedido({ product_price: 150, advance_amount: 150, payment_verification: 'MATCHED' })).toBe(0)
    // Sin cruzar, el pedido entero sigue por cobrar.
    expect(saldoDelPedido({ product_price: 150, advance_amount: 75 })).toBe(150)
  })

  it('suma un grupo entero', () => {
    const plata = plataDe([
      { product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' },
      { product_price: 120, advance_amount: 120, payment_verification: 'MATCHED' },
      { product_price: 180, advance_amount: 90 },
    ])
    expect(plata.valor).toBe(450)
    expect(plata.cobrado).toBe(195)
    expect(plata.saldo).toBe(255)
  })

  it('un grupo vacío es cero, no NaN', () => {
    expect(plataDe([])).toEqual({ valor: 0, cobrado: 0, saldo: 0 })
  })

  it('escribe soles peruanos, redondeados al sol', () => {
    expect(soles(1234)).toBe('S/ 1,234')
    expect(soles(150.6)).toBe('S/ 151')
    expect(soles(0)).toBe('S/ 0')
    expect(soles(null)).toBe('S/ 0')
    expect(soles('180')).toBe('S/ 180')
  })
})
