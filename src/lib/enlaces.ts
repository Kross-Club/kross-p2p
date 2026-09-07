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

export const enlaceDeMiPedido = (token: string): string => `/pedido/${encodeURIComponent(token)}`

export const enlaceDelChat = (token: string): string => `/p/${encodeURIComponent(token)}`
