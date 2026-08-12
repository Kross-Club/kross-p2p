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
