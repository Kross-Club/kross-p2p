import { describe, it, expect } from 'vitest'
import { proyector, caminoDe } from './mapa-peru'

const PERU = { minLng: -81.6, maxLng: -68.5, minLat: -18.6, maxLat: -3.2 }

describe('proyectar el Perú sobre un lienzo', () => {
  // Sin corregir por el coseno de la latitud, el Perú sale gordo.
  it('la proyección corrige la longitud por la latitud', () => {
    const p = proyector(PERU, 700, 880)
    expect(p.x(PERU.minLng)).toBeCloseTo(0)
    expect(p.y(PERU.maxLat)).toBeCloseTo(0)
    // Un grado de longitud ocupa menos que uno de latitud.
    expect(p.x(-80.6) - p.x(-81.6)).toBeLessThan(p.y(-4.2) - p.y(-3.2))
  })

  // El norte arriba y el oeste a la izquierda. Suena obvio; invertir el eje Y
  // es el error clásico al pasar de latitudes a píxeles, y da un país al revés.
  it('el norte queda arriba', () => {
    const p = proyector(PERU, 700, 880)
    expect(p.y(PERU.maxLat)).toBeLessThan(p.y(PERU.minLat))
    expect(p.x(PERU.minLng)).toBeLessThan(p.x(PERU.maxLng))
  })

  it('el país cabe en el lienzo que se le da', () => {
    const p = proyector(PERU, 700, 880)
    expect(p.x(PERU.maxLng)).toBeLessThanOrEqual(700.01)
    expect(p.y(PERU.minLat)).toBeLessThanOrEqual(880.01)
  })

  it('el camino cierra el anillo', () => {
    const p = proyector(PERU, 100, 100)
    const d = caminoDe([[-81.6, -3.2], [-68.5, -3.2], [-68.5, -18.6]], p.x, p.y)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.split('L').length).toBe(3)
  })
})
