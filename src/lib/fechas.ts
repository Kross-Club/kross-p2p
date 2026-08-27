// ─── Cómo se escribe una fecha en el panel ───────────────────────────────────
//
// Había tres formateadores privados —uno en la bandeja, uno en la ficha del
// cliente, uno a punto de nacer en el tablero— y ya empezaban a discrepar: el
// de la bandeja leía la hora del reloj DENTRO del render, así que dos tarjetas
// pintadas en distinto momento podían decidir distinto si un pedido "es de
// hoy". Acá `ahora` se pasa como dato, igual que en `antiguedad`.

/** Hora si entró hoy, fecha corta si no: un pedido de la semana pasada que solo
 *  dice "07:08 p. m." se lee como si fuera de hace un rato. */
export function horaOFecha(iso: string | null | undefined, ahora: number): string {
  const d = fecha(iso)
  if (!d) return ''
  const hoy = new Date(ahora)
  const mismoDia = d.getFullYear() === hoy.getFullYear()
    && d.getMonth() === hoy.getMonth()
    && d.getDate() === hoy.getDate()
  return mismoDia
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

/** Día y mes: `27 ago`. Para cuando lo que importa es la fecha, no la hora. */
export function diaMes(iso: string | null | undefined): string {
  return fecha(iso)?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) ?? ''
}

/** Con año, para historiales que cruzan campañas: `27 ago 26`. */
export function fechaCorta(iso: string | null | undefined): string {
  return fecha(iso)?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) ?? '—'
}

/** Una fecha inválida no es una excepción: el servidor manda, y una tarjeta en
 *  blanco es mejor que un "Invalid Date" o una pantalla rota. */
function fecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
