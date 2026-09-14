// ─── Paridad del adelanto: front y servidor, una sola aritmética ─────────────
// `advanceFor()` (checkout.config.ts) enseña el monto; `advanceForServer()`
// (`_shared/advance.ts`) lo cobra. Si se desalinean, el comprador ve un número
// y paga otro — el peor error posible del checkout. Este archivo es el que el
// comentario de `_shared/advance.ts` promete.
//
// Y las reglas por producto de §56 (`eleccionDeAdelanto`, `ofertaDelProducto`,
// `saneaProducto`), que también comparten las dos puntas.

import { describe, expect, it } from 'vitest'
import { ADVANCE_HALF_SHARE, advanceFor } from './checkout.config'
import {
  ADVANCE_HALF_SHARE as SERVER_HALF_SHARE,
  DESCUENTO_MAXIMO_PEN,
  advanceForServer,
  descuentoSaneado,
  eleccionDeAdelanto,
  ofertaDelProducto,
  saneaProducto,
} from '../../../supabase/functions/_shared/advance.ts'

describe('paridad front ↔ servidor', () => {
  it('la proporción de la mitad es la misma constante', () => {
    expect(ADVANCE_HALF_SHARE).toBe(SERVER_HALF_SHARE)
  })

  it('el monto es idéntico para todo precio y elección', () => {
    for (const precio of [1, 5, 69.5, 70.5, 140, 189, 300, 999.99]) {
      for (const eleccion of ['HALF', 'FULL'] as const) {
        expect(advanceForServer(precio, eleccion)).toBe(advanceFor(precio, eleccion))
      }
    }
  })

  it('el default del front es el TOTAL (§56)', () => {
    expect(advanceFor(140)).toBe(140)
    expect(advanceFor(140)).toBe(advanceFor(140, 'FULL'))
  })

  it('sin precio no hay adelanto, en las dos puntas', () => {
    for (const p of [0, -5, NaN, Infinity]) {
      expect(advanceFor(p, 'FULL')).toBe(0)
      expect(advanceForServer(p, 'FULL')).toBe(0)
    }
  })
})

describe('eleccionDeAdelanto · la mitad la permite el producto', () => {
  it('HALF con permiso → HALF', () => {
    expect(eleccionDeAdelanto('HALF', true)).toBe('HALF')
  })
  it('HALF sin permiso → FULL (dirección segura, no bloquea la venta)', () => {
    expect(eleccionDeAdelanto('HALF', false)).toBe('FULL')
  })
  it('FULL siempre es FULL', () => {
    expect(eleccionDeAdelanto('FULL', true)).toBe('FULL')
    expect(eleccionDeAdelanto('FULL', false)).toBe('FULL')
  })
  it('basura cae en FULL', () => {
    for (const v of [undefined, null, '', 'half', 'MITAD', 0, {}, true]) {
      expect(eleccionDeAdelanto(v, true)).toBe('FULL')
    }
  })
})

describe('ofertaDelProducto · cuánto descuenta la oferta de salida', () => {
  it('solo descuenta cuando el comprador aceptó la oferta', () => {
    expect(ofertaDelProducto(5, true)).toBe(5)
    expect(ofertaDelProducto(5, false)).toBe(0)
  })
  it('un producto sin oferta no descuenta aunque la acepte', () => {
    expect(ofertaDelProducto(0, true)).toBe(0)
    expect(ofertaDelProducto(null, true)).toBe(0)
    expect(ofertaDelProducto(undefined, true)).toBe(0)
  })
  it('acepta lo que Postgres devuelve (numeric como string)', () => {
    expect(ofertaDelProducto('5', true)).toBe(5)
    expect(ofertaDelProducto('7.50', true)).toBe(7.5)
  })
})

describe('saneaProducto · lo que guarda el panel', () => {
  it('permite_mitad solo con un true de verdad', () => {
    expect(saneaProducto({ permite_mitad: true }).permite_mitad).toBe(true)
    expect(saneaProducto({ permite_mitad: 'true' }).permite_mitad).toBe(false)
    expect(saneaProducto({ permite_mitad: 1 }).permite_mitad).toBe(false)
  })
  it('el descuento es finito, entre 0 y el tope, con dos decimales', () => {
    expect(descuentoSaneado(5)).toBe(5)
    expect(descuentoSaneado('5')).toBe(5)
    expect(descuentoSaneado(7.499)).toBe(7.5)
    expect(descuentoSaneado(-3)).toBe(0)
    expect(descuentoSaneado(NaN)).toBe(0)
    expect(descuentoSaneado('abc')).toBe(0)
    expect(descuentoSaneado(DESCUENTO_MAXIMO_PEN + 1000)).toBe(DESCUENTO_MAXIMO_PEN)
  })
  it('solo devuelve las claves que el body trae: un panel viejo no borra nada', () => {
    expect(saneaProducto({})).toEqual({})
    expect(saneaProducto({ descuento_pen: '5' })).toEqual({ descuento_pen: 5 })
    expect(saneaProducto({ permite_mitad: true, descuento_pen: 0 })).toEqual({ permite_mitad: true, descuento_pen: 0 })
  })
})
