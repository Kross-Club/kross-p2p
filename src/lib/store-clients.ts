import { useCallback, useEffect, useState } from 'react'
import type { SellerProfile } from './seller-session'
import { demoActivo } from './demo/modo-demo'
import { tiendaDemo } from './demo/tienda-demo'
import type { Segmento } from '../../supabase/functions/_shared/clientes.ts'

// ─── El lector de clientes de la tienda ──────────────────────────────────────
//
// Hermano de `store-orders.ts`, y por el mismo motivo: que la definición viva
// en un solo sitio. Acá la carga la hace `list-clients`, que además calcula el
// LTV y el segmento con la MISMA matemática que la pantalla de Reactivar y que
// el disparo de campañas (`_shared/clientes.ts`).

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type { Segmento }

export interface Cliente {
  id: string
  nombre: string | null
  document_type: string | null
  document_number: string | null
  phone: string | null
  puntos: number | null
  score: number | null
  /** 'order' = llegó comprando · 'import' = lo subió el vendedor por CSV */
  source: string | null
  /** Primer ingreso del cliente a la app. `null` = todavía no la usó. */
  activated_at: string | null
  created_at: string | null
  /** Pedidos ENTREGADOS. Es la única definición de "me compró". */
  pedidos: number
  /** Lo que de verdad se cobró de esta persona. */
  gastado: number
  ultimo: string | null
  segmento: Segmento
}

export interface PedidoDeCliente {
  id: string
  token: string | null
  product_name: string | null
  pack_name: string | null
  product_price: number | null
  stage: string | null
  status: string | null
  created_at: string | null
  tracking_phase: string | null
}

/** Quién puede ver la libreta de clientes. `buyers` guarda DNI y teléfono, así
 *  que la puerta es la misma que la de las grabaciones: solo el admin. */
export function puedeVerClientes(effective: SellerProfile | null | undefined): boolean {
  return !!effective?.is_admin
}

export interface StoreClients {
  clientes: Cliente[]
  cargando: boolean
  error: boolean
  recargar: () => void
}

export function useStoreClients(
  real: SellerProfile | null | undefined,
  effective: SellerProfile | null | undefined,
): StoreClients {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)

  // `list-clients` autentica por el admin REAL (quien inició sesión) y apunta a
  // la tienda que se está mirando: son dos cosas distintas cuando el super
  // admin entra a una marca.
  const adminId = real?.auth_user_id
  const storeId = effective?.store_id
  const permitido = puedeVerClientes(effective)

  const demo = demoActivo()

  useEffect(() => {
    let vivo = true

    if (demo) {
      setCargando(true); setError(false)
      tiendaDemo().then(t => { if (vivo) { setClientes(t.clientes); setCargando(false) } })
      return () => { vivo = false }
    }

    if (!adminId || !storeId || !permitido) { setCargando(false); return }
    setCargando(true)
    setError(false)
    fetch(`${BASE}/list-clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: adminId, store_id: storeId }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { clientes?: Cliente[] }) => { if (vivo) setClientes(d.clientes ?? []) })
      .catch(() => { if (vivo) { setClientes([]); setError(true) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [demo, adminId, storeId, permitido, intento])

  const recargar = useCallback(() => setIntento(n => n + 1), [])
  return { clientes, cargando, error, recargar }
}

/** Trae la ficha de una persona: sus datos y su historial de pedidos. */
export async function fichaDeCliente(
  adminId: string, storeId: string | undefined, buyerId: string,
): Promise<{ cliente: Cliente; pedidos: PedidoDeCliente[] } | null> {
  try {
    const r = await fetch(`${BASE}/list-clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: adminId, store_id: storeId, buyer_id: buyerId }),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** Cómo se lee un cliente de un vistazo. El orden importa: lo primero que hay
 *  que saber de alguien que escribe es si ya compró. */
export function resumenDeCliente(c: Cliente): string {
  if (c.pedidos === 0) return c.activated_at ? 'En la app, sin comprar' : 'Sin comprar'
  const veces = c.pedidos === 1 ? '1 pedido' : `${c.pedidos} pedidos`
  return `${veces} · S/ ${Math.round(c.gastado).toLocaleString('es-PE')}`
}
