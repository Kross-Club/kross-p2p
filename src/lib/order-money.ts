// ─── La plata de un pedido ───────────────────────────────────────────────────
//
// El tablero pasó de contar pedidos a contar plata, y ahí apareció la pregunta
// que no estaba escrita en ningún lado: ¿cuánto "vale" un pedido? Había dos
// respuestas sueltas en el repo —`estadoDePago` en live-map.ts y la resta del
// saldo en OrderChatPage— y ninguna con nombre. Acá viven las tres cifras que
// de verdad se usan, con la misma regla para todas las pantallas:
//
//   valor    → lo que cuesta el pedido.
//   cobrado  → lo que YA entró, y solo si 360pay lo cruzó.
//   saldo    → lo que falta cobrar (típicamente, contra entrega).
//
// "Cobrado" es la definición cara: un adelanto declarado que todavía no se
// cruza NO es plata que entró. Pintarlo como cobrado le mentiría al vendedor
// sobre su propia caja, que es justo el número por el que abre el tablero.

import { cobrosVivos, entro } from '../../supabase/functions/_shared/cobros.ts'
import type { FilaDeCobro } from '../../supabase/functions/_shared/cobros.ts'
import { esRielEnLinea } from '../../supabase/functions/_shared/comision.ts'
import type { Proveedor } from '../../supabase/functions/_shared/comision.ts'

export interface PedidoConPlata {
  /** La LISTA de cobros (bloque §36). Cuando viene, manda: es el modelo nuevo,
   *  donde un pedido tiene N cobros y el adelanto y el saldo son dos filas más.
   *  Las columnas de abajo son lo que había antes y siguen ahí mientras dure la
   *  mudanza — ver `cobrosDelPedido`. */
  cobros?: FilaDeCobro[] | null
  product_price?: number | string | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  /** El SALDO cobrado por la pasarela, que es una operación distinta del
   *  adelanto: ocurre después, cuando ya existe la guía, y es lo que suelta la
   *  clave de recojo. Ver `cobros`. */
  saldo_amount?: number | string | null
  saldo_verification?: string | null
  payment_matched_at?: string | null
  saldo_matched_at?: string | null
  pay360_coupon_expires_at?: string | null
  pay360_saldo_coupon_expires_at?: string | null
}

// ─── Las tres operaciones, que no son la misma ───────────────────────────────
//
// Al empezar, el comprador **o adelanta o paga todo**: son la misma operación
// con distinto monto, y por eso se distinguen por lo que dejan pendiente, no
// por un campo aparte.
//
//   adelanto → pagó una parte. Queda saldo.
//   total    → pagó el precio entero de una. No queda nada.
//   saldo    → la SEGUNDA operación, meses o días después: cuando la guía ya
//              existe, se le cobra lo que falta y eso suelta la clave de recojo.
//
// Son operaciones separadas —cada una con su cupón, su número de operación
// bancaria y su fecha— y por eso se muestran por separado. Juntarlas en un solo
// "pagado S/180" borraría lo único que un reclamo necesita: cuál de las dos.

export type TipoDeCobro = 'adelanto' | 'total' | 'saldo' | 'extra'

/** ¿Está cruzado por la pasarela? Es la única forma de "cobrado" que cuenta. */
const cruzado = (v: string | null | undefined): boolean =>
  String(v ?? '').toUpperCase() === 'MATCHED'

