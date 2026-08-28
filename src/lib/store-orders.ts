import { useCallback, useEffect, useState } from 'react'
import type { SellerProfile } from './seller-session'
import { useDemo } from './demo/modo-demo'
import { tiendaDemo } from './demo/tienda-demo'

// ─── El lector único de pedidos de la tienda ─────────────────────────────────
//
// Cuatro pantallas —Chats, CRM, En vivo y Stats— son la MISMA lista mirada
// distinto (ver docs/11-RELACIONES.md). Hasta acá cada una hacía su propio
// fetch a `get-store-sessions`, con su propio estado de carga, su propio tipo
// y —lo caro— su propia idea de quién ve qué:
//
//   Chats  →  !effective.is_admin
//   Mapa   →  !effective.is_admin
//   CRM    →  !(real.is_admin && !impersonating)
//   Stats  →  !(real.is_admin && !impersonating)
//
// Las dos últimas dejaban al super admin que entra a una marca viendo la
// tienda completa en Chats y en el mapa, y CERO pedidos en CRM y Stats. Cuatro
// copias de una regla es cuatro oportunidades de que se separen, y ya se
// habían separado.
//
// Acá vive una sola: la de abajo.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/**
 * Un pedido tal como lo devuelve `get-store-sessions`.
 *
 * Es el espejo de su `select`, no la unión de lo que cada pantalla usa hoy:
 * un tipo que solo declara lo que alguien ya consume obliga a editarlo cada
 * vez que una pantalla mira un campo más, y mientras tanto miente sobre lo que
 * de verdad llegó. Todo es opcional salvo `id` porque la función puede estar
 * desplegada con menos columnas de las que el repo pide — pasa hoy mismo, ver
 * `docs/ESTADO-OPERATIVO.md`.
 */
export interface StoreOrder {
  id: string
  order_id?: string | null
  store_id?: string | null
  token?: string
  buyer_id?: string | null
  buyer_name?: string | null
  buyer_phone?: string | null
  product_id?: string | null
  product_name?: string | null
  product_price?: number | null
  pack_name?: string | null
  status?: string
  stage?: string
  nota?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_phase?: string | null
  tracking_phase_at?: string | null
  tracking_demora_at?: string | null
  assigned_seller_id?: string | null
  involved_seller_ids?: string[] | null
  writer_seller_ids?: string[] | null
  seller_name?: string | null
  seller_role?: string | null
  created_at?: string
  /** Cuándo se dio por respondida la última pregunta del comprador. `null` =
   *  nunca. Ver `esperaRespuesta` en bandeja.ts. */
  answered_at?: string | null
  chat_messages?: {
    id: string
    sender_role: string
    /** Quién lo escribió, del lado de la tienda. La bandeja lo pinta en vez de
     *  "Tú:": en un equipo de seis, saber si ya contestó Milagros es justo lo
     *  que evita que conteste nadie más. */
    sender_name?: string | null
    type: string
    body: string | null
    created_at: string
    read_at: string | null
  }[]
}

/**
 * Quién ve qué. **Única definición del repo.**
 *
 * Manda el perfil que se está ACTUANDO, no el de quien inició sesión: si eres
 * admin de lo que estás mirando, ves esa tienda entera; si no, ves los pedidos
 * en los que estás metido. Esa sola frase cubre los cuatro casos —admin,
 * miembro, admin viendo como un miembro, y super admin que entró a una marca—
 * sin preguntar por `impersonating`, que es exactamente donde se torcía.
 *
 * `null` = todavía no hay perfil resuelto, o sea no hay nada que pedir.
 */
export function alcanceDePedidos(
  effective: SellerProfile | null | undefined,
): { sellerId: string | null } | null {
  if (!effective) return null
  return { sellerId: effective.is_admin ? null : effective.auth_user_id }
}

/** ¿Este pedido sigue vivo? La definición está en `order-tracking` —es una
 *  pregunta sobre el pedido, no sobre quién lo lee— y se reexporta acá para no
 *  tocar a las cuatro pantallas que ya la importaban de este módulo. */
export { estaVivo } from './order-tracking'

export interface StoreOrders {
  pedidos: StoreOrder[]
  cargando: boolean
  /** `true` = esta lista son solo los pedidos de quien mira. Sale del MISMO
   *  cálculo que armó la consulta, así que la etiqueta de la pantalla no puede
   *  contradecir a lo que se pidió. */
  soloMios: boolean
  /** Vuelve a pedir la lista. Útil después de mover un pedido. */
  recargar: () => void
  /** Cuándo llegó esta lista. Medir antigüedad contra el momento de la lectura
   *  —y no contra cada pintada— mantiene el render puro y hace que todas las
   *  tarjetas cuenten desde el mismo punto. */
  leidoEn: number
}

/**
 * Los pedidos de la tienda, una sola vez y para todas las vistas.
 *
 * `incluirCancelados` es la única opción, y es de verdad una decisión por
 * pantalla: el CRM los agrupa aparte y Stats los cuenta en las notas, mientras
 * que Chats y el mapa no tienen nada que hacer con un pedido muerto. No se
 * unifica pidiéndolos siempre porque el `limit(80)` del servidor se aplica
 * ANTES de filtrar: traerlos de más empujaría pedidos vivos fuera de la lista.
 */
export function useStoreOrders(
  effective: SellerProfile | null | undefined,
  opts: { incluirCancelados?: boolean } = {},
): StoreOrders {
  const { incluirCancelados = false } = opts
  const [pedidos, setPedidos] = useState<StoreOrder[]>([])
  const [cargando, setCargando] = useState(true)
  const [leidoEn, setLeidoEn] = useState(() => Date.now())
  const [intento, setIntento] = useState(0)

  const storeId = effective?.store_id
  const alcance = alcanceDePedidos(effective)
  const sellerId = alcance?.sellerId ?? null

  const demo = useDemo(storeId)

  useEffect(() => {
    let vivo = true

    // En demo el panel no consulta nada: los datos salen del generador y la
    // barra de arriba lo dice. Se corta el mismo tope que aplica el servidor
    // (80) para no enseñar una pantalla que la tienda real nunca vería.
    if (demo) {
      setCargando(true)
      tiendaDemo().then(t => {
        if (!vivo) return
        setPedidos(t.pedidos.slice(0, 80))
        setLeidoEn(Date.now())
        setCargando(false)
      })
      return () => { vivo = false }
    }

    if (!storeId) return
    setCargando(true)

    const headers: Record<string, string> = { Authorization: `Bearer ${ANON}`, 'x-store-id': storeId }
    if (sellerId) headers['x-seller-id'] = sellerId
    if (incluirCancelados) headers['x-include-cancelled'] = '1'

    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((data: StoreOrder[]) => {
        if (!vivo) return
        setPedidos(Array.isArray(data) ? data : [])
        setLeidoEn(Date.now())
      })
      .catch(() => { if (vivo) setPedidos([]) })
      .finally(() => { if (vivo) setCargando(false) })

    // `vivo` corta la respuesta de una petición que quedó en el aire cuando el
    // vendedor cambió de tienda o de rol: sin esto la lista vieja podía pisar
    // a la nueva y mostrarle los pedidos de otra marca.
    return () => { vivo = false }
  }, [demo, storeId, sellerId, incluirCancelados, intento])

  const recargar = useCallback(() => setIntento(n => n + 1), [])

  return { pedidos, cargando, soloMios: !!sellerId, recargar, leidoEn }
}
