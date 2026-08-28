import { useCallback, useEffect, useState } from 'react'
import type { SellerProfile } from './seller-session'
import { useDemo } from './demo/modo-demo'
import { curiososDemo } from './demo/tienda-demo'

// ─── Curiosos: los que dejaron DNI y WhatsApp y no siguieron ─────────────────
//
// Es la primera columna del tablero y la única que NO son pedidos. Un curioso
// llenó lo justo para ser recontactable —DNI, con el que se crea la cuenta, y
// WhatsApp, con el que se le escribe— y ahí se detuvo. Vive en
// `checkout_drafts`, fuera de `order_sessions`, a propósito: un lead que nunca
// compró contaminaría el CRM y el round-robin le asignaría un vendedor a cada
// uno (ver el bloque 12 de `supabase/setup-kross.sql`).
//
// Lo que se sabe: qué producto miró. Lo que NO se sabe: distrito ni agencia —
// esos campos van después en el formulario. Por eso la columna no promete un
// pedido: promete una llamada.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Un lead tal como lo devuelve `get-store-drafts`: el espejo de su `select`. */
export interface Curioso {
  order_id: string
  store_id?: string | null
  phone?: string | null
  buyer_name?: string | null
  document_number?: string | null
  product_id?: string | null
  pack_name?: string | null
  location_type?: string | null
  district?: string | null
  /** Hasta qué paso del formulario llegó. Cuanto más alto, más cerca estuvo. */
  last_step?: number | null
  created_at?: string
  updated_at?: string
}

export interface StoreDrafts {
  curiosos: Curioso[]
  cargando: boolean
  recargar: () => void
}

/**
 * Los curiosos de la tienda.
 *
 * Sin filtro por vendedor, al revés que los pedidos: un lead no tiene dueño
 * —nadie se lo asignó, ese es justo el punto— así que filtrarlo por
 * `involved_seller_ids` lo escondería de todos. Lo ve quien mire el tablero de
 * la marca.
 */
export function useStoreDrafts(effective: SellerProfile | null | undefined): StoreDrafts {
  // La lista guardada VIENE ETIQUETADA con la clave que la pidió. De ahí sale
  // `cargando` —es "lo que tengo no es de esta tienda"— sin un `setCargando(true)`
  // dentro del efecto, que React 19 marca como cascada de renders. De regalo, al
  // cambiar de marca no parpadean los curiosos de la anterior.
  const [datos, setDatos] = useState<{ clave: string; curiosos: Curioso[] } | null>(null)
  const [intento, setIntento] = useState(0)

  const storeId = effective?.store_id
  const demo = useDemo(storeId)

  // Vacía cuando no hay a quién preguntarle: ni demo ni tienda resuelta.
  const clave = demo ? `demo#${intento}` : storeId ? `${storeId}#${intento}` : ''

  useEffect(() => {
    if (!clave) return
    let vivo = true

    if (demo) {
      curiososDemo().then(cs => { if (vivo) setDatos({ clave, curiosos: cs }) })
      return () => { vivo = false }
    }

    fetch(`${BASE}/get-store-drafts`, {
      headers: { Authorization: `Bearer ${ANON}`, 'x-store-id': storeId! },
    })
      // La columna es un extra: si la función todavía no está desplegada, el
      // tablero tiene que seguir funcionando sin ella en vez de romperse.
      .then(r => (r.ok ? r.json() : []))
      .then((data: Curioso[]) => { if (vivo) setDatos({ clave, curiosos: Array.isArray(data) ? data : [] }) })
      .catch(() => { if (vivo) setDatos({ clave, curiosos: [] }) })

    // Corta la respuesta que quedó en el aire cuando el vendedor cambió de
    // tienda: sin esto la lista vieja podía pisar a la nueva.
    return () => { vivo = false }
  }, [clave, demo, storeId])

  const recargar = useCallback(() => setIntento(n => n + 1), [])
  const listo = datos?.clave === clave

  return {
    curiosos: listo ? datos.curiosos : [],
    cargando: !!clave && !listo,
    recargar,
  }
}

/** Lo que se muestra del curioso, sin inventar lo que no se sabe. */
export function nombreDeCurioso(c: Curioso): string {
  return c.buyer_name?.trim() || 'Sin nombre'
}

/** Dónde está, si es que lo dijo. Un curioso puede haberse ido antes del distrito. */
export function zonaDeCurioso(c: Curioso): string | null {
  const partes = [c.district, c.location_type === 'PROVINCIA' ? 'Provincia' : c.location_type === 'LIMA' ? 'Lima' : null]
  const vistos = partes.filter(Boolean) as string[]
  return vistos.length ? vistos.join(' · ') : null
}
