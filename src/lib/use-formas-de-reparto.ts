// ─── Cómo puede repartir ESTA marca, desde el panel (§60) ────────────────────
//
// Dos formas independientes de llegar a la puerta: el motorizado propio y el
// courier de Lima y Callao. El panel las necesita para saber si al vendedor hay
// que PREGUNTARLE quién lleva este pedido —solo cuando la marca tiene las dos—
// o simplemente decírselo.
//
// Mismo patrón que `use-dominio-de-tienda`: consulta por la marca del PEDIDO
// (el vendedor puede estar en la raíz de la plataforma), cachea por tienda y
// degrada sola si el §60 todavía no está corrido — sin las columnas, ninguna
// forma, que es lo mismo que decía el panel ayer.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { FormasDeReparto } from '../../supabase/functions/_shared/reparto'

const cache = new Map<string, FormasDeReparto>()

export function useFormasDeReparto(storeId: string | null | undefined): FormasDeReparto {
  const [traida, setTraida] = useState<{ id: string; formas: FormasDeReparto } | null>(null)
  useEffect(() => {
    if (!storeId || cache.has(storeId)) return
    let vivo = true
    supabase.from('stores')
      .select('home_delivery_enabled, courier_lima_enabled').eq('id', storeId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo || error || !data) return
        const f = data as FormasDeReparto
        cache.set(storeId, f)
        setTraida({ id: storeId, formas: f })
      })
    return () => { vivo = false }
  }, [storeId])
  if (!storeId) return {}
  return cache.get(storeId) ?? (traida?.id === storeId ? traida.formas : {})
}
