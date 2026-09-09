// ─── Las dos puertas del pedido, en un solo sitio ────────────────────────────
//
// Un pedido tiene dos páginas y hacen cosas distintas:
//
//   · `/pedido/:token` — **mirar**. El ticket, el recorrido y la app. Se
//     recarga, y recargar sirve: el recorrido avanza con lo que reporta el
//     courier. Es a donde cae el comprador al terminar el checkout.
//   · `/p/:token` — **hablar**. El chat del pedido. Es el enlace que viaja por
//     WhatsApp y el que abre quien no instaló la app.
//
// Relativas a propósito, como la hoja de guía: en el subdominio de la marca
// salen con esa marca sin que nadie tenga que pasar el dominio. La llave es el
// TOKEN — quien tiene el enlace de su pedido tiene su pedido.

import { APEX } from './dominio'

export const enlaceDeMiPedido = (token: string): string => `/pedido/${encodeURIComponent(token)}`

export const enlaceDelChat = (token: string): string => `/p/${encodeURIComponent(token)}`

/**
 * El mismo host con OTRO subdominio, para mudar a quien llegó por un enlace
 * viejo (§47). Devuelve `null` cuando no hay subdominio que cambiar — y ese
 * `null` es la parte importante: en `krossclub.app` (sin subdominio) reemplazar
 * "la primera etiqueta" convertiría el dominio en `marca.app`, que es de otro.
 *
 * `<slug>.localhost` sí cuenta: es el desarrollo con subdominio.
 */
export function hostConSlug(hostname: string, slug: string): string | null {
  if (!hostname || !slug) return null
  const host = hostname.toLowerCase()
  // Solo dentro de NUESTRO espacio (09-set-2026). Con dominios propios
  // (§50) esta función veía `tienda.monoshop.pe` como «un subdominio» y
  // devolvía `otramarca.monoshop.pe`: un host de otra empresa, inventado por
  // nosotros. El slug solo manda donde el slug significa algo.
  const enPlataforma = host.endsWith(`.${APEX}`) || host.endsWith('.localhost')
  if (!enPlataforma) return null
  const partes = host.split('.')
  if (partes[0] === slug) return null
  return [slug, ...partes.slice(1)].join('.')
}
