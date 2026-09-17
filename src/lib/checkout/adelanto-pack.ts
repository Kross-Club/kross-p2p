// ─── KROSS FORM · El adelanto por pack, lado del navegador ───────────────────
// Espejo de las funciones homónimas de `supabase/functions/_shared/advance.ts`.
// Aquí se ENSEÑA el monto; allá se COBRA. Si las dos se desalinean, el comprador
// ve un número y paga otro —el peor error posible de un checkout—, y por eso
// `advance-parity.test.ts` compara las dos puntas valor por valor.
//
// Vive en su propio archivo y no dentro de `checkout.config.ts` por dos razones:
//
//  · **Peso.** El bundle del embed (`kf.js`) apunta a menos de 20 KB y no tiene
//    por qué arrastrar la cobertura, los badges y la copy del checkout de la PWA.
//  · **Separación.** Esto es de krossform.com. `checkout.config.ts` es de
//    krossclub.app y no lo llama: la PWA sigue con la proporción de §56 intacta.
//
// Lo único que se importa de allá es `advanceFor`, para que el redondeo al sol
// sea literalmente la misma línea en los dos caminos.
//
// Ver `docs/18-KROSS-FORM.md` §5.

import { advanceFor } from './checkout.config'

/** Los cuatro destinos válidos de un pedido. */
const DISPATCH_VALIDOS = [
  'MOTORIZADO_LIMA', 'MOTORIZADO_PROVINCIA', 'AGENCIA_PROVINCIA', 'AGENCIA_LIMA',
] as const

/**
 * Si este destino va contraentrega pase lo que pase.
 *
 * Lima y Callao no adelantan. Un destino desconocido cae también aquí: es la
 * dirección segura —no cobrar— y además mantiene al formulario diciendo lo
 * mismo que el servidor, que decide igual.
 */
export function esContraentregaPorDestino(dispatchType: unknown): boolean {
  const d = typeof dispatchType === 'string' ? dispatchType.trim() : ''
  if (!(DISPATCH_VALIDOS as readonly string[]).includes(d)) return true
  return d.endsWith('_LIMA')
}

/** Lo que el panel guardó en `packs[].adelanto_pen`, saneado. 0 = no adelanta. */
export function adelantoSaneado(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

/** El adelanto que pide ESTE pack. Empareja por `nombre`, como el precio. */
export function adelantoFromPacks(packs: unknown, packName: string | null): number {
  if (!Array.isArray(packs) || !packName) return 0
  const hit = packs.find(p => (p as { nombre?: unknown })?.nombre === packName)
  return adelantoSaneado((hit as { adelanto_pen?: unknown })?.adelanto_pen)
}

/** Lo que hace falta para saber cuánto adelanta un pedido del embed. */
export interface EntradaDeAdelanto {
  precioPack: number
  adelantoPen: number
  dispatchType: unknown
  cobraCompleto?: boolean
  permiteMitad?: boolean
}

/**
 * Cuánto adelanta un pedido de Kross Form. La escalera, en este orden exacto:
 *
 *   1. destino Lima/Callao   → 0                         (contraentrega, SIEMPRE)
 *   2. `cobra_completo`      → el precio del pack
 *   3. `adelanto_pen` > 0    → min(adelanto, precio del pack)
 *   4. `permite_mitad`       → la mitad
 *   5. si no                 → 0
 *
 * El destino primero porque es la regla de seguridad, no la comercial.
 */
export function adelantoDelPedido(e: EntradaDeAdelanto): number {
  const precio = Number(e.precioPack)
  if (!Number.isFinite(precio) || precio <= 0) return 0

  if (esContraentregaPorDestino(e.dispatchType)) return 0
  if (e.cobraCompleto === true) return advanceFor(precio, 'FULL')

  const adelanto = adelantoSaneado(e.adelantoPen)
  if (adelanto > 0) return Math.min(adelanto, advanceFor(precio, 'FULL'))

  if (e.permiteMitad === true) return advanceFor(precio, 'HALF')
  return 0
}
