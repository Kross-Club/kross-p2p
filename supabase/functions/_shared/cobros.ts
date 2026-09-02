// ─── Un cobro es una fila, no una columna ────────────────────────────────────
//
// Un pedido tenía exactamente DOS cobros y vivían como columnas de
// `order_sessions`: `advance_*` y `saldo_*`. Funcionó mientras el producto
// cobraba dos veces y dejó de funcionar en cuanto hizo falta un tercero — un
// flete, una diferencia por un cambio de talla, un cobro que el vendedor arma a
// mano. Con columnas, el tercero no tiene dónde ir: o se le monta encima al
// saldo (y el saldo deja de ser el saldo) o no existe.
//
// Acá vive lo que las DOS mitades tienen que responder igual: qué campos tiene
// un cobro, cuándo cuenta como plata que entró, y quién puede tocarlo. Lo que
// significa para la pantalla —si es "adelanto" o "pago total", cuánto falta,
// cómo se pinta el anillo— sigue en `src/lib/order-money.ts`: eso es una
// lectura, y depende del valor del pedido HOY.
//
// Sin APIs de Deno: se importa también desde vitest y desde el panel.

/** Lo que se guarda. `total` NO está: "pagó todo" es un adelanto que cubre el
 *  precio entero, y eso se decide contra el valor de hoy — un upsell lo
 *  convierte en adelanto sin tocar la fila. Guardarlo sería tener que acordarse
 *  de reescribirlo. */
export type TipoDeCobroGuardado = 'adelanto' | 'saldo' | 'extra'

export type EstadoDeCobro =
  /** Cupón emitido y todavía sin pagar. Un cupón NO es plata. */
  | 'PENDING'
  /** Entró y la pasarela lo cruzó. La única forma de "cobrado" que cuenta. */
  | 'MATCHED'
  /** Se dio de baja antes de cobrarse. No cuenta ni estorba. */
  | 'ANULADO'

export interface FilaDeCobro {
  id: string
  session_id?: string
  tipo: TipoDeCobroGuardado
  monto: number | string
  estado: string
  matched_at?: string | null
  payment_event_id?: string | null
  pay360_coupon_id?: string | null
  pay360_consumer_code?: string | null
  /** El riel Flow (bloque §39): el token de la orden —por donde el webhook
   *  vuelve a encontrar esta fila— y el enlace del checkout, que se reutiliza
   *  mientras la orden siga pendiente en vez de emitir otra. Un cobro tiene
   *  UNO de los dos juegos de campos, nunca ambos: cada fila cobra por un riel. */
  flow_token?: string | null
  flow_pay_url?: string | null
  coupon_expires_at?: string | null
  /** Para los `extra`: qué se está cobrando. Un monto sin razón no se paga. */
  concepto?: string | null
  /** Lo que se le descontó al comercio por este cobro, y lo que de eso se quedó
   *  el riel (bloque §38). Salen del EVENTO de la pasarela, no del cálculo:
   *  `null` significa que no vino desglose, y no se rellena — una comisión
   *  estimada no se distingue de una medida una vez guardada. */
  comision_pen?: number | string | null
  costo_pasarela_pen?: number | string | null
  /** `auth_user_id` de quien lo creó a mano. NULL = lo emitió el sistema. */
  created_by?: string | null
  created_at?: string | null
}

/** ¿Esta plata entró? Es la única definición que vale, y por eso es una función
 *  y no una comparación suelta repetida en veinte sitios. */
export function entro(c: { estado?: string | null }): boolean {
  return String(c.estado ?? '').toUpperCase() === 'MATCHED'
}

/** ¿Sigue vivo? Un anulado no cuenta como cobrado ni como pendiente: no está. */
export function vive(c: { estado?: string | null }): boolean {
  return String(c.estado ?? '').toUpperCase() !== 'ANULADO'
}

