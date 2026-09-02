// ─── La dirección de la hoja de guía ─────────────────────────────────────────
//
// Relativa, como la del comprobante: en el subdominio de la marca la hoja sale
// con esa marca sin que nadie le pase el dominio. La llave es el TOKEN del
// pedido — quien tiene el enlace de su pedido tiene su guía.

export function enlaceDeGuia(token: string): string {
  return `/guia/${encodeURIComponent(token)}`
}
