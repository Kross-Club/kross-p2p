// ─── SMART LOGISTICS · Servicio de agencias ───────────────────────────────────
// Shalom y Olva ahora tienen las DOS su listado con coordenadas, así que se
// resuelven con el mismo código. `OTRO` no tiene listado: para esa la UI cae a
// texto libre y el pedido queda marcado para verificación manual de Logística.
//
//   SHALOM → 487 sedes (scripts/build-agencies.mjs, desde su CSV)
//   OLVA   → 424 sedes (scripts/build-olva.mjs, desde su buscador)
//
// Cada JSON pesa ~130 KB y se carga con import() dinámico: no entran al bundle
// inicial, solo se descargan al abrir la rama de agencia. Por eso todo es async.

import { formatDistance, haversineKm } from '../../geo/haversine'
import type { LatLng } from '../../geo/haversine'
import { COPY, NEARBY_LABEL_THRESHOLD_KM } from '../checkout.config'
import type { AgencyBranch, AgencyName, NearbyBranch, RawAgencyBranch } from '../types'

type Loader = () => Promise<AgencyBranch[]>

const cache = new Map<AgencyName, Promise<AgencyBranch[]>>()

/** Le pega su courier a cada sede: el JSON es por agencia y no lo trae dentro. */
function tag(agency: AgencyName, branches: RawAgencyBranch[]): AgencyBranch[] {
  return branches.map(b => ({ ...b, agency }))
}

/** `null` = esa agencia no tiene listado y la UI debe pedir texto libre. */
const LOADERS: Record<AgencyName, Loader | null> = {
  SHALOM: () => import('../../../data/agencies/shalom.json')
    .then(m => tag('SHALOM', (m.default as { branches: RawAgencyBranch[] }).branches)),
  OLVA: () => import('../../../data/agencies/olva.json')
    .then(m => tag('OLVA', (m.default as { branches: RawAgencyBranch[] }).branches)),
  OTRO: null,
}

/**
 * Las agencias con listado. Se DERIVA de `LOADERS`, así que sumar un courier
 * nuevo (Marvisur, Cruz del Sur) es agregar su loader y nada más: entra solo a
 * los rankings, a la búsqueda y a la UI.
 */
export const LISTED_AGENCIES: AgencyName[] =
  (Object.keys(LOADERS) as AgencyName[]).filter(a => LOADERS[a] !== null)

function load(agency: AgencyName): Promise<AgencyBranch[]> | null {
  const loader = LOADERS[agency]
  if (!loader) return null
  if (!cache.has(agency)) cache.set(agency, loader())
  return cache.get(agency)!
}

/**
 * Todas las sedes de todas las agencias con listado.
 *
 * `allSettled` y no `all` a propósito: si el JSON de un courier no carga, se
 * sigue con los que sí. Quedarse sin ninguna sede porque falló uno de dos
 * archivos convierte un problema de red en una venta perdida.
 */
async function loadAll(): Promise<AgencyBranch[]> {
  const settled = await Promise.allSettled(LISTED_AGENCIES.map(a => load(a)!))
  return settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string | null | undefined): string => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

const hasCoords = (b: AgencyBranch): b is AgencyBranch & { lat: number; lng: number } =>
  b.lat !== null && b.lng !== null

const byDistance = (point: LatLng) => (b: AgencyBranch & { lat: number; lng: number }): NearbyBranch =>
  ({ ...b, distanceKm: haversineKm(point, { lat: b.lat, lng: b.lng }) })

/**
 * Llave única de un punto de recojo.
 *
 * Los ids solo son únicos DENTRO de cada agencia — Shalom tiene una sede "4" y
 * Olva también. En una lista que mezcla couriers, comparar solo por id
 * seleccionaría dos tarjetas a la vez.
 */
export const pointKey = (b: { agency: AgencyName; id: string }): string => `${b.agency}:${b.id}`

/**
 * Cómo se le cuenta la cercanía al comprador.
 *
 * La distancia se mide contra el centroide del distrito, que sale de promediar
 * las sedes mismas: en la mitad del país eso da cifras de 0 a 50 m, que no
 * informan nada. Por debajo del umbral se dice "En tu distrito" —que es lo que
 * el número realmente significa— y por encima sí va la cifra, que ahí ya
 * distingue entre recoger a la vuelta y viajar 30 km.
 */
export function describePickupDistance(km: number): string {
  return km < NEARBY_LABEL_THRESHOLD_KM ? COPY.pickupInDistrict : `a ${formatDistance(km)}`
}

