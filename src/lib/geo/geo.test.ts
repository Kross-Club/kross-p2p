// Tests de las utilidades puras de geo. Son la base de la decisión de cobertura:
// si fallan, el checkout promete entregas que el motorizado no puede cumplir.

import { describe, expect, it } from 'vitest'
import { formatDistance, haversineKm } from './haversine'
import {
  distanceToEdgeM, inBbox, nearestEdgeM, pointInAny, pointInPolygon, pointInRing,
} from './point-in-polygon'
import type { Polygon, Ring } from './point-in-polygon'

// Cuadrado de 1° de lado con esquina en (0,0). Coordenadas [lng, lat].
const SQUARE: Ring = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]
const square = (): Polygon => ({ outer: SQUARE, holes: [] })

// Cuadrado con un agujero central.
const HOLE: Ring = [[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4], [0.4, 0.4]]
const donut = (): Polygon => ({ outer: SQUARE, holes: [HOLE] })

describe('haversineKm', () => {
  it('da 0 para el mismo punto', () => {
    expect(haversineKm({ lat: -12.05, lng: -77.04 }, { lat: -12.05, lng: -77.04 })).toBe(0)
  })

  it('mide Lima–Trujillo con menos de 1 % de error', () => {
    // ~487 km en línea recta entre los centros de ambas ciudades.
    const d = haversineKm({ lat: -12.0464, lng: -77.0428 }, { lat: -8.1116, lng: -79.0288 })
    expect(d).toBeGreaterThan(482)
    expect(d).toBeLessThan(492)
  })

  it('es simétrica', () => {
    const a = { lat: -16.409, lng: -71.537 }
    const b = { lat: -13.532, lng: -71.967 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })

  it('aproxima 111 km por grado de latitud', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1)
  })
})

describe('formatDistance', () => {
  it('usa metros por debajo del kilómetro', () => {
    expect(formatDistance(0.85)).toBe('850 m')
  })
  it('usa km con un decimal por encima', () => {
    expect(formatDistance(3.44)).toBe('3.4 km')
  })
})

describe('pointInRing', () => {
  it('detecta un punto interior', () => {
    expect(pointInRing([0.5, 0.5], SQUARE)).toBe(true)
  })

  it('descarta puntos exteriores en las cuatro direcciones', () => {
    expect(pointInRing([-0.5, 0.5], SQUARE)).toBe(false)
    expect(pointInRing([1.5, 0.5], SQUARE)).toBe(false)
    expect(pointInRing([0.5, -0.5], SQUARE)).toBe(false)
    expect(pointInRing([0.5, 1.5], SQUARE)).toBe(false)
  })

  it('no cuenta dos veces un vértice a la altura exacta del rayo', () => {
    // Un triángulo con el vértice superior justo en y = 1. Un punto a esa altura
    // y a la izquierda debe quedar FUERA; el bug clásico lo da dentro.
    const tri: Ring = [[0, 0], [1, 1], [2, 0], [0, 0]]
    expect(pointInRing([-1, 1], tri)).toBe(false)
  })

  it('maneja un polígono cóncavo (forma de U)', () => {
    const u: Ring = [[0, 0], [0, 3], [1, 3], [1, 1], [2, 1], [2, 3], [3, 3], [3, 0], [0, 0]]
    expect(pointInRing([1.5, 0.5], u)).toBe(true)  // en la base de la U
    expect(pointInRing([1.5, 2], u)).toBe(false)   // en el hueco de la U
  })
})

describe('pointInPolygon', () => {
  it('excluye los agujeros', () => {
    expect(pointInPolygon([0.5, 0.5], square())).toBe(true)
    expect(pointInPolygon([0.5, 0.5], donut())).toBe(false)
  })

  it('acepta un punto dentro del contorno pero fuera del agujero', () => {
    expect(pointInPolygon([0.1, 0.1], donut())).toBe(true)
  })
})

describe('pointInAny', () => {
  it('basta con que un polígono contenga el punto', () => {
    const other: Polygon = { outer: [[5, 5], [5, 6], [6, 6], [6, 5], [5, 5]], holes: [] }
    expect(pointInAny([0.5, 0.5], [other, square()])).toBe(true)
    expect(pointInAny([9, 9], [other, square()])).toBe(false)
  })
})

describe('distanceToEdgeM', () => {
  it('mide la distancia al borde más cercano desde dentro', () => {
    // Punto a 0.1° al este del borde oeste, sobre el ecuador → ~11.1 km.
    const d = distanceToEdgeM([0.1, 0.5], square())
    expect(d).toBeGreaterThan(11_000)
    expect(d).toBeLessThan(11_300)
  })

  it('también mide desde fuera', () => {
    expect(distanceToEdgeM([-0.1, 0.5], square())).toBeGreaterThan(11_000)
  })

  it('tiene en cuenta el borde del agujero', () => {
    // El centro del dónut está más cerca del agujero que del contorno exterior.
    expect(distanceToEdgeM([0.5, 0.5], donut())).toBeLessThan(distanceToEdgeM([0.5, 0.5], square()))
  })

  it('vale ~0 justo sobre el borde', () => {
    expect(distanceToEdgeM([0, 0.5], square())).toBeLessThan(1)
  })

  it('no revienta con vértices duplicados (segmento degenerado)', () => {
    const dup: Polygon = { outer: [[0, 0], [0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], holes: [] }
    expect(Number.isFinite(distanceToEdgeM([0.5, 0.5], dup))).toBe(true)
  })
})

describe('nearestEdgeM', () => {
  it('devuelve la menor distancia entre varios polígonos', () => {
    const far: Polygon = { outer: [[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]], holes: [] }
    expect(nearestEdgeM([0.1, 0.5], [square(), far])).toBeLessThan(12_000)
  })
})

describe('inBbox', () => {
  it('acepta el interior y los bordes, rechaza el exterior', () => {
    const bbox: [number, number, number, number] = [-77.2, -12.4, -76.6, -11.7]
    expect(inBbox([-77.0, -12.0], bbox)).toBe(true)
    expect(inBbox([-77.2, -12.4], bbox)).toBe(true)
    expect(inBbox([-70.0, -12.0], bbox)).toBe(false)
  })
})
