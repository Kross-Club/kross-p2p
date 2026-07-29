// ─── SMART LOGISTICS · Servicio de agencias ──────────────────────────────────
// Shalom y Olva NO se comportan igual y no se renderizan con el mismo componente,
// pero sí viven detrás de esta misma interfaz: cuando exista el listado de Olva,
// el cambio será de datos, no de código.
//
//   SHALOM → estructurada. 487 sedes con lat/lng (scripts/build-agencies.mjs).
//   OLVA   → sin listado. getNearest devuelve null y la UI cae a texto libre,
//            marcando el pedido para verificación manual de Logística.
//
// El JSON pesa ~129 KB y se carga con import() dinámico: no entra al bundle
// inicial, solo se descarga al abrir la rama de agencia. Por eso todo es async.

import { haversineKm } from '../../geo/haversine'
import type { LatLng } from '../../geo/haversine'
import type { AgencyBranch, AgencyName, NearbyBranch } from '../types'

let cache: Promise<AgencyBranch[]> | null = null

function loadShalom(): Promise<AgencyBranch[]> {
  cache ??= import('../../../data/agencies/shalom.json')
    .then(m => (m.default as { branches: AgencyBranch[] }).branches)
  return cache
}

const deaccent = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string | null | undefined): string => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/** Shalom es la ruta por defecto: menos fricción y menos error de datos. */
export const RECOMMENDED_AGENCY: AgencyName = 'SHALOM'

/** ¿Esta agencia tiene listado estructurado, o hay que pedir texto libre? */
export function hasBranchList(agency: AgencyName): boolean {
  return agency === 'SHALOM'
}

export const AgencyService = {
  hasBranchList,

  /**
   * Las `n` sedes más cercanas al punto. El punto puede ser el pin del comprador
   * o el centroide de su ciudad si nunca lo colocó — nunca se bloquea por no
   * tener pin.
   *
   * Devuelve `null` para las agencias sin listado (Olva): es la señal explícita
   * de que la UI debe caer al input manual, no una lista vacía que se leería
   * como "no hay sedes cerca".
   */
  async getNearest(agency: AgencyName, point: LatLng, n = 3): Promise<NearbyBranch[] | null> {
    if (!hasBranchList(agency)) return null

    return (await loadShalom())
      .map(b => ({ ...b, distanceKm: haversineKm(point, b) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, n)
  },

  /** Listado completo buscable, por si la sede del comprador no está entre las 3. */
  async search(agency: AgencyName, query: string, limit = 50): Promise<AgencyBranch[]> {
    if (!hasBranchList(agency)) return []
    const all = await loadShalom()
    const q = norm(query)
    if (!q) return all.slice(0, limit)

    return all
      .filter(b => norm(`${b.name} ${b.district} ${b.province} ${b.department} ${b.address}`).includes(q))
      .slice(0, limit)
  },

  /** Sedes de un departamento, para acotar el listado completo. */
  async byDepartment(agency: AgencyName, department: string): Promise<AgencyBranch[]> {
    if (!hasBranchList(agency)) return []
    const d = norm(department)
    return (await loadShalom()).filter(b => norm(b.department) === d)
  },

  async getBranch(agency: AgencyName, branchId: string): Promise<AgencyBranch | null> {
    if (!hasBranchList(agency)) return null
    return (await loadShalom()).find(b => b.id === branchId) ?? null
  },

  /** Nº de sedes cargadas. Para tests y diagnóstico, no para la UI. */
  async branchCount(): Promise<number> {
    return (await loadShalom()).length
  },
}

/**
 * Sugerencias para el input libre de Olva, a partir de lo que ya escribieron
 * otros compradores de la misma ciudad. Reduce las variantes de texto que
 * después alguien tiene que limpiar a mano.
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
