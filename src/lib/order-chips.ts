import type { CSSProperties } from 'react'

// Cómo se pinta el estado de un pedido — manual de marca §6.1.
//
// Solo dos estados llevan color: el que cierra bien (lima) y el que exige
// acción (alerta). Todos los intermedios son grises. Si todo tiene color,
// nada resalta — y en una lista de 40 pedidos lo único que el vendedor
// necesita ver de lejos es qué cerró y qué se cayó.
//
// Vive acá y no en cada pantalla porque antes había cuatro copias de la misma
// tabla de colores, y cada copia era una oportunidad de que Chats y CRM
// pintaran el mismo pedido distinto.

export const CERRADO: CSSProperties = { background: 'var(--ok-bg)', color: 'var(--ok-on)' }
export const ALERTA: CSSProperties = { background: 'var(--danger-bg)', color: 'var(--danger-fg)' }
export const NEUTRO: CSSProperties = { background: 'var(--surface-3)', color: 'var(--text-muted)' }
/** Gris, pero que se ve encendido: para una etiqueta marcada que no es ni un
 *  cierre ni una alerta. Sin esto, marcada y sin marcar se veían igual. */
export const NEUTRO_MARCADO: CSSProperties = { background: 'var(--surface-3)', color: 'var(--text)' }

/** Velo del mismo estado, para fondos grandes (columnas, filas, barras). */
export const CERRADO_SUAVE: CSSProperties = { background: 'var(--ok-bg-soft)', color: 'var(--ok-fg)' }

export function stageChip(stage: string): CSSProperties {
  if (stage === 'entregado') return CERRADO
  if (stage === 'no_entregado') return ALERTA
  return NEUTRO
}

/** Color sólido para barras y gráficos: lima lo entregado, gris lo demás. */
export function stageBar(stage: string): string {
  return stage === 'entregado' ? 'var(--ok-fg)' : 'var(--structural, #3D444C)'
}

/** Alerta suave: para lo que hay que atender, sin gritar como el fracaso. */
export const ALERTA_SUAVE: CSSProperties = { background: 'var(--warn-bg-soft)', color: 'var(--warn-fg)' }

// ─── Las ETIQUETAS del pedido ────────────────────────────────────────────────
//
// Se llamaban "Nota (CRM)" y dos de las cuatro eran **estados disfrazados**:
// *Cancelado* y *Anulado* ya son el `status` del pedido —tienen sus propios
// botones abajo, con su confirmación, y mueven la conversión—. Ponerlos también
// acá dejaba marcar "Cancelado" sin cancelar nada: un pedido que se veía
// cancelado y seguía vivo en el tablero.
//
// Una etiqueta no es una etapa. La etapa dice DÓNDE está el pedido y la mueve
// el eje; la etiqueta dice QUÉ le pasa, convive con cualquier etapa y la pone
// una persona. Las cuatro que quedan son las que cambian lo que uno hace hoy:
//
//   No contesta        → hay que insistir por otro canal
//   Reprogramado       → pidió otra fecha; no es que no conteste
//   Datos incompletos  → falta dirección, referencia o DNI. NO SALE hasta que
//                        alguien lo complete, y es el atasco que nadie ve
//   Recuperado         → se cayó y volvió. Es la que dice si insistir sirve
//
// Los colores siguen el §6.1 del manual: uno lima —lo que cierra bien—, uno
// rojo —lo que bloquea el despacho—, uno ámbar —lo que pide insistir— y uno
// gris. Si todas llevaran color, ninguna resaltaría.
export const NOTA_META: Record<string, { label: string; style: CSSProperties }> = {
  no_contesta: { label: 'No contesta', style: ALERTA_SUAVE },
  reprogramado: { label: 'Reprogramado', style: NEUTRO_MARCADO },
  datos_incompletos: { label: 'Datos incompletos', style: ALERTA },
  recuperado: { label: 'Recuperado', style: CERRADO },
}

export const NOTA_KEYS = Object.keys(NOTA_META)

/**
 * Cómo se ve una etiqueta APAGADA.
 *
 * Existe porque el apagado y el encendido se veían casi igual: el gris de
 * `NEUTRO` (`--surface-3` + `--text-muted`) contra el del botón sin marcar
 * (`--surface-3` + `--text-faint`) se distinguen a la lupa, no de un vistazo, y
 * con eso no había forma de saber si el clic entró. Ahora lo apagado no tiene
 * fondo y sí un borde: encendido = relleno, apagado = contorno.
 */
export const ETIQUETA_APAGADA: CSSProperties = {
  background: 'transparent',
  color: 'var(--text-faint)',
  border: '1px solid var(--border-strong)',
}

/** Y lo encendido lleva su borde del mismo color que su relleno, para que el
 *  salto de tamaño no mueva la fila al marcar. */
export function etiquetaStyle(key: string, activa: boolean): CSSProperties {
  if (!activa) return ETIQUETA_APAGADA
  return { ...NOTA_META[key]?.style, border: '1px solid transparent', fontWeight: 800 }
}
