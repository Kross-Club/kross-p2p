// ─── La foto del pack que compró ─────────────────────────────────────────────
//
// El pedido guarda una miniatura en `items[].image` y esa miniatura es la que
// enseña el ticket del comprador («TU PEDIDO»). Hasta el 09-set-2026 era
// siempre la PRIMERA imagen del producto: quien compraba el pack de tres veía
// la misma foto de un frasco que quien compró uno, y el ticket dejaba de
// describir lo que va a recibir.
//
// Esta función elige la que corresponde, con la misma regla que el paso 1 del
// checkout (`buildPackSelection`, `product-packs.ts`): la foto PROPIA del pack
// si la marca la cargó, y si no la primera del producto. No inventa nada — sin
// ninguna de las dos devuelve `null` y el ticket se queda sin miniatura, que es
// lo correcto: una foto equivocada dice más mentiras que ninguna.
//
// Vive acá y no en `advance.ts` porque aquello es dinero; esto es la vitrina.
// Su hermana `priceFromPacks` busca el mismo pack por el mismo nombre — si un
// día el pack deja de identificarse por `nombre`, las dos cambian juntas.
//
// Sin Deno ni red: se prueba en `src/lib/packs.test.ts`.

/** El texto de una URL guardada, o `null` si lo que hay no sirve. */
function url(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

/**
 * La miniatura del pedido: la foto del pack elegido, con la primera del
 * producto como respaldo.
 *
 * @param packs   `products.packs` tal cual viene de la base.
 * @param packName El nombre del pack que eligió el comprador (`pack_name`).
 * @param images  `products.images` tal cual viene de la base.
 */
export function imagenDelPack(packs: unknown, packName: string | null, images: unknown): string | null {
  const primera = Array.isArray(images) ? url(images[0]) : null

  // Sin nombre no hay pack que buscar: el producto compró «suelto».
  if (!packName || !Array.isArray(packs)) return primera

  const elegido = packs.find(p => (p as { nombre?: unknown })?.nombre === packName)
  return url((elegido as { image?: unknown })?.image) ?? primera
}