export interface Cobro {
  tipo: TipoDeCobro
  monto: number
  /** `false` = el cupón está emitido y todavía sin pagar. */
  verificado: boolean
  /** El id de la fila (§36). `null` en los pedidos que todavía se leen de las
   *  columnas viejas: sin id no hay comprobante ni botón de borrar, y eso es
   *  correcto — un cobro sin identidad no es una cosa que se pueda señalar. */
  id?: string | null
  /** Solo en los `extra`: qué se está cobrando. */
  concepto?: string | null
  /** Lo que se le descontó al comercio por este cobro, y lo que le queda
   *  después (bloque §38). `null` = el evento de la pasarela no trajo desglose,
   *  y entonces no se pinta nada: una comisión estimada al lado de un monto
   *  real se leería como medida. Solo viajan al VENDEDOR — lo que el comercio
   *  le paga a Kross no es asunto de quien compró. */
  comision?: number | null
  neto?: number | null
  /** Lo que hace falta para seguirlo y para saber si su cupón sirve. */
  matchedAt?: string | null
  venceEl?: string | null
  couponId?: string | null
  paymentCode?: string | null
  /** Por qué riel se cobró (o se está cobrando) ESTE cobro. Sale de la fila
   *  —un cobro tiene el cupón de 360pay o el token de Flow, nunca ambos— y no
   *  del pedido: con dos rieles, el pedido no dice por dónde fue cada uno. `null`
   *  en los cobros leídos de las columnas viejas, que son todos de 360pay. */
  riel?: Proveedor | null
  /** La fila de `cobros` tal cual, cuando el cobro viene de la tabla (§36).
   *  Está para que quien necesite una regla del modelo —"¿esto se puede dar de
   *  baja?"— se la pregunte a `_shared/cobros.ts` en vez de volver a escribirla
   *  con otras palabras. */
  fila?: FilaDeCobro
}

/**
 * Las operaciones de cobro de este pedido, en orden.
 *
 * **Dos entradas, una salida.** Si viene la lista (`cobros`, bloque §36) manda
 * ella; si no, se deriva de las columnas de siempre. No son dos definiciones de
 * lo que es un cobro: son dos formas de LEER lo mismo mientras dura la mudanza,
 * y hay una prueba que las corre con los mismos datos y exige el mismo
 * resultado. El día que ninguna fila venga sin lista, la segunda se borra.
 *
 * Lo que NO cambia con el modelo nuevo es lo que esta función decide: `total`
 * no se guarda, se deduce. Un adelanto que cubre el precio entero es "pagó
 * todo", y eso depende del valor de HOY — un upsell lo vuelve a convertir en
 * adelanto sin que nadie reescriba nada.
 */
export function cobrosDelPedido(p: PedidoConPlata): Cobro[] {
  const valor = valorDelPedido(p)
  // Una lista VACÍA no es "este pedido no cobró nada": es "no me llegó lista".
  // La diferencia decide de qué lado se lee, y equivocarla es lo peor que puede
  // pasar acá — un pedido con plata en las columnas y sin fila en `cobros` se
  // vería SIN COBRAR, que es la mentira que este archivo no se puede permitir.
  // Vacío cae a las columnas; si ahí tampoco hay nada, la respuesta es la misma.
  const filas = p.cobros?.length ? cobrosVivos(p.cobros) : null

  if (filas) {
    return filas
      .map(f => ({ ...deFila(f, valor), }))
      .filter(c => c.monto > 0)
  }

  // ── Lo de antes, para las filas que aún no se leen de la tabla ──
  const adelanto = Math.max(0, num(p.advance_amount))
  const saldo = Math.max(0, num(p.saldo_amount))
  const out: Cobro[] = []

  if (adelanto > 0) {
    out.push({
      tipo: tipoDelPrimero(adelanto, valor),
      monto: Math.min(adelanto, valor || adelanto),
      verificado: cruzado(p.payment_verification),
      matchedAt: p.payment_matched_at ?? null,
      venceEl: p.pay360_coupon_expires_at ?? null,
    })
  }
  if (saldo > 0) {
    out.push({
      tipo: 'saldo', monto: saldo, verificado: cruzado(p.saldo_verification),
      matchedAt: p.saldo_matched_at ?? null,
      venceEl: p.pay360_saldo_coupon_expires_at ?? null,
    })
  }
  return out
}

/**
 * Si el primer pago cubre el pedido entero no es un adelanto: es EL pago.
 * Llamarlo adelanto haría buscar un saldo que no existe.
 *
 * Se decide contra el valor de HOY, así que un upsell puede convertir un "pago
 * total" en un adelanto — y debe: el pedido volvió a deber algo, y seguir
 * llamándolo total sería decir que no falta cobrar nada.
 */
const tipoDelPrimero = (monto: number, valor: number): TipoDeCobro =>
  valor > 0 && monto >= valor ? 'total' : 'adelanto'

