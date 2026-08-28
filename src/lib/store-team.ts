import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { demoActivo } from './demo/modo-demo'
import { tiendaDemo } from './demo/tienda-demo'
import type { SellerProfile } from './seller-session'

// ─── El equipo de la tienda ──────────────────────────────────────────────────
//
// Hermano de `store-orders` y `store-clients`, y por el mismo motivo: la
// consulta vivía dentro de la pantalla de Equipo, y la Lista de pedidos también
// necesita los nombres —para pintar quién atiende cada pedido—. Dos copias de
// una consulta es dos oportunidades de que una traiga un campo que la otra no.
//
// Pinta al instante desde una caché por tienda y revalida detrás: el equipo
// cambia una vez al mes y la pantalla se abre veinte veces al día.

const CACHE = (storeId: string) => `team:${storeId}`

function leerCache(storeId: string | null | undefined): SellerProfile[] {
  if (!storeId) return []
  try {
    const raw = localStorage.getItem(CACHE(storeId))
    return raw ? (JSON.parse(raw) as SellerProfile[]) : []
  } catch {
    return []
  }
}

export interface StoreTeam {
  equipo: SellerProfile[]
  /** Por `auth_user_id`, que es con lo que los pedidos apuntan a su gente. */
  porId: Map<string, SellerProfile>
  cargando: boolean
  recargar: () => void
}

export function useEquipo(effective: SellerProfile | null | undefined): StoreTeam {
  const storeId = effective?.store_id ?? null
  const [datos, setDatos] = useState<{ store: string | null; lista: SellerProfile[] } | null>(null)
  const [intento, setIntento] = useState(0)

  // La caché se lee como valor derivado y no con un `setState` en el efecto: así
  // la primera pintada ya trae el equipo, sin el render en blanco de en medio.
  const cache = useMemo(() => leerCache(storeId), [storeId])
  const equipo = datos && datos.store === storeId ? datos.lista : cache

  useEffect(() => {
    let vivo = true

    if (demoActivo(storeId)) {
      tiendaDemo().then(t => {
        if (vivo) setDatos({ store: storeId, lista: t.equipo as unknown as SellerProfile[] })
      })
      return () => { vivo = false }
    }

    if (!storeId) return

    // Una consulta que falla resuelve igual, con lo que haya en caché: dejar
    // `cargando` colgado sería un spinner eterno en la pantalla de Equipo, que
    // es exactamente el caso que su watchdog venía tapando.
    ;(async () => {
      let lista: SellerProfile[] | null = null
      try {
        const { data } = await supabase.from('sellers')
          .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin, available')
          .eq('store_id', storeId)
        lista = (data as SellerProfile[]) ?? null
      } catch { /* nos quedamos con la caché */ }
      if (!vivo) return
      if (lista) {
        try { localStorage.setItem(CACHE(storeId), JSON.stringify(lista)) } catch { /* sin caché se pide igual */ }
      }
      setDatos({ store: storeId, lista: lista ?? leerCache(storeId) })
    })()

    return () => { vivo = false }
  }, [storeId, intento])

  const porId = useMemo(
    () => new Map(equipo.filter(m => m.auth_user_id).map(m => [m.auth_user_id, m])),
    [equipo],
  )
  const recargar = useCallback(() => setIntento(n => n + 1), [])

  // `cargando` es "todavía no respondió por ESTA tienda". La caché pinta antes,
  // así que casi nunca se ve un vacío.
  const cargando = !datos || datos.store !== storeId

  return { equipo, porId, cargando, recargar }
}

/**
 * Quién está metido en este pedido, en el orden en que importa.
 *
 * Primero el asignado —el dueño de la conversación— y detrás los invitados. Es
 * la misma pregunta que resuelve el chat con sus chips de participantes, pero
 * en la lista solo caben las iniciales.
 */
export function involucradosDe(pedido: {
  assigned_seller_id?: string | null
  involved_seller_ids?: string[] | null
  writer_seller_ids?: string[] | null
}): string[] {
  const vistos = new Set<string>()
  const orden: string[] = []
  for (const id of [pedido.assigned_seller_id, ...(pedido.involved_seller_ids ?? []), ...(pedido.writer_seller_ids ?? [])]) {
    if (!id || vistos.has(id)) continue
    vistos.add(id)
    orden.push(id)
  }
  return orden
}
