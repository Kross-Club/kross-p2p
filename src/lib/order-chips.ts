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

/** Las notas que pone el equipo sobre un pedido, con la misma regla. */
export const NOTA_META: Record<string, { label: string; style: CSSProperties }> = {
  no_contesta: { label: 'No contesta', style: NEUTRO },
  recuperado: { label: 'Recuperado', style: CERRADO },
  cancelado: { label: 'Cancelado', style: ALERTA },
  anulado: { label: 'Anulado', style: NEUTRO },
}

export const NOTA_KEYS = Object.keys(NOTA_META)
