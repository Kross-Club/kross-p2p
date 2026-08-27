import { describe, it, expect } from 'vitest'
import { codigoPedido, esElMismoPedido } from './order-code'

describe('el número de pedido', () => {
  it('muestra la cola, que es lo que distingue', () => {
    expect(codigoPedido('ORD-1756345678901')).toBe('#678901')
    expect(codigoPedido('ORD-1756345111111')).toBe('#111111')
  })

  // El prefijo no debe colarse en la cola cuando el número es corto.
  it('corta sobre los dígitos, no sobre el texto', () => {
    expect(codigoPedido('ORD-42')).toBe('#42')
    expect(codigoPedido('ORD-123456789')).toBe('#456789')
  })

  it('sin número no inventa uno', () => {
    expect(codigoPedido(null)).toBeNull()
    expect(codigoPedido(undefined)).toBeNull()
    expect(codigoPedido('   ')).toBeNull()
  })

  it('un número sin dígitos se muestra tal cual', () => {
    expect(codigoPedido('MANUAL')).toBe('#MANUAL')
  })

  // Dos pedidos distintos pueden compartir cola, así que "el que estoy viendo"
  // se decide por id de sesión y no por el código que se pinta.
  it('la comparación es por id de sesión, no por código', () => {
    expect(esElMismoPedido('ses-1', 'ses-1')).toBe(true)
    expect(esElMismoPedido('ses-1', 'ses-2')).toBe(false)
    expect(esElMismoPedido(null, null)).toBe(false)
    expect(esElMismoPedido('ses-1', undefined)).toBe(false)
  })
})
