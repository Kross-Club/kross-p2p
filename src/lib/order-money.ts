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

export interface PedidoConPlata {
  product_price?: number | string | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  /** El SALDO cobrado por la pasarela, que es una operación distinta del
   *  adelanto: ocurre después, cuando ya existe la guía, y es lo que suelta la
   *  clave de recojo. Ver `cobros`. */
  saldo_amount?: number | string | null
  saldo_verification?: string | null
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

export type TipoDeCobro = 'adelanto' | 'total' | 'saldo'

/** ¿Está cruzado por la pasarela? Es la única forma de "cobrado" que cuenta. */
const cruzado = (v: string | null | undefined): boolean =>
  String(v ?? '').toUpperCase() === 'MATCHED'

export interface Cobro {
  tipo: TipoDeCobro
  monto: number
  /** `false` = el cupón está emitido y todavía sin pagar. */
  verificado: boolean
}

/**
 * Las operaciones de cobro de este pedido, en orden.
 *
 * Solo las que EXISTEN: un pedido sin saldo cobrado devuelve una sola. Es lo
 * que pinta las tarjetas verdes del panel — una por operación, porque cada una
 * tiene su propio rastro contra el banco.
 */
export function cobrosDelPedido(p: PedidoConPlata): Cobro[] {
  const valor = valorDelPedido(p)
  const adelanto = Math.max(0, num(p.advance_amount))
  const saldo = Math.max(0, num(p.saldo_amount))
  const out: Cobro[] = []

  if (adelanto > 0) {
    // Si el primer pago cubre el pedido entero no es un adelanto: es EL pago.
    // Llamarlo adelanto haría buscar un saldo que no existe.
    out.push({
      tipo: valor > 0 && adelanto >= valor ? 'total' : 'adelanto',
      monto: Math.min(adelanto, valor || adelanto),
      verificado: cruzado(p.payment_verification),
    })
  }
  if (saldo > 0) out.push({ tipo: 'saldo', monto: saldo, verificado: cruzado(p.saldo_verification) })
  return out
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Lo que cuesta el pedido. */
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
 *     ponerlo: sin `360PAY` el saldo lo coordina el asesor por el chat.
 */
export function puedePagarSaldo(p: PedidoConPlata & {
  payment_provider?: string | null
}): boolean {
  const falta = Math.max(0, valorDelPedido(p) - Math.max(0, num(p.advance_amount)))
  return falta > 0
    && p.payment_provider === '360PAY'
    && cruzado(p.payment_verification)
    && !cruzado(p.saldo_verification)
}
