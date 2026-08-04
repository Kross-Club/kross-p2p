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
interface Centroids {
  districts: Record<string, LatLng>
  provinces: Record<string, LatLng>
  departments: Record<string, LatLng>
}
let centroidsCache: Promise<Centroids> | null = null

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

/**
 * Lima metropolitana = provincia de Lima + Callao. Es lo que cubre el motorizado
 * propio; todo lo demás va por courier o agencia, incluidas las otras nueve
 * provincias del departamento de Lima.
 *
 * El Callao es su PROPIO departamento en el padrón del INEI, no una provincia de
 * Lima. Darlo por provincia lo dejaba fuera de las dos ramas.
 */
export function isLimaMetro(d: { department: string; province: string }): boolean {
  return d.department === 'Callao' || (d.department === 'Lima' && d.province === 'Lima')
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

  /**
   * Los distritos de cada rama del checkout. Van JUNTOS a propósito: son
   * complementarios, y escritos por separado dejaron un agujero.
   *
   * Lima decía `department === 'Lima' && province ∈ {Lima, Callao}` y provincia
   * decía `department !== 'Lima'`. Entre las dos se perdían **los 128 distritos
   * del departamento de Lima que no son Lima metropolitana** —Barranca,
   * Paramonga, Huacho, Cañete, Huaral, Chancay…— que no aparecían en ninguna
   * rama. Para esa gente su distrito simplemente no existía.
   *
   * Se notaba poco porque el catálogo hecho a mano casi no los listaba. Al traer
   * el padrón completo del INEI el agujero pasó a ser de 128 distritos reales.
   */
  async districtsFor(branch: 'LIMA' | 'PROVINCIA'): Promise<DistrictOption[]> {
    const all = await loadIndex()
    return all.filter(d => (branch === 'LIMA') === isLimaMetro(d))
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
   * Punto aproximado del lugar elegido, para ordenar las agencias por cercanía
   * sin pedirle al comprador su ubicación. Sale del promedio de las sedes de
   * Shalom y Olva que caen ahí.
   *
   * **Degrada distrito → provincia → departamento.** Si solo mirara el distrito,
   * alguien en un distrito sin sedes (Poroy, en Cusco) se quedaba sin punto de
   * referencia y el listado le ofrecía sedes de Amazonas. La provincia siempre
   * da algo razonablemente cerca.
   */
  async getDistrictCenter(department: string, province: string, district: string): Promise<LatLng | null> {
    centroidsCache ??= import('../../../data/coverage/district-centroids.json')
      .then(m => m.default as unknown as Centroids)
    const c = await centroidsCache
    const found =
      c.districts[`${norm(department)}|${norm(district)}`] ??
      c.provinces[`${norm(department)}|${norm(province)}`] ??
      c.departments[norm(department)]
    return found ? { lat: found.lat, lng: found.lng } : null
  },
}

/** Traduce el veredicto al método de entrega que se le ofrece al comprador. */
export function methodForCoverage(result: CoverageResult | null): 'DOMICILIO' | 'AGENCIA' | null {
  if (result === 'IN_ZONE') return 'DOMICILIO'
  if (result === 'OUT_OF_ZONE' || result === 'BORDERLINE') return 'AGENCIA'
  return null
}
