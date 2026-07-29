// ─── SMART LOGISTICS · Cobertura por distrito (la que DECIDE la venta) ───────
// Fuente: tarifario oficial del courier → src/data/coverage/aliclic-districts.json
// (generado por scripts/build-districts.mjs). Este servicio responde la única
// pregunta que el checkout necesita: ¿le prometemos entrega a domicilio o le
// ofrecemos agencia?
//
// Por qué distrito y no polígono: se comparó el veredicto de ambas fuentes con
// las 487 sedes de Shalom como muestra de dónde hay gente, y coinciden en el
// 94,9 %. El mapa costaba un paso a todos para ganar precisión en el 5 %.
// Los polígonos siguen vivos en CoverageService, pero post-venta.
//
// ~36 KB + ~40 KB de índice, con import() dinámico: no entran al bundle inicial.

import { AGENCY_ONLY_CITIES } from '../checkout.config'
import type { LatLng } from '../../geo/haversine'
import type { CoverageResult, DistrictCoverage, DistrictOption } from '../types'

interface RawDistrict {
  city: string
  department: string
  province: string
  district: string
  eta: string | null
  tariff: number | null
  zoned: boolean
  weekly: boolean
  weekdaysOnly: boolean
}

let coverageCache: Promise<Record<string, RawDistrict>> | null = null
let indexCache: Promise<DistrictOption[]> | null = null
let centroidsCache: Promise<Record<string, LatLng>> | null = null

function loadCoverage(): Promise<Record<string, RawDistrict>> {
  coverageCache ??= import('../../../data/coverage/aliclic-districts.json')
    .then(m => (m.default as { districts: Record<string, RawDistrict> }).districts)
  return coverageCache
}

function loadIndex(): Promise<DistrictOption[]> {
  indexCache ??= import('../../../data/coverage/peru-districts.json')
    .then(m => (m.default as { districts: DistrictOption[] }).districts)
  return indexCache
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string): string => deaccent(s).replace(/\s+/g, ' ').trim().toUpperCase()

/** Llave canónica de un distrito. Departamento y provincia desambiguan los
 *  homónimos: hay un Miraflores en Lima y otro en Arequipa. */
export function districtKey(department: string, province: string, district: string): string {
  return `${norm(department)}|${norm(province)}|${norm(district)}`
}

export const DistrictCoverageService = {
  /**
   * Todos los distritos seleccionables del país — cubiertos y no cubiertos. El
   * selector los muestra TODOS: quien vive en un distrito sin cobertura a
   * domicilio igual compra, por agencia. Nunca hay callejón sin salida.
   */
  async listDistricts(): Promise<DistrictOption[]> {
    return loadIndex()
  },

  /** Busca distritos por nombre, provincia o departamento (select con búsqueda). */
  async search(query: string, limit = 20): Promise<DistrictOption[]> {
    const all = await loadIndex()
    const q = norm(query)
    if (!q) return all.slice(0, limit)
    return all
      .filter(d => norm(`${d.district} ${d.province} ${d.department}`).includes(q))
      .slice(0, limit)
  },

  /**
   * El veredicto que decide la rama del checkout.
   *
   *   IN_ZONE     → se le ofrece entrega a domicilio
   *   BORDERLINE  → cubierto, pero la promesa es frágil (el courier pasa una vez
   *                 por semana, o la ciudad está en la lista operativa de solo
   *                 agencia). Se ofrece agencia: prometer puerta a puerta y
   *                 fallar cuesta más que ofrecer agencia de más.
   *   OUT_OF_ZONE → sin cobertura a domicilio → agencia
   */
  async checkDistrict(department: string, province: string, district: string): Promise<DistrictCoverage> {
    const found = (await loadCoverage())[districtKey(department, province, district)]

    if (!found) {
      return {
        result: 'OUT_OF_ZONE', city: null, eta: null, tariff: null,
        weekly: false, weekdaysOnly: false, zoned: false,
        reason: `Sin cobertura a domicilio en ${district}, ${province}`,
      }
    }

    const base = {
      city: found.city,
      eta: found.eta,
      tariff: found.tariff,
      weekly: found.weekly,
      weekdaysOnly: found.weekdaysOnly,
      zoned: found.zoned,
    }

    if (AGENCY_ONLY_CITIES.map(norm).includes(norm(found.city))) {
      return { ...base, result: 'BORDERLINE', reason: `${found.city} está marcada como solo agencia` }
    }
    if (found.weekly) {
      return { ...base, result: 'BORDERLINE', reason: 'El courier visita esta zona una vez por semana' }
    }
    return { ...base, result: 'IN_ZONE', reason: `Cobertura a domicilio en ${found.district} (${found.eta ?? 'sin ETA'})` }
  },

  /** ¿Se le puede ofrecer domicilio? Azúcar para la UI. */
  async offersHomeDelivery(department: string, province: string, district: string): Promise<boolean> {
    const c = await this.checkDistrict(department, province, district)
    return c.result === 'IN_ZONE'
  },

  /**
   * Punto aproximado del distrito, para ordenar las sedes de agencia por
   * cercanía. Sale del promedio de las sedes Shalom que caen en él: no es el
   * centro geométrico real, pero ubica mucho mejor que nada y no depende de
   * ninguna fuente externa. `null` si el distrito no tiene ninguna sede — ahí la
   * UI cae al listado buscable.
   */
  async getDistrictCenter(department: string, district: string): Promise<LatLng | null> {
    centroidsCache ??= import('../../../data/coverage/district-centroids.json')
      .then(m => (m.default as { centroids: Record<string, LatLng> }).centroids)
    const found = (await centroidsCache)[`${norm(department)}|${norm(district)}`]
    return found ? { lat: found.lat, lng: found.lng } : null
  },
}

/** Traduce el veredicto al método de entrega que se le ofrece al comprador. */
export function methodForCoverage(result: CoverageResult | null): 'DOMICILIO' | 'AGENCIA' | null {
  if (result === 'IN_ZONE') return 'DOMICILIO'
  if (result === 'OUT_OF_ZONE' || result === 'BORDERLINE') return 'AGENCIA'
  return null
}
