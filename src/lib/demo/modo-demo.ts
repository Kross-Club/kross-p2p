import { useSyncExternalStore } from 'react'

// ─── Modo DEMO del panel ─────────────────────────────────────────────────────
//
// Enciende datos de ejemplo en TODO el panel —pedidos, clientes, productos,
// equipo— para poder enseñar cómo se ve la herramienta con una tienda que ya
// vende, sin esperar a que la marca venda.
//
// **Vive en el dispositivo, no en la marca.** Es una decisión, no un descuido:
//
//  · Si fuera una columna de `stores`, un vendedor encendiéndolo pondría a TODO
//    su equipo a mirar pedidos inventados, y una marca podría quedarse en demo
//    en producción sin que nadie lo note. El riesgo no vale la comodidad.
//  · Es una forma de MIRAR, no un atributo de la tienda — igual que el tema
//    claro/oscuro, que ya vive así (`kross-theme`).
//  · Y no toca la base: nada de lo que se ve acá se guarda ni se envía.
//
// El interruptor está en Marca → Modo demo. Mientras esté encendido, el panel
// lo dice con una barra fija arriba: un demo que no se anuncia es una mentira.

const KEY = 'kross-demo'

function leer(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false   // incógnito o storage bloqueado: nunca se asume demo
  }
}

let activo: boolean = typeof window !== 'undefined' ? leer() : false
const oyentes = new Set<() => void>()

export function demoActivo(): boolean { return activo }

export function setDemo(next: boolean) {
  activo = next
  try {
    if (next) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* sin storage sigue valiendo para esta sesión */ }
  oyentes.forEach(l => l())
}

function subscribe(onChange: () => void): () => void {
  oyentes.add(onChange)
  return () => { oyentes.delete(onChange) }
}

/** `true` mientras el panel muestra datos de ejemplo. Reacciona al interruptor. */
export function useDemo(): boolean {
  return useSyncExternalStore(subscribe, demoActivo, () => false)
}