/** Una fila de `cobros`, leída como lo que la pantalla necesita. */
function deFila(f: FilaDeCobro, valor: number): Cobro {
  const monto = Math.max(0, num(f.monto))
  // El tope contra el valor es solo del primero: un `extra` es plata ADEMÁS
  // del precio (un flete), así que recortarlo sería perderlo.
  const cobrado = f.tipo === 'adelanto' ? Math.min(monto, valor || monto) : monto
  // La comisión se lee, no se calcula: la aplica la pasarela y la guardó el
  // webhook desde el evento (§38). Recalcularla acá daría un segundo número
  // para lo mismo, y el que se vería no sería el que se descontó.
  const comision = f.comision_pen == null ? null : Math.max(0, num(f.comision_pen))
  return {
    tipo: f.tipo === 'adelanto' ? tipoDelPrimero(monto, valor) : f.tipo === 'saldo' ? 'saldo' : 'extra',
    monto: cobrado,
    comision,
    // Se resta contra el monto QUE SE MUESTRA, no contra el de la fila: si el
    // tope de arriba recortó algo, un neto sacado del otro no cuadraría con la
    // resta que cualquiera haría mirando la tarjeta.
    neto: comision == null ? null : Math.max(0, Math.round((cobrado - comision) * 100) / 100),
    verificado: entro(f),
    id: f.id,
    concepto: f.concepto ?? null,
    matchedAt: f.matched_at ?? null,
    venceEl: f.coupon_expires_at ?? null,
    couponId: f.pay360_coupon_id ?? null,
    paymentCode: f.pay360_consumer_code ?? null,
    riel: f.flow_token ? 'FLOW' : f.pay360_coupon_id ? '360PAY' : null,
    // La fila entera, para poder preguntarle a la REGLA —`sePuedeBorrar`— en
    // vez de reescribirla acá. Es lo único que no se puede reconstruir desde
    // los campos de arriba sin volver a decidir lo que ya decidió el modelo.
    fila: f,
  }
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Lo que cuesta el pedido **hoy**.
 *
 * `product_price` es el TOTAL del carrito, no el precio de un producto: el
 * servidor lo reescribe cada vez que el carrito cambia —`accept_offer`,
 * `set_qty`, `remove_item` en `order-manage`— con la suma de `items`. Por eso
 * se lee de ahí y no se suman los `items` acá: una segunda forma de calcular el
 * mismo total es una segunda forma de que dé distinto.
 *
 * Que sea el de HOY es lo que hace que un upsell se vea solo. Si al pedido de
 * S/150 que ya estaba pagado entero se le agrega algo de S/80, el total pasa a
 * S/230 y los mismos S/150 cobrados dejan de ser el 100%: el anillo baja a dos
 * tercios y aparece un saldo de S/80 que antes no existía. Nadie tiene que
 * acordarse de recalcular nada — cambia el total y todo lo demás se acomoda.
 */
export function valorDelPedido(p: PedidoConPlata): number {
  return Math.max(0, num(p.product_price))
}

/**
 * Lo que ya entró por este pedido, POR LA PASARELA.
 *
 * Suma las operaciones cruzadas: el adelanto (o el pago total) y, si lo hubo, el
 * saldo. Nada más. Que el comercio cobre por fuera —transferencia, efectivo en
 * la puerta, un acuerdo por el chat— y mueva el pedido a "Entregado" NO lo hace
 * cobrado acá: no tenemos rastro de esa plata, y decir que la tenemos es la
 * única mentira que este archivo no se puede permitir. Por eso el anillo del
 * pedido solo se llena cuando el valor entero pasó por la pasarela.
 *
 * Se topa contra el valor a propósito: un cobro mayor al precio es un dato malo,
 * y dejarlo pasar inflaría el total de una columna sin que nadie note de dónde
 * salió.
 */
export function cobradoDelPedido(p: PedidoConPlata): number {
  const entro = cobrosDelPedido(p)
    .filter(c => c.verificado)
    .reduce((n, c) => n + c.monto, 0)
  const valor = valorDelPedido(p)
  return valor > 0 ? Math.min(entro, valor) : entro
}

/** Lo que falta cobrar. */
export function saldoDelPedido(p: PedidoConPlata): number {
  return Math.max(0, valorDelPedido(p) - cobradoDelPedido(p))
}

export interface Plata {
  valor: number
  cobrado: number
  saldo: number
}

/** Las tres cifras de un grupo de pedidos —una columna del tablero, un día—. */
export function plataDe(pedidos: PedidoConPlata[]): Plata {
  let valor = 0
  let cobrado = 0
  for (const p of pedidos) {
    valor += valorDelPedido(p)
    cobrado += cobradoDelPedido(p)
  }
  return { valor, cobrado, saldo: Math.max(0, valor - cobrado) }
}

export interface AvancePago {
  /** Cuánto del pedido ya está cobrado, de 0 a 1. */
  fraccion: number
  /** Ya está pagado entero: no queda nada por cobrar en la entrega. */
  completo: boolean
  /** No ha entrado nada todavía. */
  vacio: boolean
}

/**
 * Cuánto de este pedido ya está pagado.
 *
 * Es lo que decide a qué pedido correr primero cuando hay cincuenta en la
 * columna: uno pagado entero es plata que ya está en la casa y solo falta
 * despachar; uno a medias es plata que todavía depende de que el cliente
 * aparezca. Un número solo no se compara de un vistazo — una fracción sí.
 *
 * Se apoya en `cobradoDelPedido`, o sea que **solo cuenta lo que 360pay cruzó**:
 * un anillo lleno con un adelanto declarado y no verificado sería la peor
 * mentira posible, porque es justo la que hace despachar.
 */
export function avanceDelPago(p: PedidoConPlata): AvancePago {
  const valor = valorDelPedido(p)
  const cobrado = cobradoDelPedido(p)
  if (valor <= 0) return { fraccion: cobrado > 0 ? 1 : 0, completo: cobrado > 0, vacio: cobrado <= 0 }
  const fraccion = Math.min(1, Math.max(0, cobrado / valor))
  return { fraccion, completo: fraccion >= 1, vacio: cobrado <= 0 }
}

/**
 * Soles, como se escriben en Perú.
 *
 * Se redondea al sol: los céntimos no cambian ninguna decisión del panel y
 * hacen que una columna de totales deje de alinearse.
 */
export function soles(n: number | string | null | undefined): string {
  return `S/ ${Math.round(num(n)).toLocaleString('es-PE')}`
}

/**
 * Soles CON céntimos. La excepción a la regla de arriba, y tiene una razón
 * estrecha: la comisión.
 *
 * Redondear al sol vale para los montos porque los céntimos no cambian ninguna
 * decisión. En una comisión sí la cambian: S/1.45 pintado como "S/ 1" hace que
 * el neto no cuadre con la resta que cualquiera haría mirando la tarjeta, y
 * discutir un descuento de comisión con un número redondeado es discutir otro
 * número. Se usa solo donde el céntimo es el dato, no en los montos.
 */
export function solesExactos(n: number | string | null | undefined): string {
  return `S/ ${num(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * ¿Se le puede ofrecer al comprador pagar su saldo ahora mismo?
 *
 * Vive acá y no en el botón que lo pregunta porque es una regla de PLATA, y la
 * más delicada de las tres condiciones no se adivina mirando la pantalla:
 *
 *   · queda saldo — adelantó una parte, no pagó todo;
 *   · **el adelanto ya está cruzado**. No es orden por orden: el código de pago
 *     identifica al CLIENTE y el banco cobra siempre el cupón pendiente más
 *     antiguo, así que con el adelanto sin pagar, quien viene a pagar el saldo
 *     terminaría pagando el adelanto — por otro monto;
 *   · la tienda cobra en línea. Prometer un botón que no cobra es peor que no
 *     ponerlo: sin riel el saldo lo coordina el asesor por el chat. Cuál riel
 *     lo decide `esRielEnLinea` —la única definición—, no un literal acá.
 */
export function puedePagarSaldo(p: PedidoConPlata & {
  payment_provider?: string | null
}): boolean {
  const falta = Math.max(0, valorDelPedido(p) - Math.max(0, num(p.advance_amount)))
  return falta > 0
    && esRielEnLinea(p.payment_provider)
    && cruzado(p.payment_verification)
    && !cruzado(p.saldo_verification)
}
