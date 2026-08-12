// A qué versión del checkout entra cada comprador.
//
// El reparto es al azar, pero **estable por dispositivo**: se sortea una vez y
// se guarda. Sin eso, cada recarga podría cambiarle el checkout a la misma
// persona —el precio del adelanto le bailaría entre S/20 y S/30— y además los
// números saldrían mal, porque una visita contaría en las dos ramas.
//
// La tienda manda sobre el sorteo (`stores.checkout_ab_mode`, bloque 19):
// 'SPLIT' lo mantiene, 'A'/'B' mandan todo el tráfico a esa versión. Eso es lo
// que se usa cuando el experimento terminó y hay una ganadora — hasta entonces
// el 50/50 es el que produce los números.
import type { CheckoutVariant } from './types'

const KEY = 'kross.checkout.variant'

/** Cómo reparte la tienda. `null`/desconocido se trata como 'SPLIT': una marca
 *  sin migrar, o un `select` que aún no volvió, no puede cambiar el reparto. */
export type CheckoutAbMode = 'SPLIT' | 'A' | 'B'

export function abModeOf(raw: unknown): CheckoutAbMode {
  return raw === 'A' || raw === 'B' ? raw : 'SPLIT'
}

/** `?checkout=A|B` fuerza una versión. Es para demostrar y depurar: no toca lo
 *  guardado, así que no contamina el sorteo de un comprador real. */
function fromUrl(): CheckoutVariant | null {
  try {
    const v = new URLSearchParams(window.location.search).get('checkout')?.toUpperCase()
    return v === 'A' || v === 'B' ? v : null
  } catch { return null }
}

export function resolveVariant(mode: CheckoutAbMode = 'SPLIT'): CheckoutVariant {
  const forced = fromUrl()
  if (forced) return forced

  // Tienda con ganadora elegida. **No se guarda**, igual que el forzado por
  // URL: si se persistiera, al devolver el switch a 50/50 cada dispositivo que
  // pasó por aquí quedaría clavado en esta versión para siempre, y el siguiente
  // experimento nacería sesgado sin que nadie lo note.
  if (mode !== 'SPLIT') return mode

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
