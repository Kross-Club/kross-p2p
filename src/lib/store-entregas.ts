import { useCallback, useEffect, useState } from 'react'
import type { SellerProfile } from './seller-session'
import { useDemo } from './demo/modo-demo'
import { entregasDemo } from './demo/tienda-demo'
import { puedeVerClientes } from './store-clients'
import type { GrupoEntrega } from './mapa-entregas'

// ─── El lector del mapa de entregas ──────────────────────────────────────────
//
// Hermano de `store-clients.ts` y con su misma puerta: el mapa vive en la
// libreta de clientes y enseña la facturación de la marca por zona, así que lo
// ve quien ve la libreta.
//
// Lo que llega son GRUPOS, no pedidos: `delivery-map` ya juntó los entregados
// por sitio × producto. Una tienda con meses de historia tiene miles de
// pedidos y unos cientos de combinaciones, y eso es la diferencia entre
// megabytes y decenas de kilobytes.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface StoreEntregas {
  grupos: GrupoEntrega[]
  /** Cuántos pedidos entregados entraron en el conteo. */
  entregados: number
  /** `true` = hay más historia de la que se leyó, así que el total es un piso.
   *  La pantalla lo dice; presentarlo como total sería mentir por omisión. */
  truncado: boolean
  cargando: boolean
  error: boolean
  recargar: () => void
}

interface Datos { grupos: GrupoEntrega[]; entregados: number; truncado: boolean; error: boolean }
const VACIO: Datos = { grupos: [], entregados: 0, truncado: false, error: false }

export function useStoreEntregas(
  real: SellerProfile | null | undefined,
  effective: SellerProfile | null | undefined,
): StoreEntregas {
  // Lo cargado viene ETIQUETADO con la clave que lo pidió, y de ahí sale
  // `cargando` —es "lo que tengo no es de esta tienda"— sin un `setCargando(true)`
  // dentro del efecto, que React 19 marca como cascada de renders. De regalo, al
  // cambiar de marca no parpadea el mapa de la anterior.
  const [datos, setDatos] = useState<{ clave: string; d: Datos } | null>(null)
  const [intento, setIntento] = useState(0)

  // Igual que `list-clients`: autentica por el admin REAL (quien inició sesión)
  // y apunta a la tienda que se está mirando. Son dos cosas distintas cuando el
  // super admin entra a una marca.
  const adminId = real?.auth_user_id
  const storeId = effective?.store_id
  const permitido = puedeVerClientes(effective)
  const demo = useDemo(storeId)

  // Vacía cuando no hay a quién preguntarle: sin admin, sin tienda o sin permiso.
  const clave = demo ? `demo:${storeId ?? ''}#${intento}`
    : adminId && storeId && permitido ? `${adminId}:${storeId}#${intento}`
    : ''

  useEffect(() => {
    if (!clave) return
    let vivo = true

    if (demo) {
      entregasDemo().then(d => { if (vivo) setDatos({ clave, d: { ...d, error: false } }) })
      return () => { vivo = false }
    }

    fetch(`${BASE}/delivery-map`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: adminId, store_id: storeId }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { grupos?: GrupoEntrega[]; entregados?: number; truncado?: boolean }) => {
        if (!vivo) return
        setDatos({ clave, d: {
          grupos: Array.isArray(d.grupos) ? d.grupos : [],
          entregados: d.entregados ?? 0,
          truncado: !!d.truncado,
          error: false,
        } })
      })
      // El error se dice, no se disfraza de mapa vacío: un país sin puntos por
      // un fallo de red haría pensar que la tienda no ha entregado nada.
      .catch(() => { if (vivo) setDatos({ clave, d: { ...VACIO, error: true } }) })

    return () => { vivo = false }
  }, [clave, demo, adminId, storeId])

  const recargar = useCallback(() => setIntento(n => n + 1), [])
  const listo = datos?.clave === clave
  const d = listo ? datos.d : VACIO

  return { ...d, cargando: !!clave && !listo, recargar }
}
