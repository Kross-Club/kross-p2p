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

import { haversineKm } from '../../geo/haversine'
import type { LatLng } from '../../geo/haversine'
import type { AgencyBranch, AgencyName, NearbyBranch } from '../types'

type Loader = () => Promise<AgencyBranch[]>

const cache = new Map<AgencyName, Promise<AgencyBranch[]>>()

/** `null` = esa agencia no tiene listado y la UI debe pedir texto libre. */
const LOADERS: Record<AgencyName, Loader | null> = {
  SHALOM: () => import('../../../data/agencies/shalom.json')
    .then(m => (m.default as { branches: AgencyBranch[] }).branches),
  OLVA: () => import('../../../data/agencies/olva.json')
    .then(m => (m.default as { branches: AgencyBranch[] }).branches),
  OTRO: null,
}

function load(agency: AgencyName): Promise<AgencyBranch[]> | null {
  const loader = LOADERS[agency]
  if (!loader) return null
  if (!cache.has(agency)) cache.set(agency, loader())
  return cache.get(agency)!
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string | null | undefined): string => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Shalom sigue siendo la recomendada aunque ambas tengan listado: su adelanto es
 * S/10 contra S/20 de Olva. La ruta más barata para el comprador es también la
 * que se muestra primero.
 */
export const RECOMMENDED_AGENCY: AgencyName = 'SHALOM'

/** ¿Esta agencia tiene listado estructurado, o hay que pedir texto libre? */
export function hasBranchList(agency: AgencyName): boolean {
  return LOADERS[agency] !== null
}

export const AgencyService = {
  hasBranchList,

  /**
   * Las `n` sedes más cercanas al punto. El punto es el centroide del distrito
   * elegido: nunca se le pide al comprador su ubicación para esto.
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
      .filter((b): b is AgencyBranch & { lat: number; lng: number } => b.lat !== null && b.lng !== null)
      .map(b => ({ ...b, distanceKm: haversineKm(point, { lat: b.lat, lng: b.lng }) }))
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
