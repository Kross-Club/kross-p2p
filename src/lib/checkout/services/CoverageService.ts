// ─── SMART LOGISTICS · Servicio de cobertura ─────────────────────────────────
// Única puerta de entrada a la data de cobertura del courier (Aliclic). La UI
// habla SOLO con esta interfaz: reemplazar el JSON generado por una API real no
// debe tocar ni un componente.
//
// La data sale de scripts/build-coverage.mjs (KML oficial del courier → JSON).
// Los polígonos NO son binarios: cada zona lleva un recargo. Ese recargo es
// costo de la marca, no del comprador — se guarda para medir margen por zona.
//
// El JSON pesa ~96 KB y se carga con import() dinámico: NO entra al bundle
// inicial. Solo se descarga cuando el comprador entra a la rama de provincia,
// que es la única que lo necesita. Por eso todos los métodos son async.

import { BORDERLINE_THRESHOLD_M, COVERAGE_MODE } from '../checkout.config'
import { nearestEdgeM, pointInPolygon } from '../../geo/point-in-polygon'
import type { Polygon, Position } from '../../geo/point-in-polygon'
import type { CityCoverage, CoverageCheck, CoverageZone } from '../types'

interface RawZone extends CoverageZone {
  polygons: Polygon[]
}

interface RawCity {
  name: string
  zones: RawZone[]
  center: [number, number]
  bbox: [number, number, number, number]
}

type CityMap = Record<string, RawCity>

// Se descarga una sola vez por sesión; las llamadas siguientes reusan la promesa.
let cache: Promise<CityMap> | null = null

function loadCities(): Promise<CityMap> {
  // El generador siempre escribe pares [lng, lat]; el cast estrecha number[] a
  // la tupla Position, que TypeScript no puede inferir desde un JSON.
  cache ??= import('../../../data/coverage/aliclic-zones.json')
    .then(m => (m.default as unknown as { cities: CityMap }).cities)
  return cache
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normalizeCity = (s: string): string => deaccent(s).replace(/\s+/g, ' ').trim().toUpperCase()

/** Ciudades con cobertura a domicilio, para poblar el selector. */
export async function coveredCities(): Promise<string[]> {
  const cities = await loadCities()
  return Object.keys(cities).filter(c => c !== 'LIMA').sort()
}

export const CoverageService = {
  /**
   * ¿El courier llega a domicilio en esta ciudad, y hace falta un punto exacto?
   * Si la ciudad no está cubierta, la UI va directo a agencia sin mostrar mapa.
   */
  async getCityCoverage(city: string): Promise<CityCoverage> {
    const found = (await loadCities())[normalizeCity(city)] ?? null
    return {
      city,
      covered: found !== null,
      mode: COVERAGE_MODE.PROVINCIA,
      center: found?.center ?? null,
    }
  },

  /**
   * Evalúa un punto contra los polígonos de su ciudad.
   *
   * Se prefiere la zona de MENOR recargo entre las que contienen el punto: las
   * áreas se solapan, y cobrarle a la marca el recargo más caro cuando una zona
   * base también cubre el punto sería sobreestimar el costo.
   *
   * Un punto dentro pero a menos de BORDERLINE_THRESHOLD_M del borde, o en una
   * zona de visita semanal, se degrada a BORDERLINE → se ofrece agencia.
   */
  async checkPoint(city: string, lat: number, lng: number): Promise<CoverageCheck> {
    const found = (await loadCities())[normalizeCity(city)] ?? null
    if (!found) {
      return { result: 'OUT_OF_ZONE', zone: null, distanceToEdgeM: null, reason: `Ciudad sin cobertura a domicilio: ${city}` }
    }

    const point: Position = [lng, lat]
    const matching = found.zones.filter(z => z.polygons.some(p => pointInPolygon(point, p)))

    if (matching.length === 0) {
      const allPolys = found.zones.flatMap(z => z.polygons)
      const distance = allPolys.length ? nearestEdgeM(point, allPolys) : null
      return { result: 'OUT_OF_ZONE', zone: null, distanceToEdgeM: distance, reason: 'El punto cae fuera de toda zona de reparto' }
    }

    // Recargo desconocido (null) queda al final: ante la duda, gana la zona de
    // costo conocido.
    const zone = matching.reduce((best, z) => ((z.surcharge ?? Infinity) < (best.surcharge ?? Infinity) ? z : best))
    const distance = nearestEdgeM(point, zone.polygons)

    if (zone.weekly) {
      return { result: 'BORDERLINE', zone: toZone(zone), distanceToEdgeM: distance, reason: 'Zona con visita del courier una vez por semana' }
    }
    if (distance < BORDERLINE_THRESHOLD_M) {
      return { result: 'BORDERLINE', zone: toZone(zone), distanceToEdgeM: distance, reason: `A ${Math.round(distance)} m del borde de la zona` }
    }
    return { result: 'IN_ZONE', zone: toZone(zone), distanceToEdgeM: distance, reason: `Dentro de "${zone.label}"` }
  },

  /**
   * Contornos de la ciudad para dibujarlos sobre el mapa. Solo los exteriores:
   * al comprador se le muestra hasta dónde se llega, no el detalle de los huecos.
   */
  async getCityOutlines(city: string): Promise<Position[][]> {
    const found = (await loadCities())[normalizeCity(city)] ?? null
    return found?.zones.flatMap(z => z.polygons.map(p => p.outer)) ?? []
  },
}

function toZone(z: RawZone): CoverageZone {
  return { label: z.label, surcharge: z.surcharge, weekly: z.weekly, pilot: z.pilot, note: z.note }
}
