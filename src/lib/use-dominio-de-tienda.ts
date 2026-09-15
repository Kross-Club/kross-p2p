// ─── En qué dirección vive ESTA tienda, desde el panel ───────────────────────
//
// El comprador siempre está en el dominio de la marca, así que `useStore()` le
// contesta solo. El VENDEDOR no: puede estar en `krossclub.app` (quien
// administra la plataforma entra a una marca desde la raíz) y ahí el contexto
// de tienda no sabe de slug ni de dominio propio. Para armar un enlace que se
// va a copiar y reenviar —la guía, el comprobante— hay que preguntarle a la
// base por la marca DEL PEDIDO (15-set-2026). Mismo respaldo que
// `ProductosPage`: si el bloque §50 no está, sin las columnas del dominio.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { TiendaConDominio } from './dominio'

const cache = new Map<string, TiendaConDominio>()

export function useDominioDeTienda(storeId: string | null | undefined): TiendaConDominio | null {
  // Lo que llegó de la base, con la tienda a la que pertenece: si cambia el
  // pedido, lo de antes no vale. Lo cacheado se lee derivado, sin efecto.
  const [traida, setTraida] = useState<{ id: string; tienda: TiendaConDominio } | null>(null)
  useEffect(() => {
    if (!storeId || cache.has(storeId)) return
    let vivo = true
    const pedir = (campos: string) => supabase.from('stores').select(campos).eq('id', storeId).maybeSingle()
    pedir('slug, custom_domain, custom_domain_verified')
      .then(async r => (r.error ? (await pedir('slug')).data : r.data))
      .then(d => {
        if (!vivo || !d) return
        const t = d as unknown as TiendaConDominio
        cache.set(storeId, t)
        setTraida({ id: storeId, tienda: t })
      })
    return () => { vivo = false }
  }, [storeId])
  if (!storeId) return null
  return cache.get(storeId) ?? (traida?.id === storeId ? traida.tienda : null)
}
