import { useEffect, useSyncExternalStore } from 'react'

// Tema del panel del vendedor.
//  · 'dark' (por defecto)   → el manual de marca describe una interfaz oscura
//  · 'light'                → la variante clara, para quien la prefiera
//  · 'system'               → sigue al sistema operativo (valor heredado: ya no
//                             es el default, pero si alguien lo tiene guardado
//                             se respeta)
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
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark'
  } catch {
    return 'dark'   // modo incógnito o storage bloqueado: el panel es oscuro
  }
}

let pref: ThemePref = typeof window !== 'undefined' ? readPref() : 'dark'
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
const darkSnapshot = (): Theme => 'dark'
const darkPrefSnapshot = (): ThemePref => 'dark'

/** El tema resuelto + la preferencia guardada, reactivos. */
export function useTheme(): { theme: Theme; pref: ThemePref; setPref: (p: ThemePref) => void } {
  const theme = useSyncExternalStore(subscribe, themeSnapshot, darkSnapshot)
  const current = useSyncExternalStore(subscribe, prefSnapshot, darkPrefSnapshot)
  return { theme, pref: current, setPref: setThemePref }
}

/**
 * Aplica el tema al documento mientras el componente esté montado y lo quita
 * al desmontarse. Lo llaman las pantallas de panel (`Layout` y la del pedido).
 *
 * Se cuenta cuántas lo piden porque desde que el pedido se abre EN PANEL hay
 * dos montadas a la vez: el marco y el pedido encima. Sin la cuenta, cerrar el
 * pedido quitaba el atributo que el marco seguía necesitando, y el panel se
 * volvía claro hasta el siguiente cambio de tema.
 */
let pidiendoTema = 0

export function usePanelTheme(): Theme {
  const { theme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    pidiendoTema++
    root.setAttribute('data-theme', theme)
    return () => {
      pidiendoTema--
      if (pidiendoTema === 0) root.removeAttribute('data-theme')
    }
  }, [theme])

  return theme
}

/**
 * Pantallas que son de KROSS y no de la marca —el acceso al panel, la web
 * pública de `krossclub.app`— y que van en ink pase lo que pase: acá todavía
 * no hay vendedor, así que no hay preferencia de tema que respetar.
 *
 * `activo` existe para las pantallas que son de Kross **o** de la marca según
 * el dominio: las páginas legales viven en los dos, y en el subdominio de una
 * marca siguen claras. El parámetro evita el `if` alrededor del hook, que las
 * reglas de React prohíben.
 */
export function useKrossTheme(activo = true): void {
  useEffect(() => {
    const root = document.documentElement
    const previo = root.getAttribute('data-theme')
    if (activo) root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')   // pantalla de marca: manda su color
    return () => {
      if (previo) root.setAttribute('data-theme', previo)
      else root.removeAttribute('data-theme')
    }
  }, [activo])
}

/**
 * Lo contrario de `usePanelTheme`: garantiza tema claro en una pantalla de
 * marca (acceso del comprador, web pública). Hace falta porque el script de
 * index.html puede haber marcado <html> antes de saber a qué pantalla íbamos.
 */
export function useNoPanelTheme(): void {
  useEffect(() => { document.documentElement.removeAttribute('data-theme') }, [])
}

/** Cambia al tema contrario al que se está viendo, y lo deja fijo. */
export function toggleTheme(current: Theme) {
  setThemePref(current === 'dark' ? 'light' : 'dark')
}
