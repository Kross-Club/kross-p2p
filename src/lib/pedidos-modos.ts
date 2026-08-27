import { List, LayoutGrid, Radar, BarChart2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Las cuatro maneras de mirar los pedidos ─────────────────────────────────
//
// Chats, CRM, En vivo y Stats eran cuatro entradas del menú que pedían la misma
// consulta y pintaban el mismo dato distinto (docs/11-RELACIONES.md). Acá el
// vocabulario de esos modos vive aparte de la pantalla: es el mismo criterio
// que `COLUMNAS` en order-tracking.ts — el orden y las etiquetas se definen una
// vez, no dentro del componente que los pinta.

export type Modo = 'lista' | 'tablero' | 'mapa' | 'resumen'

/** El modo por defecto: la puerta de entrada a Pedidos. */
export const MODO_INICIAL: Modo = 'lista'

/** `pregunta` no es decorativa: es lo que cada modo sirve para responder, y sale
 *  como `title` del botón. Un modo que no responde una pregunta distinta a las
 *  otras tres no debería existir. */
export const MODOS: { key: Modo; label: string; icon: LucideIcon; pregunta: string }[] = [
  { key: 'lista', label: 'Lista', icon: List, pregunta: '¿a quién le debo un mensaje?' },
  { key: 'tablero', label: 'Tablero', icon: LayoutGrid, pregunta: '¿dónde se está atorando la operación?' },
  { key: 'mapa', label: 'En vivo', icon: Radar, pregunta: '¿dónde está la plata que ya salió?' },
  { key: 'resumen', label: 'Resumen', icon: BarChart2, pregunta: '¿cómo vamos?' },
]

export function esModo(v: string | null | undefined): v is Modo {
  return MODOS.some(m => m.key === v)
}

/**
 * El modo que pide una URL.
 *
 * Un valor desconocido cae al inicial en vez de romper: `?modo=` viene de fuera
 * —un enlace viejo, alguien tecleando— y una pantalla en blanco por un
 * parámetro mal escrito es peor que mostrar la lista.
 */
export function modoDeUrl(params: URLSearchParams): Modo {
  const v = params.get('modo')
  return esModo(v) ? v : MODO_INICIAL
}

/**
 * Los parámetros de URL de un modo. El inicial no lleva `?modo=`: la URL limpia
 * es la de entrar a Pedidos, y así el enlace que se comparte más se ve mejor.
 */
export function urlDeModo(m: Modo): Record<string, string> {
  return m === MODO_INICIAL ? {} : { modo: m }
}

// ─── El pedido abierto ───────────────────────────────────────────────────────
//
// Abrir un pedido dejó de ser un viaje a otra pantalla: entra como panel desde
// la derecha, encima de la lista. Pero el token sigue viviendo en la URL
// (`?pedido=`) y no en un `useState`, por lo mismo que el modo: el enlace se
// puede mandar, "atrás" cierra el panel, y recargar la página deja abierto lo
// que estaba abierto. La ruta `/vendedor/pedido/:token` se queda como estaba —
// es la que abren las notificaciones y los enlaces viejos.

export function pedidoDeUrl(params: URLSearchParams): string | null {
  const t = params.get('pedido')
  return t ? t : null
}

/** Los parámetros del modo con un pedido abierto encima. Se compone acá y no
 *  en la pantalla porque `urlDeModo` borra lo que no nombra: cambiar de modo
 *  con un pedido abierto lo cerraba sin querer. */
export function urlConPedido(m: Modo, token: string | null): Record<string, string> {
  return token ? { ...urlDeModo(m), pedido: token } : urlDeModo(m)
}
