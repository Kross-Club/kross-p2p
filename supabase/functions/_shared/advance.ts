// ─── Adelanto derivado en el SERVIDOR ────────────────────────────────────────
// Espejo de `advanceFor()` (src/lib/checkout/checkout.config.ts). Existe porque
// el monto del adelanto NO puede venir del navegador: `register-buyer` lo
// aceptaba tal cual del body, así que cualquiera podía registrar un pedido de
// Olva (S/25) declarando un adelanto de S/1 — y con el cobro directo de Culqi
// ese S/1 se cobraría de verdad y el pedido se auto-confirmaría sin que ninguna
// persona lo mire. El monto se deriva del destino, aquí y en el front, de la
// misma tabla. Si esa tabla cambia en el front, TIENE que cambiar aquí: el test
// de paridad en src/lib/checkout/culqi.test.ts vigila que no se desalineen.
//
// Sin APIs de Deno a propósito: el archivo se importa también desde vitest.

/** Misma tabla que ADVANCE_* en checkout.config.ts. */
export function advanceForServer(
  dispatchType: string,
  agencyName: string | null,
): number {
  // Entrega EN CASA a provincia: el courier cobra más que el mostrador.
  if (dispatchType === 'MOTORIZADO_PROVINCIA') return 30
  if (dispatchType === 'AGENCIA_PROVINCIA') {
    if (agencyName === 'OLVA') return 25
    return 20 // SHALOM y OTRO cobran la base de mostrador
  }
  // MOTORIZADO_LIMA (y cualquier valor ya normalizado por la lista blanca del
  // caller): el adelanto chico que filtra el pedido falso sin espantar la venta.
  return 5
}

// ─── Adelanto como PORCENTAJE del pedido ─────────────────────────────────────
// El modelo nuevo: el comprador adelanta la MITAD de su pedido, o paga el 100 %
// y gana puntos para su próxima compra. Reemplaza a la tabla de arriba, que
// cobraba un monto fijo de envío.
//
// El cambio de modelo trae un riesgo que el fijo no tenía, y es el que manda en
// el diseño de estas funciones:
//
//   Con monto fijo, manipular el precio del pedido no cambiaba el adelanto.
//   Con porcentaje, SÍ. Y `order_sessions.product_price` viene del navegador
//   (`register-buyer` lo toma de `body.product_price`), así que declarar un
//   pack de S/1 daría un adelanto de S/0.50 sobre una compra de S/98.
//
// Por eso el precio NO se lee de la fila del pedido: se resuelve contra
// `products.packs`, que es de la marca y el comprador no puede tocar. La fila
// solo sirve para contrastar.

/** Cuánto adelanta quien no paga todo. Cambiarlo es editar esta línea. */
export const ADVANCE_PERCENT = 50

/** Redondeo a céntimos. 360pay cobra en soles con decimales (150.5), así que
 *  no hay que truncar a entero — y truncar regalaría o cobraría de más. */
export function toCents(pen: number): number {
  return Math.round(pen * 100) / 100
}

/**
 * El adelanto que le toca a este pedido.
 *
 * `payFull` es la elección del comprador, y es lo ÚNICO que el cliente aporta a
 * este cálculo: no puede mover el precio ni el porcentaje, solo decidir si paga
 * la mitad o el todo. Pagar de más nunca es un ataque.
 */
export function expectedAdvance(totalPen: number, payFull: boolean): number {
  const total = toCents(Math.max(0, totalPen))
  if (!Number.isFinite(total) || total <= 0) return 0
  return payFull ? total : toCents((total * ADVANCE_PERCENT) / 100)
}

export interface PackLike {
  nombre?: unknown
  precio?: unknown
}

/**
 * Precio REAL de un pack, tal como lo publicó la marca en `products.packs`.
 *
 * Devuelve `null` si el pack no existe o no tiene precio usable, y ese `null`
 * tiene que frenar el cobro: cobrar sobre un precio que no se pudo verificar es
 * exactamente lo que este módulo existe para impedir.
 */
export function priceOfPack(packs: unknown, packName: string | null): number | null {
  if (!Array.isArray(packs)) return null
  const target = String(packName ?? '').trim().toLowerCase()
  for (const p of packs as PackLike[]) {
    if (!p || typeof p !== 'object') continue
    const nombre = String(p.nombre ?? '').trim().toLowerCase()
    // Sin `pack_name` en el pedido no se adivina: un catálogo con varios packs
    // haría que "el primero" cobrara el precio equivocado.
    if (!target || nombre !== target) continue
    const precio = Number(p.precio)
    return Number.isFinite(precio) && precio > 0 ? toCents(precio) : null
  }
  return null
}
