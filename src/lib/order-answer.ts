import { demoActivo } from './demo/modo-demo'
import { marcarRespondidoDemo } from './demo/tienda-demo'

// ─── Cerrar la deuda con el cliente ──────────────────────────────────────────
//
// "Sin responder" es un pedido cuyo último mensaje es del comprador. Casi
// siempre se resuelve escribiéndole — pero no siempre: un "Gracias 🙏" o un
// emoji no se contestan, se cierran. Sin esto, esos pedidos se quedan arriba de
// la lista para siempre y la lista deja de significar algo.
//
// Vive acá y no dentro de una pantalla porque se hace desde DOS sitios: la fila
// de la bandeja —el camino rápido, sin abrir el chat— y la cabecera del pedido
// abierto. Dos copias de la misma llamada son dos oportunidades de que una
// olvide avisar a la otra.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/**
 * Marca el pedido como respondido. Devuelve la marca de tiempo, o `null` si no
 * se pudo — que es lo que la pantalla necesita para no mentir con un ✓ que el
 * servidor nunca recibió.
 */
export async function marcarRespondido(
  sessionId: string, storeId: string | null | undefined,
): Promise<string | null> {
  // En demo no hay base a la que escribir: se marca sobre la tienda generada.
  // Sin esto el botón se vería pero no haría nada, que es peor que no tenerlo.
  if (demoActivo(storeId)) return marcarRespondidoDemo(sessionId)

  try {
    const res = await fetch(`${BASE}/order-manage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_answered', session_id: sessionId }),
    })
    if (!res.ok) return null
    const r = await res.json().catch(() => ({}))
    return (r.answered_at as string) ?? new Date().toISOString()
  } catch {
    return null
  }
}
