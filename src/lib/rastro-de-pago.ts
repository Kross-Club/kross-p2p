// ─── Con qué se sigue UNA transacción ────────────────────────────────────────
//
// Cuando un cobro se discute —el cliente dice que pagó y no aparece, 360pay
// pregunta por una operación, el banco pide el respaldo— la conversación se
// resuelve con cuatro datos y no con el monto. El monto es lo que se ve; esto
// es lo que se busca.
//
// Vivía en DOS listas dentro de la misma tarjeta: una que se pintaba y otra que
// armaba el texto del botón de copiar. Una lista, dos usos: lo que se ve es
// exactamente lo que se copia.
//
// **Qué NO va, y por qué** (31-ago-2026). Se llegó a pintar el `_id` del cupón,
// suponiendo que era lo que soporte pediría. No lo es: el panel de 360pay
// **titula sus cupones con el código de pago** —"Cupón: KSH34750200669"— y el
// `_id` es de su API, no aparece en ninguna pantalla que use una persona. O sea
// que el código de pago YA es el cupón, y poner los dos era pedirle a quien
// mira que distinga entre dos nombres del mismo cupón. Sigue en la base
// (`pay360_coupon_id`) para lo que se resuelva por API; en pantalla es ruido.

import { fechaYHora } from './fechas'

export interface RastroDeCobro {
  /** Op. bancaria — lo que pide el banco en un reclamo. */
  operation_number?: string | null
  bank?: string | null
  /** El `_id` interno de 360pay. Viaja porque un día puede hacer falta por API;
   *  NO se pinta ni se copia — su propio panel no lo enseña. */
  coupon_id?: string | null
  /** Código de pago (KSH…). Es lo que el panel de 360pay llama "Cupón" y con lo
   *  que lista y abre cada uno: el único identificador que usa una persona. */
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
 * El orden no es decorativo: así se busca. Primero el **código de pago**, que es
 * con lo que el portal de 360pay lista y abre el cupón; si hay que escalar al
 * banco, la **operación**; y la **fecha y hora** es lo que ubica la transacción
 * en un listado de miles.
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