/** ¿Esta agencia tiene listado estructurado, o hay que pedir texto libre? */
export function hasBranchList(agency: AgencyName): boolean {
  return LOADERS[agency] !== null
}

export const AgencyService = {
  hasBranchList,

  /**
   * Los `n` puntos de recojo más cercanos, **de todas las agencias juntas**.
   *
   * Aquí murió `RECOMMENDED_AGENCY`, que fijaba Shalom para todo el país. Con
   * 911 sedes, cuál conviene depende de la zona: Shalom domina la costa (Ica
   * 18-5, Lambayeque 21-9) y Olva la sierra centro (Huancavelica 9-1, Ayacucho
   * 13-5). Una constante global recomendaba la agencia equivocada en 11 de los
   * 25 departamentos, y en Huancavelica empujaba a la ÚNICA sede que Shalom
   * tiene ahí.
   *
   * Ordenar por distancia real hace emerger esa regionalización sola, sin tabla
   * por departamento que mantener cada vez que un courier abre un local.
   */
  async getNearestPoints(point: LatLng, n = 3): Promise<NearbyBranch[]> {
    return (await loadAll())
      .filter(hasCoords)
      .map(byDistance(point))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, n)
  },

  /** Búsqueda por texto sobre TODAS las agencias, para cuando su punto no está
   *  entre los más cercanos. */
  async searchPoints(query: string, limit = 30): Promise<AgencyBranch[]> {
    const list = await loadAll()
    const q = norm(query)
    if (!q) return list.slice(0, limit)
    return list
      .filter(b => norm(`${b.agency} ${b.name} ${b.district} ${b.province} ${b.department} ${b.address}`).includes(q))
      .slice(0, limit)
  },

  /**
   * Las `n` sedes más cercanas **de una sola agencia**. El punto es el centroide
   * del distrito elegido: nunca se le pide al comprador su ubicación para esto.
   *
   * El checkout ya no la usa —ahí manda `getNearestPoints`, que mezcla las dos—
   * pero sigue viva para diagnóstico y para comparar cobertura entre couriers.
   *
   * Las sedes sin coordenadas quedan fuera de este ranking —no se pueden ordenar
   * por distancia— pero siguen apareciendo en `search()`, así que nadie se queda
   * sin poder elegir su agencia.
   *
   * Devuelve `null` si la agencia no tiene listado: es la señal explícita de que
   * la UI debe caer al input manual, no una lista vacía que se leería como "no
   * hay sedes cerca".
   */
  async getNearest(agency: AgencyName, point: LatLng, n = 3): Promise<NearbyBranch[] | null> {
    const all = load(agency)
    if (!all) return null

    return (await all)
      .filter(hasCoords)
      .map(byDistance(point))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, n)
  },

  /** Listado completo buscable, por si la sede del comprador no está entre las 3. */
  async search(agency: AgencyName, query: string, limit = 50): Promise<AgencyBranch[]> {
    const all = load(agency)
    if (!all) return []
    const list = await all
    const q = norm(query)
    if (!q) return list.slice(0, limit)

    return list
      .filter(b => norm(`${b.name} ${b.district} ${b.province} ${b.department} ${b.address}`).includes(q))
      .slice(0, limit)
  },

  /** Sedes de un departamento, para acotar el listado completo. */
  async byDepartment(agency: AgencyName, department: string): Promise<AgencyBranch[]> {
    const all = load(agency)
    if (!all) return []
    const d = norm(department)
    return (await all).filter(b => norm(b.department) === d)
  },

  async getBranch(agency: AgencyName, branchId: string): Promise<AgencyBranch | null> {
    const all = load(agency)
    if (!all) return null
    return (await all).find(b => b.id === branchId) ?? null
  },

  /** Nº de sedes cargadas. Para tests y diagnóstico, no para la UI. */
  async branchCount(agency: AgencyName): Promise<number> {
    const all = load(agency)
    return all ? (await all).length : 0
  },
}

/**
 * Sugerencias para el input libre de las agencias sin listado, a partir de lo
 * que ya escribieron otros compradores de la misma ciudad. Reduce las variantes
 * de texto que después alguien tiene que limpiar a mano.
 *
 * El histórico entra por parámetro (lo consulta una Edge Function) para no
 * acoplar este módulo a Supabase. Es una función pura.
 */
export function suggestFreeText(history: string[], query: string, limit = 5): string[] {
  const q = norm(query)
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of history) {
    const value = raw.trim()
    const key = norm(value)
    if (!value || seen.has(key)) continue
    if (q && !key.includes(q)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}
