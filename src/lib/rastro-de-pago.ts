// ─── Con qué se sigue UNA transacción ────────────────────────────────────────
//
// Cuando un cobro se discute —el cliente dice que pagó y no aparece, 360pay
// pregunta por una operación, el banco pide el respaldo— la conversación se
// resuelve con cuatro datos y no con el monto. El monto es lo que se ve; esto
// es lo que se busca.
//
// Vivía en DOS listas dentro de la misma tarjeta: una que se pintaba y otra que
// armaba el texto del botón de copiar. Y ya discrepaban — el **cupón** estaba
// solo en el texto copiado, con el argumento de que "es un alfanumérico de API
// que no ayuda a cuadrar mirando". Ese argumento era del portal, no de quien
// trabaja: el cupón es lo que soporte de 360pay pide para abrir un caso, y
// tenerlo escondido detrás de un botón obliga a copiar-y-pegar a ciegas para
// leer un dato que debería estar a la vista.
//
// Una lista, dos usos. Lo que se ve es exactamente lo que se copia.

import { fechaYHora } from './fechas'

export interface RastroDeCobro {
  /** Op. bancaria — lo que pide el banco en un reclamo. */
  operation_number?: string | null
  bank?: string | null
  /** El `_id` del cupón en 360pay: lo que su soporte pide para abrir un caso. */
  coupon_id?: string | null
  /** Código de pago del cliente (KSH…): con esto el portal LISTA el cupón. */
  payment_code?: string | null
}

export interface DatoDeRastro {
  etiqueta: string
  valor: string
  /** Un id largo de API: se pinta en monoespaciada y partiendo línea, para que
   *  se pueda leer y seleccionar entero en vez de cortarlo con puntos. */
  largo?: boolean
}

/**
 * Los datos con los que se sigue este cobro, en el orden en que se usan.
 *
 * El orden no es decorativo: así se busca. Primero el **código de pago**, que
 * es como el portal de 360pay lista los cupones; con el cupón abierto se coteja
 * el **id**; si hay que escalar al banco, la **operación**; y la **fecha y
 * hora** es lo que ubica la transacción en un listado de miles.
 *
 * Solo lo que existe: un campo vacío no se pinta ni se copia. Media línea
 * diciendo "Op. bancaria —" es ruido que hace dudar de si falta el dato o falló
 * la pantalla.
 */
export function datosDeRastro(entrada: {
  orderId?: string | null
  trace?: RastroDeCobro | null
  /** Cuándo se cruzó el cobro (`payment_matched_at` / `saldo_matched_at`). */
  cobradoEn?: string | null
}): DatoDeRastro[] {
  const t = entrada.trace
  const out: DatoDeRastro[] = []
  const pon = (etiqueta: string, valor: string | null | undefined, largo = false) => {
    const v = (valor ?? '').trim()
    if (v) out.push({ etiqueta, valor: v, largo })
  }

  pon('Pedido', entrada.orderId)
  pon('Código de pago', t?.payment_code)
  pon('Cupón 360pay', t?.coupon_id, true)
  // Operación y banco son UN dato: el número sin el banco no se busca en
  // ninguna parte, y el banco sin el número tampoco.
  const op = (t?.operation_number ?? '').trim()
  const banco = (t?.bank ?? '').trim()
  if (op || banco) pon('Op. bancaria', [op, banco].filter(Boolean).join(' · '))
  pon('Cobrado', fechaYHora(entrada.cobradoEn))

  return out
}

/** Lo mismo, como texto pegable en un correo a soporte. Sale de la MISMA lista
 *  que se pintó: si mañana se agrega un dato, se agrega en los dos sitios. */
export function textoParaSoporte(titulo: string, monto: string, datos: DatoDeRastro[]): string {
  return [`${titulo} — ${monto}`, ...datos.map(d => `${d.etiqueta}: ${d.valor}`)].join('\n')
}
