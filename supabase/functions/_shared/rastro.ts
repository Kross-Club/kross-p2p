// ─── Cómo se lee el rastro de un pago ────────────────────────────────────────
//
// Un cobro que entró deja cuatro datos con los que se discute después: el código
// de pago (lo que el portal de 360pay llama "Cupón" y con lo que lista cada
// uno), el número de operación y el banco —lo que pide el banco en un reclamo—,
// y el `_id` interno del cupón, que viaja por si un día hace falta por API.
//
// Están repartidos: unos en la fila del pedido, otros en la columna
// `operation_number` del evento, y el resto dentro del `raw` que mandó el
// webhook. Sacarlos es tres `??` encadenados y un `JSON.parse` que puede
// fallar — o sea, exactamente la clase de código que al escribirse dos veces se
// escribe distinto la segunda. Ya pasó: `get-comprobante` nació leyendo
// `raw.coupon.bank`, que no existe (el campo es `raw.bank_tx_id`), y el
// comprobante habría salido sin banco sin que nada fallara.
//
// Así que se lee en UN sitio y lo usan `get-session` y `get-comprobante`.

export interface Rastro {
  /** Op. bancaria — lo que pide el banco en un reclamo. */
  operation_number: string | null
  bank: string | null
  /** El `_id` interno de 360pay: para lo que se resuelva por API. */
  coupon_id: string | null
  /** Código de pago (KSH…): el único identificador que usa una persona. */
  payment_code: string | null
}

/** Lo que se sabe sin haber cobrado todavía: el cupón se emitió, el rastro
 *  bancario no existe porque no ha ocurrido. `null` si tampoco hay cupón. */
export function rastroSinEvento(cuponId: string | null, codigo: string | null): Rastro | null {
  return (cuponId || codigo)
    ? { operation_number: null, bank: null, coupon_id: cuponId, payment_code: codigo }
    : null
}

/**
 * El rastro completo, con el evento del webhook ya en la mano.
 *
 * La fila del pedido manda sobre el `raw`: el `raw` es el respaldo para los
 * pedidos que pagaron pese a que la emisión no llegó a guardar su columna —pasó
 * con el primer cupón real, cuando un fallo posterior a la emisión respondía
 * antes de escribir la fila—.
 */
export function rastroDelEvento(
  evento: { raw?: string | null; operation_number?: string | null } | null | undefined,
  cuponId: string | null,
  codigo: string | null,
): Rastro | null {
  if (!evento) return rastroSinEvento(cuponId, codigo)

  let op = evento.operation_number ?? null
  let bank: string | null = null
  let code: string | null = codigo
  try {
    const raw = JSON.parse(evento.raw ?? '{}')
    op = op ?? (typeof raw.operation_number === 'string' ? raw.operation_number : null)
    bank = typeof raw.bank_tx_id === 'string' ? raw.bank_tx_id : null
    code = code ?? (typeof raw.code === 'string' ? raw.code : null)
  } catch { /* raw no-JSON (eventos viejos del flujo manual): sin rastro */ }

  return { operation_number: op, bank, coupon_id: cuponId, payment_code: code }
}
