// ─── Qué dice una constancia de pago ─────────────────────────────────────────
//
// El servidor manda datos (`_shared/comprobante.ts`); acá se decide qué se
// llama cómo y qué líneas se pintan. Está fuera de la página por lo de siempre:
// las líneas del comprobante son las mismas que el panel usa para seguir un
// cobro, y dos listas de "los datos de esta transacción" ya discreparon una vez.

import { fechaYHora } from './fechas'
import { datosDeRastro } from './rastro-de-pago'
import type { DatoDeRastro } from './rastro-de-pago'
import type { DatosDeComprobante } from '../../supabase/functions/_shared/comprobante.ts'

/**
 * Cómo se llama este cobro EN EL COMPROBANTE.
 *
 * Más corto que en el panel —ahí dice "Adelanto pagado con Yape (360pay)"—
 * porque el papel ya tiene su propia línea de método y su propio monto grande.
 * Repetirlo en el título lo convierte en ruido.
 *
 * Un `extra` se llama por su CONCEPTO. Para el comprador, "Cobro adicional" no
 * es información: lo que necesita ver es "Flete a Piura", que es lo que le
 * dijeron cuando le cobraron.
 */
export function nombreDelCobro(c: { tipo: string; concepto?: string | null; monto: number; total: number }): string {
  const concepto = (c.concepto ?? '').trim()
  if (c.tipo === 'extra') return concepto || 'Cobro adicional'
  if (c.tipo === 'saldo') return 'Saldo del pedido'
  // "Pagó todo" no está guardado: es un adelanto que cubre el precio entero, y
  // eso se decide contra el valor del pedido. Misma regla que `order-money.ts`;
  // si estuviera guardada, un upsell la dejaría vieja.
  return c.total > 0 && c.monto >= c.total ? 'Pago completo del pedido' : 'Adelanto del pedido'
}

/**
 * Las líneas del comprobante, en el orden en que se leen.
 *
 * Sale de `datosDeRastro` —la misma lista que el panel pinta y que el botón de
 * "copiar para soporte" arma— más el cliente. Así, cuando el comprador enseña su
 * constancia y el vendedor mira su panel, los dos están viendo los mismos
 * campos con los mismos nombres, que es lo que hace que un reclamo se resuelva
 * en un mensaje y no en cinco.
 */
export function lineasDelComprobante(d: DatosDeComprobante): DatoDeRastro[] {
  const rastro = datosDeRastro({
    orderId: d.pedido,
    trace: { payment_code: d.payment_code, operation_number: d.operation_number, bank: d.bank },
    cobradoEn: d.cobrado_en,
  })
  const cliente = (d.comprador ?? '').trim()
  // El cliente va después del pedido: primero se identifica la compra, después
  // quién la hizo. Solo si existe — media línea diciendo "Cliente —" hace dudar
  // de si falta el dato o falló la página.
  if (!cliente) return rastro
  const i = rastro.findIndex(l => l.etiqueta === 'Pedido')
  const out = [...rastro]
  out.splice(i + 1, 0, { etiqueta: 'Cliente', valor: cliente })
  return out
}

/** La fecha del encabezado, con el mismo formato que usa el panel para cotejar
 *  contra el portal de 360pay: si el comprador lee una hora y el vendedor otra,
 *  el reclamo empieza discutiendo cuál es. */
export function fechaDelComprobante(d: DatosDeComprobante): string {
  return fechaYHora(d.cobrado_en)
}

/**
 * La dirección de una constancia.
 *
 * Relativa a propósito: en `marca.krossclub.app` el comprobante sale con el
 * logo y el nombre de esa marca sin que nadie tenga que pasarle el dominio, y
 * el mensaje que lo anuncia —que lo escribe un webhook, sin navegador y sin
 * saber desde qué host se va a leer— solo lleva el id del cobro.
 */
export function enlaceDeComprobante(cobroId: string): string {
  return `/comprobante/${encodeURIComponent(cobroId)}`
}
