import { describe, it, expect } from 'vitest'
import { fraccionVisible, haciaDonde } from './fuera-de-vista'
import type { Caja } from './fuera-de-vista'

const PANTALLA: Caja = { top: 0, bottom: 800, left: 0, right: 1200 }
const caja = (left: number, top: number, w = 200, h = 100): Caja =>
  ({ left, top, right: left + w, bottom: top + h })

describe('cuánto se ve', () => {
  it('entera dentro es 1, entera fuera es 0', () => {
    expect(fraccionVisible(caja(100, 100), PANTALLA)).toBe(1)
    expect(fraccionVisible(caja(-500, 100), PANTALLA)).toBe(0)
    expect(fraccionVisible(caja(100, 2000), PANTALLA)).toBe(0)
  })

  it('a medias es 0.5', () => {
    // La mitad izquierda queda fuera por el borde.
    expect(fraccionVisible(caja(-100, 100), PANTALLA)).toBeCloseTo(0.5)
  })

  // Se mide por área y no por "toca o no toca": una tarjeta asomando un píxel
  // está técnicamente visible y en la práctica no se ve.
  it('asomar un píxel no es verse', () => {
    expect(fraccionVisible(caja(1199, 100), PANTALLA)).toBeCloseTo(1 / 200)
  })

  it('una caja sin área no rompe la división', () => {
    expect(fraccionVisible({ top: 5, bottom: 5, left: 5, right: 5 }, PANTALLA)).toBe(0)
  })
})

describe('hacia dónde está', () => {
  it('lo que se ve no necesita puntero', () => {
    expect(haciaDonde(caja(100, 100), PANTALLA)).toBeNull()
  })

  it('señala el lado por el que se salió', () => {
    expect(haciaDonde(caja(-400, 100), PANTALLA)).toBe('izquierda')
    expect(haciaDonde(caja(1400, 100), PANTALLA)).toBe('derecha')
    expect(haciaDonde(caja(100, -400), PANTALLA)).toBe('arriba')
    expect(haciaDonde(caja(100, 1200), PANTALLA)).toBe('abajo')
  })

  // Manda el eje en el que está MÁS lejos: una flecha hacia abajo mandaría a
  // buscar donde no está.
  it('cuando está fuera por dos lados, gana el más lejano', () => {
    // 600 a la izquierda, 50 arriba.
    expect(haciaDonde({ left: -800, right: -600, top: -50, bottom: 50 }, PANTALLA)).toBe('izquierda')
    // 50 a la izquierda, 600 arriba.
    expect(haciaDonde({ left: -250, right: -50, top: -700, bottom: -600 }, PANTALLA)).toBe('arriba')
  })

  // El umbral no es cero: si lo fuera, el puntero desaparecería justo cuando la
  // tarjeta asoma por el borde, que es cuando todavía hace falta.
  it('asomar por el borde sigue contando como fuera', () => {
    expect(haciaDonde(caja(1150, 100), PANTALLA)).toBe('derecha')
    // Pero ya bien entrada, no.
    expect(haciaDonde(caja(1000, 100), PANTALLA)).toBeNull()
  })

  it('el umbral se puede mover', () => {
    const mitad = caja(-100, 100)
    expect(haciaDonde(mitad, PANTALLA, 0.35)).toBeNull()
    expect(haciaDonde(mitad, PANTALLA, 0.9)).toBe('izquierda')
  })

  // Si no se sale por ningún lado, no hay flecha que dar: señalar una sería
  // mandar a alguien a buscar donde ya está.
  it('sin un lado por el que salirse, no inventa una flecha', () => {
    expect(haciaDonde(caja(100, 100), PANTALLA, 1.5)).toBeNull()
  })

  // Una tarjeta más grande que la pantalla se sale por los cuatro lados. Ahí
  // cualquier flecha es tan buena como otra, pero tiene que ser SIEMPRE la
  // misma: un puntero que cambia de dirección al repintar no se sigue.
  it('con empate, la respuesta es estable', () => {
    const gigante: Caja = { left: -10, right: 1210, top: -10, bottom: 810 }
    const primera = haciaDonde(gigante, PANTALLA, 0.99)
    expect(primera).not.toBeNull()
    expect(haciaDonde(gigante, PANTALLA, 0.99)).toBe(primera)
  })
})
