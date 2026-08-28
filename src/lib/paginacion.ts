// ─── Cuántas filas pintar ────────────────────────────────────────────────────
//
// Una bandeja se lee de arriba abajo hasta que se acaba el tiempo, así que
// pintar mil filas para que alguien mire quince es trabajo que el navegador
// hace para nadie. Se pintan de a cien y se van sumando al bajar — sin botones
// de página: en una bandeja, "siguiente" obliga a decidir cuándo dejar de leer,
// y lo que uno quiere es seguir leyendo.
//
// La excepción es la fila MARCADA. El botón "ir al pedido seleccionado" la
// centra, y para centrarla tiene que existir en la pantalla: si el pedido
// abierto es el número 340 y solo hay cien pintadas, no hay nada a lo que ir.
// Por eso la ventana se estira hasta alcanzarlo. No es un caso raro — es
// justamente lo que pasa cuando uno abre un pedido, se va a otra cosa y vuelve.

export const POR_PAGINA = 100

/**
 * Cuántas filas se pintan de verdad.
 *
 * @param total    Filas que hay.
 * @param pedidas  Cuántas se han pedido hasta ahora (cien, doscientas…).
 * @param marcada  Índice de la fila marcada, o `-1` si no hay ninguna.
 *
 * Nunca menos de `pedidas`, nunca más de `total`, y siempre lo bastante para
 * que la marcada esté dentro.
 */
export function cuantasPintar(total: number, pedidas: number, marcada: number): number {
  const minimo = marcada >= 0 ? marcada + 1 : 0
  return Math.max(0, Math.min(total, Math.max(pedidas, minimo)))
}

/** ¿Queda algo por pintar? Es lo que decide si el centinela del final existe —
 *  y si no existe, no puede dispararse en bucle cuando ya está todo. */
export function faltanFilas(total: number, pintadas: number): boolean {
  return pintadas < total
}

/** Cómo se dice cuántas se están viendo. Solo cuando falta algo: "100 de 100"
 *  es ruido, y decirlo siempre entrena a no leerlo. */
export function resumenDePaginado(total: number, pintadas: number): string | null {
  return faltanFilas(total, pintadas) ? `Mostrando ${pintadas} de ${total}` : null
}
