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
export function saneaProducto(
  body: { permite_mitad?: unknown; descuento_pen?: unknown; cobra_completo?: unknown },
): {
  permite_mitad?: boolean
  descuento_pen?: number
  cobra_completo?: boolean
} {
  return {
    ...(body.permite_mitad !== undefined ? { permite_mitad: body.permite_mitad === true } : {}),
    ...(body.descuento_pen !== undefined ? { descuento_pen: descuentoSaneado(body.descuento_pen) } : {}),
    // `cobra_completo` (§68) entra por la misma puerta y con la misma regla:
    // solo si el body lo trae, y solo con un `true` de verdad. Un panel que no
    // lo mande —el de cualquier marca que no use Kross Form— no lo toca.
    ...(body.cobra_completo !== undefined ? { cobra_completo: body.cobra_completo === true } : {}),
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

// ─── KROSS FORM · El adelanto por pack ───────────────────────────────────────
// Lo de abajo NO lo usa la PWA. Es la aritmética del embed (`docs/18-KROSS-FORM.md`),
// donde el adelanto es un MONTO que el comerciante escribe en cada pack
// —"que adelanten 20 soles"— en vez de la proporción de §56.
//
// Vive en este archivo y no en uno nuevo porque aquí ya viven las reglas de
// adelanto por producto, y partirlas sería tener dos sitios donde mirar cuánto
// se le cobra a alguien. Pero es ADITIVO: `advanceForServer`, `eleccionDeAdelanto`,
// `ofertaDelProducto` y `priceFromPacks` quedan exactamente como estaban, y
// ningún camino de krossclub.app pasa por lo que sigue. La PWA no cambia ni un
// céntimo por esto.

/** Los cuatro destinos válidos de `order_sessions.dispatch_type`. */
const DISPATCH_VALIDOS = [
  'MOTORIZADO_LIMA', 'MOTORIZADO_PROVINCIA', 'AGENCIA_PROVINCIA', 'AGENCIA_LIMA',
] as const

/**
 * Si este destino va contraentrega pase lo que pase.
 *
 * Lima y Callao no adelantan: es la regla comercial de Kross Form y **se evalúa
 * en el servidor a propósito**. Si viviera en el formulario, cualquiera abre el
 * inspector, declara Lima y se lleva un pedido a provincia sin adelantar nada.
 *
 * Un `dispatch_type` que no sea uno de los cuatro cae también en contraentrega.
 * Es la dirección segura: cobrarle a alguien que esperaba pagar en la puerta
 * cuesta plata y un reclamo, mientras que no cobrar deja un pedido que el
 * vendedor coordina por WhatsApp. Y no es una puerta: quien llama valida
 * `dispatch_type` contra la misma lista antes de escribir el pedido, así que
 * esto solo se activa ante un bug nuestro, no ante un navegador mentiroso.
 */
export function esContraentregaPorDestino(dispatchType: unknown): boolean {
  const d = typeof dispatchType === 'string' ? dispatchType.trim() : ''
  if (!(DISPATCH_VALIDOS as readonly string[]).includes(d)) return true
  return d.endsWith('_LIMA')
}

/**
 * Lo que el panel guardó en `packs[].adelanto_pen`, saneado.
 *
 * Redondeado al sol por la misma razón que `advanceForServer`: el comprador lo
 * yapea a mano y "S/20.50" invita a teclear mal. Cualquier basura —negativo,
 * texto, `undefined`— es 0, y 0 significa **este pack no cobra adelanto**: va
 * contraentrega aunque sea provincia. No cobrar es el error barato.
 */
export function adelantoSaneado(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

/**
 * El adelanto que pide ESTE pack, tomado del producto en la base.
 *
 * Hermana de `priceFromPacks()` y con su misma regla: empareja por `nombre`,
 * que es la coincidencia exacta. Sin nombre no hay pack que mirar y devuelve 0
 * —de nuevo, la dirección segura—; el monto jamás se acepta del navegador.
 */
export function adelantoFromPacks(packs: unknown, packName: string | null): number {
  if (!Array.isArray(packs) || !packName) return 0
  const hit = packs.find(p => (p as { nombre?: unknown })?.nombre === packName)
  return adelantoSaneado((hit as { adelanto_pen?: unknown })?.adelanto_pen)
}

/**
 * Los packs tal como el panel los manda, con `adelanto_pen` normalizado.
 *
 * `manage-product` reescribe el producto entero en cada guardado y venía
 * pasando `body.packs` tal cual a la base. Mientras el pack solo llevaba
 * nombre, precio e imagen daba igual —el precio se verifica al pedir, no al
 * guardar—, pero un `adelanto_pen` es plata: dejarlo entrar como `"20 soles"`
 * o `-5` guarda una configuración que nadie escribió a propósito.
 *
 * **Toca UNA clave y no más.** Cada pack se devuelve con todos sus campos
 * intactos y solo `adelanto_pen` reescrito, y únicamente cuando el pack lo
 * trae. Un producto de krossclub.app —que no manda esa clave por ningún lado—
 * sale de aquí byte por byte como entró (§10 del doc).
 *
 * El 0 se conserva en vez de borrarse: es una respuesta ("este pack no cobra
 * adelanto"), no la ausencia de una.
 */
export function saneaPacks(packs: unknown): unknown[] {
  if (!Array.isArray(packs)) return []
  return packs.map(pack => {
    if (!pack || typeof pack !== 'object') return pack
    const p = pack as Record<string, unknown>
    if (p.adelanto_pen === undefined) return pack
    return { ...p, adelanto_pen: adelantoSaneado(p.adelanto_pen) }
  })
}

/** Lo que hace falta para saber cuánto adelanta un pedido del embed. */
export interface EntradaDeAdelanto {
  /** Precio del pack, YA verificado contra el producto (`priceFromPacks`). */
  precioPack: number
  /** Lo que pide el pack (`adelantoFromPacks`). 0 = este pack no adelanta. */
  adelantoPen: number
  /** `order_sessions.dispatch_type`. */
  dispatchType: unknown
  /** Toggle del producto: cobrar el 100 % por adelantado. */
  cobraCompleto?: boolean
  /** Toggle del producto (§56): permitir la mitad. */
  permiteMitad?: boolean
}

/**
 * Cuánto adelanta un pedido de Kross Form. La escalera, en este orden exacto:
 *
 *   1. destino Lima/Callao   → 0                         (contraentrega, SIEMPRE)
 *   2. `cobra_completo`      → el precio del pack
 *   3. `adelanto_pen` > 0    → min(adelanto, precio del pack)
 *   4. `permite_mitad`       → la mitad, por `advanceForServer`
 *   5. si no                 → 0
 *
 * El destino va primero porque es la regla de SEGURIDAD, no la comercial:
 * ningún dato del producto puede hacer que a un comprador de Lima se le cobre
 * por adelantado. Los pasos 2 y 4 delegan en `advanceForServer` para que la
 * aritmética siga siendo una sola, y el 3 nunca devuelve más que el pedido —un
 * `adelanto_pen` mayor que el pack cobra el pack entero, no más.
 */
export function adelantoDelPedido(e: EntradaDeAdelanto): number {
  const precio = Number(e.precioPack)
  if (!Number.isFinite(precio) || precio <= 0) return 0

  if (esContraentregaPorDestino(e.dispatchType)) return 0
  if (e.cobraCompleto === true) return advanceForServer(precio, 'FULL')

  const adelanto = adelantoSaneado(e.adelantoPen)
  if (adelanto > 0) return Math.min(adelanto, advanceForServer(precio, 'FULL'))

  if (e.permiteMitad === true) return advanceForServer(precio, 'HALF')
  return 0
}

/**
 * Lo que ESTA fila de pedido debía adelantar, re-derivado al momento de cobrar.
 *
 * `flow-order` (y `pay360-coupon`) no confían en `advance_amount`: lo vuelven a
 * derivar y comparan, porque una fila con un monto que nadie puede reproducir
 * es una fila que alguien tocó. Hasta §68 esa re-derivación era una sola línea
 * —`advanceForServer(precio, advance_choice)`—, y para un pedido de Kross Form
 * daba el PRECIO ENTERO: `advance_choice` solo sabe de HALF y FULL, y un
 * adelanto de S/20 sobre un pack de S/89 no es ninguno de los dos. El cobro
 * moría en `amount_mismatch` y el comprador nunca veía la página de pago.
 *
 * Así que la re-derivación se bifurca por `embed_key`:
 *   · NULL (todo pedido de krossclub.app) → exactamente la línea de antes.
 *   · con llave → la escalera de §5.a, contra el producto de la base.
 *
 * Es pura a propósito: quien llama trae el producto ya leído, y así el test
 * puede fijar que la rama de la PWA devuelve lo mismo que devolvía.
 */
export function adelantoEsperadoDeLaFila(
  fila: {
    embed_key?: unknown
    advance_choice?: unknown
    pack_name?: unknown
    dispatch_type?: unknown
  },
  precio: number,
  producto: { packs?: unknown; permite_mitad?: unknown; cobra_completo?: unknown } | null,
): number {
  const conLlave = typeof fila.embed_key === 'string' && fila.embed_key.trim() !== ''
  if (!conLlave) return advanceForServer(precio, String(fila.advance_choice ?? 'HALF'))

  // Sin el producto no se puede reproducir el monto, y un 0 acá cae en el
  // `no_advance` de quien llama: el cobro no sale y queda el rastro. Es mejor
  // que emitir una orden de pago por un monto que nadie sabe justificar.
  if (!producto) return 0

  const packName = typeof fila.pack_name === 'string' ? fila.pack_name : null
  return adelantoDelPedido({
    precioPack: precio,
    adelantoPen: adelantoFromPacks(producto.packs, packName),
    dispatchType: fila.dispatch_type,
    cobraCompleto: producto.cobra_completo === true,
    permiteMitad: producto.permite_mitad === true,
  })
}
