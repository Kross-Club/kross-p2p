// ─── Qué es cada PDF de guía — PURO ──────────────────────────────────────────
// Cada PDF que baja de Shalom se guarda diciendo qué es: el VOUCHER (la guía
// con QR) con un sufijo y el RÓTULO (la etiqueta del paquete) con otro. Los de
// antes del 14-set-2026 no tienen sufijo y no se sabe cuál de los dos son.
//
// Vive aparte de `guia.ts` porque lo leen las DOS puntas: el servidor para
// decidir si vuelve a pedir el voucher, y la app para elegir qué PDF enseñar
// cuando un pedido tiene más de un mensaje de guía. Sin APIs de Deno.

export const SUFIJO_GUIA = '-guia.pdf'
export const SUFIJO_ROTULO = '-rotulo.pdf'

/** ¿Esta URL es el rótulo (la etiqueta del paquete) y no la guía con QR? */
export function esRotuloDeGuia(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.endsWith(SUFIJO_ROTULO)
}

/** ¿Esta URL es, seguro, el voucher de Shalom (la guía con QR)? */
export function esGuiaConfirmada(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.endsWith(SUFIJO_GUIA)
}

/** ¿Vale la pena volver a pedir el voucher? Sin PDF, con el rótulo, o con un
 *  PDF de antes que no dice qué es. */
export function pdfMejorable(url: string | null | undefined): boolean {
  return !url || !esGuiaConfirmada(url)
}

/**
 * De varios mensajes de guía, el PDF que se le enseña al comprador: el voucher
 * confirmado si alguno lo trae; si no, el más reciente. Un «Reenviar» que
 * consiguió la guía con QR escribe un mensaje NUEVO, y quedarse con el primero
 * —el del rótulo— era enseñar la etiqueta con la guía ya en el hilo.
 */
export function pdfDeGuiaAEnsenar(mensajes: { type?: string | null; media_url?: string | null }[]): string | null {
  const conPdf = mensajes.filter(m => m.type === 'guia' && m.media_url)
  const confirmado = [...conPdf].reverse().find(m => esGuiaConfirmada(m.media_url))
  return confirmado?.media_url ?? conPdf[conPdf.length - 1]?.media_url ?? null
}
