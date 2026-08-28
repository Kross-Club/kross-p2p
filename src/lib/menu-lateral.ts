import { useSyncExternalStore } from 'react'

// ─── El menú lateral, ancho o solo íconos ────────────────────────────────────
//
// El panel en PC es una tarjeta 16:9: todo lo que ocupa el menú se lo quita al
// tablero, que es donde de verdad se trabaja. Con nueve columnas de etapas, 148
// píxeles menos son media columna más a la vista.
//
// Es una forma de MIRAR y no una preferencia de la marca, así que vive donde el
// tema y el modo demo: en el dispositivo. Quien trabaja en una laptop chica lo
// quiere plegado; quien tiene un monitor grande, no. Ninguno de los dos debería
// decidir por el otro.

const CLAVE = 'kross-menu-plegado'

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false   // incógnito o storage bloqueado: el menú ancho, que es el que se explica solo
  }
}

let plegado: boolean | null = null
const oyentes = new Set<() => void>()

export function menuPlegado(): boolean {
  if (plegado === null) plegado = leer()
  return plegado
}

export function setMenuPlegado(next: boolean) {
  plegado = next
  try {
    if (next) localStorage.setItem(CLAVE, '1')
    else localStorage.removeItem(CLAVE)
  } catch { /* sin storage sigue valiendo para esta sesión */ }
  oyentes.forEach(l => l())
}

function subscribe(onChange: () => void): () => void {
  oyentes.add(onChange)
  return () => { oyentes.delete(onChange) }
}

/** `true` mientras el menú lateral muestre solo los íconos. */
export function useMenuPlegado(): boolean {
  return useSyncExternalStore(subscribe, menuPlegado, () => false)
}
