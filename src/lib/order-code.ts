// ─── El número de pedido, como se dice en voz alta ───────────────────────────
//
// `order_id` lo genera la tienda como `ORD-1756345678901`: un prefijo fijo y el
// milisegundo en que entró. Entero no sirve para lo que el vendedor necesita —
// mirar dos pedidos y saber si son el mismo—: trece dígitos iguales salvo los
// últimos cuatro son trece dígitos que nadie compara.
//
// Se muestra la cola, que es la parte que de verdad distingue, y el completo
// queda en el `title` y en el detalle del pedido (que es donde se copia para
// soporte de 360pay).

const LARGO = 6

/**
 * El código corto: `ORD-1756345678901` → `#678901`.
 *
 * `null` si el pedido no tiene número —los hay: un pedido creado antes de que
 * existiera la columna—, y ahí la pantalla no debe inventar uno.
 */
export function codigoPedido(orderId: string | null | undefined): string | null {
  const v = String(orderId ?? '').trim()
  if (!v) return null
  // Se corta sobre los dígitos y no sobre el texto: así el prefijo `ORD-` no se
  // cuela en la cola cuando el número es más corto de lo normal.
  const digitos = v.replace(/\D/g, '')
  if (!digitos) return `#${v}`
  return `#${digitos.slice(-LARGO)}`
}

/** ¿Estos dos son el mismo pedido? Compara por id de sesión, que es lo único
 *  que no se repite: dos pedidos distintos pueden compartir cola. */
export function esElMismoPedido(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b
}
