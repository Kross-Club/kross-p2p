// ─── SALES ENGINE · Persistencia del borrador ────────────────────────────────
// Guarda el checkout en localStorage por `orderId`. Si el comprador recarga o
// vuelve del anuncio de Meta, retoma en el mismo paso con la data intacta.
// Expira a las 24 h. Ver docs/01-SALES-ENGINE.md.
//
// Nunca revienta: si localStorage está lleno, deshabilitado o en modo privado,
// el checkout sigue funcionando sin persistencia.

import { DRAFT_STORAGE_PREFIX, DRAFT_TTL_MS } from './checkout.config'
import type { CheckoutState } from './types'

/** Puntero al borrador activo, para poder recuperarlo sin conocer el orderId. */
const ACTIVE_KEY = `${DRAFT_STORAGE_PREFIX}active`

interface StoredDraft {
  savedAt: number
  state: CheckoutState
}

const keyFor = (orderId: string): string => `${DRAFT_STORAGE_PREFIX}${orderId}`

export function saveDraft(state: CheckoutState): void {
  // Un pedido ya enviado no es un borrador: se limpia para no reabrirlo.
  if (state.status === 'SUBMITTED') return clearDraft(state.orderId)
  try {
    const payload: StoredDraft = { savedAt: Date.now(), state }
    localStorage.setItem(keyFor(state.orderId), JSON.stringify(payload))
    localStorage.setItem(ACTIVE_KEY, state.orderId)
  } catch {
    // Cuota llena o storage bloqueado: seguir sin persistir es preferible a
    // romperle el checkout al comprador.
  }
}

function readDraft(orderId: string): CheckoutState | null {
  try {
    const raw = localStorage.getItem(keyFor(orderId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    if (!parsed?.state || typeof parsed.savedAt !== 'number') return null

    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearDraft(orderId)
      return null
    }
    // Un borrador de una versión anterior del estado podría no tener los campos
    // que la UI espera; se descarta en vez de arrastrar un estado a medias.
    if (!parsed.state.orderId || typeof parsed.state.step !== 'number') return null

    // El estado de envío no sobrevive a la recarga: se retoma como borrador.
    return { ...parsed.state, status: 'DRAFT' }
  } catch {
    return null
  }
}

/** Borrador activo si sigue vigente. Es lo que se llama al abrir el modal. */
export function loadActiveDraft(): CheckoutState | null {
  try {
    const orderId = localStorage.getItem(ACTIVE_KEY)
    return orderId ? readDraft(orderId) : null
  } catch {
    return null
  }
}

export function clearDraft(orderId: string): void {
  try {
    localStorage.removeItem(keyFor(orderId))
    if (localStorage.getItem(ACTIVE_KEY) === orderId) localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignorar
  }
}

/** Barre borradores vencidos. Se llama al abrir el modal, no en cada guardado. */
export function purgeExpiredDrafts(): void {
  try {
    const now = Date.now()
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(DRAFT_STORAGE_PREFIX) || key === ACTIVE_KEY) continue
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '') as Partial<StoredDraft>
        if (typeof parsed?.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key) // entrada corrupta
      }
    }
  } catch {
    // ignorar
  }
}
