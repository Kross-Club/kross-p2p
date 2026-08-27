import { Users, RotateCcw, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Las tres maneras de trabajar la base de clientes ────────────────────────
//
// Mismo criterio que `pedidos-modos.ts`: cada modo responde una pregunta
// distinta, y uno que no lo haga no debería existir. Antes eran dos entradas de
// menú —Clientes y Retención— que hablaban de la misma gente.

export type ModoCliente = 'personas' | 'reactivar' | 'invitar'

export const MODO_CLIENTE_INICIAL: ModoCliente = 'personas'

export const MODOS_CLIENTE: { key: ModoCliente; label: string; icon: LucideIcon; pregunta: string }[] = [
  { key: 'personas', label: 'Personas', icon: Users, pregunta: '¿quién me compra?' },
  { key: 'reactivar', label: 'Reactivar', icon: RotateCcw, pregunta: '¿a quién le toca volver?' },
  { key: 'invitar', label: 'Invitar', icon: UserPlus, pregunta: '¿cómo traigo a mi base a la app?' },
]

export function esModoCliente(v: string | null | undefined): v is ModoCliente {
  return MODOS_CLIENTE.some(m => m.key === v)
}

export function modoClienteDeUrl(params: URLSearchParams): ModoCliente {
  const v = params.get('modo')
  return esModoCliente(v) ? v : MODO_CLIENTE_INICIAL
}

export function urlDeModoCliente(m: ModoCliente): Record<string, string> {
  return m === MODO_CLIENTE_INICIAL ? {} : { modo: m }
}
