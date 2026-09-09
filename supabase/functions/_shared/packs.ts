// ─── La foto del pack que compró ─────────────────────────────────────────────
//
// El pedido guarda una miniatura en `items[].image` y esa miniatura es la que
// enseña el ticket del comprador («TU PEDIDO»). Hasta el 09-set-2026 era
// siempre la PRIMERA imagen del producto: quien compraba el pack de tres veía
// la misma foto de un frasco que quien compró uno, y el ticket dejaba de
// describir lo que va a recibir.
//
// Esta función elige la que corresponde: **con pack elegido manda SU foto, y
// punto**. Si ese pack no tiene, devuelve `null` y el ticket cae al logo
// cuadrado de la marca, que no promete ninguna cantidad. La primera foto del
// producto NO sirve de respaldo ahí: es la del frasco suelto, así que al que
// compró tres le enseñaría uno — el mismo error que esto vino a arreglar, con
// otro disfraz.
//
// La del producto sí es la correcta cuando NO hubo pack —un producto suelto, o
// un pack que la marca renombró y ya no existe—: ahí no hay cantidad que
// contradecir.
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
 * La miniatura del pedido: la foto del pack elegido.
 *
 * Devuelve `null` cuando ese pack existe y no tiene foto — quien pinta decide
 * qué poner en su lugar, y hoy es el logo cuadrado de la marca.
 *
 * @param packs    `products.packs` tal cual viene de la base.
 * @param packName El nombre del pack que eligió el comprador (`pack_name`).
 * @param images   `products.images` tal cual viene de la base.
 */
export function imagenDelPack(packs: unknown, packName: string | null, images: unknown): string | null {
  // El pack elegido manda: su foto, o ninguna.
  if (packName && Array.isArray(packs)) {
    const elegido = packs.find(p => (p as { nombre?: unknown })?.nombre === packName)
    if (elegido) return url((elegido as { image?: unknown })?.image)
  }
  // Sin pack —o con uno que la marca ya renombró— la del producto es la que
  // corresponde: no hay cantidad que pueda contradecir.
  return Array.isArray(images) ? url(images[0]) : null
}
