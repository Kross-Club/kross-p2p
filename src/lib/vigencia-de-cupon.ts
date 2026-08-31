// ─── ¿El código que le voy a mandar todavía sirve? ───────────────────────────
//
// La pregunta que hay que responder ANTES de volver a pedirle el saldo a
// alguien. Mandar una tarjeta de pago con un cupón vencido es peor que no
// mandarla: el cliente hace su parte, Yape lo rechaza, y el que queda mal es el
// comercio — que además ya gastó el único mensaje que ese cliente iba a abrir.
//
// El vencimiento lo elegimos nosotros (`COUPON_TTL_DAYS`) y desde el bloque §35
// del esquema se guarda en la fila. Antes se calculaba, se mandaba a 360pay y
// se tiraba, así que el panel no tenía manera de saberlo.

import { fechaYHora } from './fechas'

export type Vigencia =
  /** Vivo: se puede mandar. */
  | 'vigente'
  /** Caducó: hay que emitir otro antes de mandar nada. */
  | 'vencido'
  /** Emitido antes de que se guardara la fecha. Ver por qué NO es 'vencido'. */
  | 'desconocido'

/**
 * @param venceEl  `pay360_*_coupon_expires_at`, o null si no se guardó
 * @param ahora    milisegundos; se pasa como dato para que no dependa del reloj
 *                 dentro de un render — dos tarjetas pintadas con medio segundo
 *                 de diferencia no pueden decidir distinto.
 */
export function vigenciaDeCupon(venceEl: string | null | undefined, ahora: number): Vigencia {
  if (!venceEl) return 'desconocido'
  const t = Date.parse(venceEl)
  if (Number.isNaN(t)) return 'desconocido'
  return t > ahora ? 'vigente' : 'vencido'
}

/**
 * ¿Se puede mandar la tarjeta de pago?
 *
 * `desconocido` **sí deja mandar**, y es la decisión que más cuesta explicar y
 * la más importante: no saber si algo caducó no es saber que caducó. Los cupones
 * emitidos antes del bloque §35 no tienen fecha, y bloquearlos por una columna
 * vacía dejaría sin cobrar pedidos cuyo cupón está perfectamente vivo — un
 * error silencioso y del lado caro. Si resulta vencido, el comprador lo ve al
 * pagar y el vendedor emite otro; si se bloquea, no se entera nadie.
 */
export function sePuedeEnviarCobro(v: Vigencia): boolean {
  return v !== 'vencido'
}

/** Lo que dice la tarjeta sobre la fecha. `null` = no hay nada que decir. */
export function avisoDeVigencia(venceEl: string | null | undefined, ahora: number): string | null {
  const v = vigenciaDeCupon(venceEl, ahora)
  if (v === 'desconocido') return null
  return v === 'vigente'
    ? `El código vence el ${fechaYHora(venceEl)}`
    : `El código venció el ${fechaYHora(venceEl)}`
}
