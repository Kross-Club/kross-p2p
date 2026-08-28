import { useSyncExternalStore } from 'react'

// ─── Pedidos marcados ────────────────────────────────────────────────────────
//
// La estrella de "vuelvo a este". Es de quien mira y no del pedido: dos
// vendedores atendiendo la misma tienda tienen pendientes distintos, y una
// estrella compartida se llenaría de las marcas de todos hasta no decir nada.
//
// Por eso vive donde el tema, el modo demo y el menú plegado: en el dispositivo
// (`localStorage`), por tienda. Es una forma de MIRAR, no un dato del pedido.
//
// La contrapartida está asumida: marcar en la laptop no se ve en el celular. Si
// algún día tiene que seguir a la persona entre dispositivos, esto pasa a ser
// una tabla `seller_favorites` — y ahí el cambio es de servidor, no de esta
// pantalla.

const PREFIJO = 'kross-fav:'

const clave = (storeId: string) => `${PREFIJO}${storeId}`

function leer(storeId: string): Set<string> {
  try {
    const raw = localStorage.getItem(clave(storeId))
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

const VACIO: ReadonlySet<string> = new Set()
const estado = new Map<string, Set<string>>()
const oyentes = new Set<() => void>()

export function favoritosDe(storeId: string | null | undefined): ReadonlySet<string> {
  if (!storeId) return VACIO
  if (!estado.has(storeId)) estado.set(storeId, leer(storeId))
  return estado.get(storeId)!
}

export function esFavorito(storeId: string | null | undefined, id: string): boolean {
  return favoritosDe(storeId).has(id)
}

/** Marca o desmarca. Devuelve cómo quedó, para que quien llame no tenga que
 *  volver a preguntar. */
export function alternarFavorito(storeId: string | null | undefined, id: string): boolean {
  if (!storeId) return false
  const actuales = new Set(favoritosDe(storeId))
  const marcado = !actuales.has(id)
  if (marcado) actuales.add(id)
  else actuales.delete(id)

  estado.set(storeId, actuales)
  try {
    if (actuales.size) localStorage.setItem(clave(storeId), JSON.stringify([...actuales]))
    else localStorage.removeItem(clave(storeId))
  } catch { /* sin storage sigue valiendo para esta sesión */ }
  oyentes.forEach(l => l())
  return marcado
}

function subscribe(onChange: () => void): () => void {
  oyentes.add(onChange)
  return () => { oyentes.delete(onChange) }
}

/** Los pedidos marcados de esta tienda, en este dispositivo. */
export function useFavoritos(storeId: string | null | undefined): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => favoritosDe(storeId), () => VACIO)
}
