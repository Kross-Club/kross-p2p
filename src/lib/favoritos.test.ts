import { describe, it, expect, beforeEach } from 'vitest'
import { favoritosDe, esFavorito, alternarFavorito } from './favoritos'

describe('los pedidos marcados', () => {
  beforeEach(() => { localStorage.clear() })

  it('sin tienda no hay marcados, y marcar no hace nada', () => {
    expect(favoritosDe(null).size).toBe(0)
    expect(alternarFavorito(null, 'ped-1')).toBe(false)
  })

  it('marca y desmarca, y dice cómo quedó', () => {
    const tienda = `t-${Math.random()}`
    expect(alternarFavorito(tienda, 'ped-1')).toBe(true)
    expect(esFavorito(tienda, 'ped-1')).toBe(true)
    expect(alternarFavorito(tienda, 'ped-1')).toBe(false)
    expect(esFavorito(tienda, 'ped-1')).toBe(false)
  })

  // Es de quien mira, no del pedido: cada tienda lleva su propia lista, igual
  // que el modo demo.
  it('cada tienda lleva la suya', () => {
    const a = `a-${Math.random()}`, b = `b-${Math.random()}`
    alternarFavorito(a, 'ped-1')
    expect(esFavorito(a, 'ped-1')).toBe(true)
    expect(esFavorito(b, 'ped-1')).toBe(false)
  })

  it('se guarda en este dispositivo', () => {
    const tienda = `t-${Math.random()}`
    alternarFavorito(tienda, 'ped-9')
    expect(JSON.parse(localStorage.getItem(`kross-fav:${tienda}`)!)).toEqual(['ped-9'])
    alternarFavorito(tienda, 'ped-9')
    expect(localStorage.getItem(`kross-fav:${tienda}`)).toBeNull()
  })
})
