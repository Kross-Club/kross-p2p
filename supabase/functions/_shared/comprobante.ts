// ─── El comprobante de UN cobro ──────────────────────────────────────────────
//
// Lo que el comprador se lleva cuando paga: una página con su número de pedido,
// qué pagó, cuánto, cuándo y con qué se sigue esa transacción. Se abre en otra
// pestaña desde el chat y se guarda como PDF con el "imprimir" del navegador —
// que es exactamente lo que hace un PDF generado, sin un generador que mantener
// ni un archivo que caduque en Storage.
//
// ⚠️ **No es una boleta.** La facturación electrónica (Nubefact) todavía no
// existe en el producto —ver `docs/ESTADO-OPERATIVO.md`— y `stores` ni siquiera
// guarda RUC ni razón social. Esto es una **constancia de pago**: sirve para
// reclamar, para cuadrar y para que el comprador tenga algo que enseñar, y lo
// dice en la propia página. Llamarla boleta sería prometer un documento
// tributario que nadie emitió.
//
// El servidor manda DATOS, no frases: quién arma el texto es la página. Así el
// mismo comprobante se puede pintar distinto —o traducir— sin tocar la función
// que lo sirve, y no hay dos sitios decidiendo cómo se llama un adelanto.

/** Lo que viaja del servidor a la página del comprobante. */
export interface DatosDeComprobante {
  /** El id del cobro. Es la dirección de esta página. */
  cobro_id: string
  /** El número que el comprador ve en su pedido (`ORD-…`). */
  pedido: string | null
  tienda: string | null
  logo: string | null
  comprador: string | null
  /** `adelanto` | `saldo` | `extra` — el tipo GUARDADO. Que un adelanto cubra
   *  el precio entero ("pagó todo") lo decide quien pinta, contra el valor de
   *  hoy, igual que en el panel. */
  tipo: string
  /** Solo en los `extra`: qué se cobró. */
  concepto: string | null
  monto: number
  /** Cuándo entró la plata (ISO). Sin esto no hay comprobante que valga: es lo
   *  que ubica la transacción en un listado de miles. */
  cobrado_en: string | null
  /** Con qué se sigue: el código de pago de 360pay y la operación bancaria. */
  payment_code: string | null
  operation_number: string | null
  bank: string | null
  /** El pedido alrededor del cobro, para que la constancia se explique sola:
   *  cuánto cuesta, cuánto lleva pagado y cuánto le falta HOY. */
  total: number
  pagado: number
  saldo: number
}

/**
 * ¿Este cobro tiene comprobante?
 *
 * Solo el que entró. Una constancia de un cobro pendiente sería un papel que
 * dice que se pagó algo que no se pagó — y el comprador la enseñaría de buena
 * fe. Un anulado tampoco: dejó de existir.
 */
export function tieneComprobante(cobro: { estado?: string | null }): boolean {
  return String(cobro?.estado ?? '').toUpperCase() === 'MATCHED'
}