/**
 * Los cobros de un pedido, en el orden en que ocurrieron.
 *
 * El orden importa y no es estético: el adelanto va antes que el saldo porque
 * el banco cobra SIEMPRE el cupón pendiente más antiguo, así que la lista tiene
 * que leerse en el mismo orden en que se va a cobrar. Los anulados se van —
 * dejarlos obligaría a cada pantalla a acordarse de filtrarlos.
 */
export function cobrosVivos(filas: FilaDeCobro[] | null | undefined): FilaDeCobro[] {
  const orden: Record<string, number> = { adelanto: 0, saldo: 1, extra: 2 }
  return (filas ?? [])
    .filter(vive)
    .sort((a, b) => {
      const t = (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9)
      if (t !== 0) return t
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    })
}

/**
 * ¿Se puede BORRAR este cobro?
 *
 * Solo los que creó una persona y solo mientras no hayan entrado. Los otros dos
 * no son del vendedor: el adelanto lo genera el checkout y el saldo la guía, y
 * borrarlos dejaría un pedido que dice no deber nada sobre plata que sí se
 * cobró. Y un cobro MATCHED no se borra nunca — eso es plata con rastro
 * bancario; lo que corresponde ahí es un reembolso, que es otra cosa y no vive
 * en este panel.
 */
export function sePuedeBorrar(c: FilaDeCobro): boolean {
  return c.tipo === 'extra' && !entro(c)
}


// ─── Escribir un cobro ───────────────────────────────────────────────────────
//
// **Mientras dura la mudanza se escribe en los dos sitios**: la tabla nueva y
// las columnas de siempre. Eso es exactamente lo que este archivo existe para
// que no pase en veinte lugares — hay UN sitio que decide qué es un cobro y qué
// deja escrito, así que los dos no pueden divergir por descuido.
//
// Es un compromiso con fecha de caducidad, no una arquitectura. El orden es:
// primero que todo LEA la tabla (hecho), después que solo ella se ESCRIBA, y
// al final las columnas se van. Cuando eso pase, lo único que hay que borrar es
// la mitad de esta función.

/** Las columnas viejas equivalentes a un cobro, para el espejo. */
export function columnasDe(
  tipo: TipoDeCobroGuardado,
  c: { monto?: number; estado?: string; matched_at?: string | null; payment_event_id?: string | null
       pay360_coupon_id?: string | null; pay360_consumer_code?: string | null
       coupon_expires_at?: string | null },
): Record<string, unknown> {
  // Un `extra` no tiene columna que espejar, y ahí está la razón de la mudanza:
  // el tercer cobro no cabía. Se guarda SOLO en la tabla.
  if (tipo === 'extra') return {}
  const p = tipo === 'saldo'
    ? { monto: 'saldo_amount', estado: 'saldo_verification', matched: 'saldo_matched_at',
        evento: 'saldo_event_id', cupon: 'pay360_saldo_coupon_id',
        codigo: 'pay360_saldo_consumer_code', vence: 'pay360_saldo_coupon_expires_at' }
    : { monto: 'advance_amount', estado: 'payment_verification', matched: 'payment_matched_at',
        evento: 'payment_event_id', cupon: 'pay360_coupon_id',
        codigo: 'pay360_consumer_code', vence: 'pay360_coupon_expires_at' }

  const out: Record<string, unknown> = {}
  if (c.monto !== undefined) out[p.monto] = c.monto
  if (c.estado !== undefined) out[p.estado] = c.estado
  if (c.matched_at !== undefined) out[p.matched] = c.matched_at
  if (c.payment_event_id !== undefined) out[p.evento] = c.payment_event_id
  if (c.pay360_coupon_id !== undefined) out[p.cupon] = c.pay360_coupon_id
  if (c.pay360_consumer_code !== undefined) out[p.codigo] = c.pay360_consumer_code
  if (c.coupon_expires_at !== undefined) out[p.vence] = c.coupon_expires_at
  return out
}
