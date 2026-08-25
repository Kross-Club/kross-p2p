import { useSyncExternalStore } from 'react'

// "La PC del vendedor" = pantalla ancha + puntero de mouse.
// Una tablet táctil de 1024px NO cuenta: ahí el panel angosto con barra abajo
// (y el banner de instalar) siguen siendo lo correcto. El escritorio pide lo
// contrario: marco 16:9, navegación al costado y nada de "instala la app".
export const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)'

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY)
    : null
}

function subscribe(onChange: () => void): () => void {
  const mq = mediaQuery()
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const getSnapshot = () => mediaQuery()?.matches ?? false
const getServerSnapshot = () => false

/** true en escritorio. Reacciona al redimensionar la ventana. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
