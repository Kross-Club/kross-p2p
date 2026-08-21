// ─── Adelanto derivado en el SERVIDOR ────────────────────────────────────────
// Espejo de `advanceFor()` (src/lib/checkout/checkout.config.ts). Existe porque
// el monto del adelanto NO puede venir del navegador: `register-buyer` lo
// aceptaba tal cual del body, así que cualquiera podía registrar un pedido
// declarando un adelanto de S/1 — y con el cobro directo de Culqi ese S/1 se
// cobraría de verdad y el pedido se auto-confirmaría sin que ninguna persona lo
// mire. El test de paridad en src/lib/checkout/culqi.test.ts vigila que las dos
// implementaciones no se desalineen.
//
// Sin APIs de Deno a propósito: el archivo se importa también desde vitest.

/** Misma constante que ADVANCE_HALF_SHARE en checkout.config.ts. */
export const ADVANCE_HALF_SHARE = 0.5

/**
 * Cuánto adelanta este pedido: la mitad (mínimo) o el total.
 *
 * Antes era una tabla por destino —S/5 Lima, S/20 Shalom, S/25 Olva, S/30 a
 * domicilio— y por eso el monto era inmune a lo que mandara el navegador. Ahora
 * depende del PRECIO, así que la protección se mueve un paso atrás: quien llama
 * tiene que pasar un precio que el servidor haya validado contra los packs del
 * producto, nunca el del body tal cual. Ver `priceFromPacks()`.
 *
 * `choice` sí puede venir del cliente sin riesgo: solo elige entre pagar la
 * mitad o pagar todo, y ninguna de las dos baja del mínimo.
 */
export function advanceForServer(price: number, choice: string | null): number {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 0
  return choice === 'FULL' ? Math.round(p) : Math.round(p * ADVANCE_HALF_SHARE)
}

/**
 * El precio REAL del pack, tomado del producto en la base.
 *
 * Es la pieza que sostiene lo de arriba. `register-buyer` venía guardando
 * `body.product_price` tal cual: daba igual mientras el adelanto saliera de una
 * tabla fija, pero desde que es un porcentaje del precio, aceptar el precio del
 * navegador es volver a dejar que el comprador fije lo que se le cobra.
 *
 * Devuelve `null` si no se puede verificar (producto sin packs, o un precio que
 * no corresponde a ninguno). Quien llama decide: hoy se cae al precio del body
 * para no bloquear la venta, pero el ADELANTO se calcula sobre el verificado.
 */
export function priceFromPacks(
  packs: unknown,
  claimed: number,
  packName: string | null,
): number | null {
  if (!Array.isArray(packs)) return null
  const prices = packs
    .map(p => Number((p as { precio?: unknown })?.precio))
    .filter(n => Number.isFinite(n) && n > 0)
  if (prices.length === 0) return null

  // Por nombre cuando viene: es la coincidencia exacta.
  if (packName) {
    const hit = packs.find(p => (p as { nombre?: unknown })?.nombre === packName)
    const precio = Number((hit as { precio?: unknown })?.precio)
    if (Number.isFinite(precio) && precio > 0) return precio
  }
  // Si no, el precio declarado vale solo si ES uno de los del producto.
  return prices.includes(Number(claimed)) ? Number(claimed) : null
}
