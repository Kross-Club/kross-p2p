import { useEffect, useSyncExternalStore } from 'react'

// Tema del panel del vendedor. Tres preferencias, dos resultados:
//  · 'system' (por defecto) → sigue al sistema operativo
//  · 'light' / 'dark'       → el vendedor decidió, y se respeta
//
// El tema se aplica SOLO mientras hay una pantalla de panel montada
// (`usePanelTheme`): las páginas del comprador y la web pública son de la
// marca y no se oscurecen porque el vendedor prefiera trabajar en oscuro.
export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'kross-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme(): Theme {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function readPref(): ThemePref {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'   // modo incógnito o storage bloqueado: seguimos al sistema
  }
}

let pref: ThemePref = typeof window !== 'undefined' ? readPref() : 'system'
const listeners = new Set<() => void>()

export function getThemePref(): ThemePref { return pref }

export function setThemePref(next: ThemePref) {
  pref = next
  try { localStorage.setItem(KEY, next) } catch { /* sin storage igual funciona en esta sesión */ }
  listeners.forEach(l => l())
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  mq?.addEventListener('change', onChange)
  return () => {
    listeners.delete(onChange)
    mq?.removeEventListener('change', onChange)
  }
}

const themeSnapshot = (): Theme => (pref === 'system' ? systemTheme() : pref)
const prefSnapshot = (): ThemePref => pref
const lightSnapshot = (): Theme => 'light'
const systemPrefSnapshot = (): ThemePref => 'system'

/** El tema resuelto + la preferencia guardada, reactivos. */
export function useTheme(): { theme: Theme; pref: ThemePref; setPref: (p: ThemePref) => void } {
  const theme = useSyncExternalStore(subscribe, themeSnapshot, lightSnapshot)
  const current = useSyncExternalStore(subscribe, prefSnapshot, systemPrefSnapshot)
  return { theme, pref: current, setPref: setThemePref }
}

/**
 * Aplica el tema al documento mientras el componente esté montado y lo quita
 * al desmontarse. Lo llaman las pantallas de panel (`Layout` y la del pedido).
 */
export function usePanelTheme(): Theme {
  const { theme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    return () => { root.removeAttribute('data-theme') }
  }, [theme])

  return theme
}

/**
 * Lo contrario de `usePanelTheme`: garantiza tema claro en una pantalla de
 * marca (login, web pública). Hace falta porque el script de index.html puede
 * haber marcado <html> antes de saber a qué pantalla íbamos.
 */
export function useNoPanelTheme(): void {
  useEffect(() => { document.documentElement.removeAttribute('data-theme') }, [])
}

/**
 * Cambia al tema contrario al que se está viendo.
 *
 * Si el tema elegido es el que ya pide el sistema, se guarda 'system' en vez
 * del valor fijo: así el panel vuelve solo a seguir al sistema operativo —el
 * estado por defecto— sin necesidad de un tercer botón que casi nadie usaría.
 */
export function toggleTheme(current: Theme) {
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  setThemePref(systemTheme() === next ? 'system' : next)
}
