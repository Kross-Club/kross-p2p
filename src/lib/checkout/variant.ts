// A qué versión del checkout entra cada comprador.
//
// El reparto es al azar, pero **estable por dispositivo**: se sortea una vez y
// se guarda. Sin eso, cada recarga podría cambiarle el checkout a la misma
// persona —el precio del adelanto le bailaría entre S/20 y S/30— y además los
// números saldrían mal, porque una visita contaría en las dos ramas.
import type { CheckoutVariant } from './types'

const KEY = 'kross.checkout.variant'

/** `?checkout=A|B` fuerza una versión. Es para demostrar y depurar: no toca lo
 *  guardado, así que no contamina el sorteo de un comprador real. */
function fromUrl(): CheckoutVariant | null {
  try {
    const v = new URLSearchParams(window.location.search).get('checkout')?.toUpperCase()
    return v === 'A' || v === 'B' ? v : null
  } catch { return null }
}

export function resolveVariant(): CheckoutVariant {
  const forced = fromUrl()
  if (forced) return forced

  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'A' || saved === 'B') return saved
    const picked: CheckoutVariant = Math.random() < 0.5 ? 'A' : 'B'
    localStorage.setItem(KEY, picked)
    return picked
  } catch {
    // Modo incógnito o storage bloqueado: se juega igual, solo que sin
    // recordarlo. Preferible a romper el checkout por no poder medir.
    return Math.random() < 0.5 ? 'A' : 'B'
  }
}
