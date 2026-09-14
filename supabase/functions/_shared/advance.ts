// ─── Adelanto derivado en el SERVIDOR ────────────────────────────────────────
// Espejo de `advanceFor()` (src/lib/checkout/checkout.config.ts). Existe porque
// el monto del adelanto NO puede venir del navegador: `register-buyer` lo
// aceptaba tal cual del body, así que cualquiera podía registrar un pedido
// declarando un adelanto de S/1 — y con el cobro en línea ese S/1 se
// cobraría de verdad y el pedido se auto-confirmaría sin que ninguna persona lo
// mire. El test de paridad en src/lib/checkout/advance-parity.test.ts vigila
// que las dos implementaciones no se desalineen.
//
// Desde el 14-set-2026 acá viven también las DOS reglas por producto: si el
// comprador puede pagar la mitad (`permite_mitad`) y cuánto vale la oferta de
// salida (`descuento_pen`). El front las usa para enseñar y el servidor para
// cobrar; una sola aritmética para las dos puntas.
//
// Sin APIs de Deno a propósito: el archivo se importa también desde vitest.

/** Misma constante que ADVANCE_HALF_SHARE en checkout.config.ts. */
export const ADVANCE_HALF_SHARE = 0.5

export type EleccionDeAdelanto = 'HALF' | 'FULL'

/**
 * Cuánto adelanta este pedido: la mitad o el total.
 *
 * Antes era una tabla por destino —S/5 Lima, S/20 Shalom, S/25 Olva, S/30 a
 * domicilio— y por eso el monto era inmune a lo que mandara el navegador. Ahora
 * depende del PRECIO, así que la protección se mueve un paso atrás: quien llama
 * tiene que pasar un precio que el servidor haya validado contra los packs del
 * producto, nunca el del body tal cual. Ver `priceFromPacks()`.
 *
 * `choice` NO se toma del cliente tal cual: pasa antes por
 * `eleccionDeAdelanto()`, que solo concede HALF si el producto lo permite. Los
 * llamadores que re-derivan montos históricos (`flow-order`, `pay360-coupon`)
 * siguen cayendo en HALF cuando la fila no trae elección: son de la era en que
 * la mitad era el default.
 */
export function advanceForServer(price: number, choice: string | null): number {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 0
  return choice === 'FULL' ? Math.round(p) : Math.round(p * ADVANCE_HALF_SHARE)
}

/**
 * Qué elección de adelanto vale para este pedido.
 *
 * El total es el default. La mitad solo cuando el comprador la pidió Y el
 * producto la permite. Cualquier otra cosa —basura, `undefined`, un HALF a un
 * producto que no lo ofrece— cae en FULL: es la dirección segura (más adelanto,
 * nunca menos) y no bloquea la venta.
 */
export function eleccionDeAdelanto(claimed: unknown, permiteMitad: boolean): EleccionDeAdelanto {
  return claimed === 'HALF' && permiteMitad === true ? 'HALF' : 'FULL'
}

/** Tope de la oferta de salida por producto. Un descuento mayor que esto es un
 *  dedo de más en el panel, no una decisión comercial. */
export const DESCUENTO_MAXIMO_PEN = 500

/** Lo que el panel guardó, saneado: finito, entre 0 y el tope, dos decimales. */
export function descuentoSaneado(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(Math.min(n, DESCUENTO_MAXIMO_PEN) * 100) / 100
}

/**
 * Cuánto descuenta la oferta de salida en este pedido.
 *
 * Único sitio con la semántica de `products.descuento_pen`: es el monto que se
 * resta de CADA pack cuando el comprador aceptó la oferta al intentar salir
 * (`exitOffer`), y 0 en cualquier otro caso — un producto con `descuento_pen`
 * 0 no ofrece nada, y un pedido que no aceptó la oferta no la lleva.
 */
export function ofertaDelProducto(descuentoPen: unknown, exitOffer: boolean): number {
  return exitOffer ? descuentoSaneado(descuentoPen) : 0
}

/**
 * Las dos reglas por producto, saneadas desde lo que manda el panel.
 *
 * Solo devuelve las claves que el body TRAE: `manage-product` reescribe el
 * producto entero en cada guardado, y un panel de antes de §56 —que no manda
 * ninguna de las dos— no debe borrar en silencio lo que otro ya configuró.
 * `permite_mitad` solo es verdad con un `true` de verdad.
 */
export function saneaProducto(body: { permite_mitad?: unknown; descuento_pen?: unknown }): {
  permite_mitad?: boolean
  descuento_pen?: number
} {
  return {
    ...(body.permite_mitad !== undefined ? { permite_mitad: body.permite_mitad === true } : {}),
    ...(body.descuento_pen !== undefined ? { descuento_pen: descuentoSaneado(body.descuento_pen) } : {}),
  }
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
