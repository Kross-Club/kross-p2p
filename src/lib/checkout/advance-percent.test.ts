// Tests del adelanto por PORCENTAJE. El modelo nuevo: se adelanta la mitad del
// pedido, o se paga el 100 % y se ganan puntos.
//
// Lo que más se prueba acá no es la aritmética —es una división— sino la
// resolución del PRECIO. Con adelanto fijo, manipular el precio del pedido no
// cambiaba lo que se cobraba; con porcentaje sí, y `product_price` viene del
// navegador. Por eso el precio se resuelve contra el catálogo de la marca.

import { describe, expect, it } from 'vitest'
import {
  ADVANCE_PERCENT, expectedAdvance, priceOfPack, toCents,
} from '../../../supabase/functions/_shared/advance.ts'

describe('cuánto se adelanta', () => {
  it('la mitad, por defecto', () => {
    expect(expectedAdvance(98, false)).toBe(49)
    expect(ADVANCE_PERCENT).toBe(50)
  })

  it('el total, si elige pagar completo', () => {
    expect(expectedAdvance(98, true)).toBe(98)
  })

  it('los céntimos no se truncan', () => {
    // 360pay cobra en soles con decimales, así que truncar a entero regalaría
    // medio sol en cada pedido impar — o lo cobraría de más.
    expect(expectedAdvance(99, false)).toBe(49.5)
    expect(expectedAdvance(49.9, false)).toBe(24.95)
    expect(toCents(49.955)).toBe(49.96)
  })

  it('un total inválido no produce un cobro', () => {
    // Devolver un número "por si acaso" sería cobrarle algo a alguien cuyo
    // pedido no se pudo valorizar.
    expect(expectedAdvance(0, false)).toBe(0)
    expect(expectedAdvance(-50, false)).toBe(0)
    expect(expectedAdvance(Number.NaN, false)).toBe(0)
    expect(expectedAdvance(Number.POSITIVE_INFINITY, true)).toBe(0)
  })
})

describe('el precio sale del catálogo, no del pedido', () => {
  const packs = [
    { nombre: '1 unidad', precio: 59 },
    { nombre: '2 unidades', precio: 98 },
    { nombre: '3 unidades', precio: 135.5 },
  ]

  it('encuentra el pack por nombre', () => {
    expect(priceOfPack(packs, '2 unidades')).toBe(98)
    expect(priceOfPack(packs, '3 unidades')).toBe(135.5)
  })

  it('tolera mayúsculas y espacios de más', () => {
    expect(priceOfPack(packs, '  2 UNIDADES ')).toBe(98)
  })

  it('sin nombre de pack NO adivina', () => {
    // Caer al primero cobraría el precio equivocado en cualquier catálogo con
    // más de un pack, y en silencio.
    expect(priceOfPack(packs, null)).toBeNull()
    expect(priceOfPack(packs, '')).toBeNull()
    expect(priceOfPack(packs, '   ')).toBeNull()
  })

  it('un pack inexistente da null, no un precio cualquiera', () => {
    expect(priceOfPack(packs, '10 unidades')).toBeNull()
  })

  it('precios corruptos dan null', () => {
    // `null` frena el cobro. Cobrar sobre un precio que no se pudo verificar es
    // justo lo que esta función existe para impedir.
    expect(priceOfPack([{ nombre: 'x', precio: 0 }], 'x')).toBeNull()
    expect(priceOfPack([{ nombre: 'x', precio: -10 }], 'x')).toBeNull()
    expect(priceOfPack([{ nombre: 'x', precio: 'gratis' }], 'x')).toBeNull()
    expect(priceOfPack([{ nombre: 'x' }], 'x')).toBeNull()
  })

  it('un catálogo que no es lista da null', () => {
    expect(priceOfPack(null, 'x')).toBeNull()
    expect(priceOfPack('[]', 'x')).toBeNull()
    expect(priceOfPack({ nombre: 'x', precio: 10 }, 'x')).toBeNull()
  })
})

describe('el ataque que esto bloquea', () => {
  it('declarar un pack barato no abarata el adelanto', () => {
    // El comprador manda product_price: 1 sobre un pack real de S/98.
    const packs = [{ nombre: '2 unidades', precio: 98 }]
    const declarado = 1
    const real = priceOfPack(packs, '2 unidades')

    expect(expectedAdvance(declarado, false)).toBe(0.5)   // lo que él quería
    expect(expectedAdvance(real!, false)).toBe(49)        // lo que se cobra
  })
})
