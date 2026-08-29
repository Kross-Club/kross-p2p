import { useSyncExternalStore } from 'react'
import { reiniciarDemo } from './cambios-demo'

// ─── Modo DEMO del panel ─────────────────────────────────────────────────────
//
// Enciende datos de ejemplo en TODO el panel —pedidos, clientes, productos,
// equipo— para poder enseñar cómo se ve la herramienta con una tienda que ya
// vende, sin esperar a que la marca venda.
//
// **Es POR TIENDA y POR DISPOSITIVO.** Las dos cosas, y las dos a propósito:
//
//  · Por dispositivo (`localStorage`), no una columna de `stores`: si fuera de
//    la marca, un vendedor encendiéndolo pondría a TODO su equipo a mirar
//    pedidos inventados, y una tienda podría quedarse en demo en producción sin
//    que nadie lo note. Es una forma de MIRAR, como el tema claro/oscuro.
//  · Por tienda: encenderlo en una marca para enseñarla no debe ensuciar la
//    vista de las otras. Un super admin que prepara una demo de Gadicaf tiene
//    que poder saltar a Kross Shop y ver los pedidos REALES de Kross Shop.
//
// Y no toca la base: nada de lo que se ve acá se guarda ni se envía.
//
// El interruptor está en Marca → Modo demo, y dice de qué tienda habla.
// Mientras esté encendido, el panel lo anuncia con una barra fija arriba: un
// demo que no se anuncia es una mentira.

const PREFIJO = 'kross-demo:'

const clave = (storeId: string) => `${PREFIJO}${storeId}`

function leer(storeId: string): boolean {
  try {
    return localStorage.getItem(clave(storeId)) === '1'
  } catch {
    return false   // incógnito o storage bloqueado: nunca se asume demo
  }
}

// Cache en memoria para que `demoActivo()` sea barato y sincrónico: se consulta
// en cada lectura de datos y en cada pintada del panel.
const estado = new Map<string, boolean>()
const oyentes = new Set<() => void>()

/** ¿La tienda que se está mirando está en demo? Sin tienda, nunca. */
export function demoActivo(storeId: string | null | undefined): boolean {
  if (!storeId) return false
  if (!estado.has(storeId)) estado.set(storeId, leer(storeId))
  return estado.get(storeId)!
}

export function setDemo(storeId: string, next: boolean) {
  // Salir del demo lo deja como el primer día. Lo que se tocó enseñando —una
  // etapa avanzada, un producto agregado, un mensaje escrito— vive en el
  // dispositivo (demo/cambios-demo.ts) y se va con él: si sobreviviera, la
  // próxima demo empezaría a media película y nadie sabría por qué.
  if (!next) reiniciarDemo()
  estado.set(storeId, next)
  try {
    if (next) localStorage.setItem(clave(storeId), '1')
    else localStorage.removeItem(clave(storeId))
  } catch { /* sin storage sigue valiendo para esta sesión */ }
  oyentes.forEach(l => l())
}

function subscribe(onChange: () => void): () => void {
  oyentes.add(onChange)
  return () => { oyentes.delete(onChange) }
}

/** `true` mientras el panel muestra datos de ejemplo de ESTA tienda. */
export function useDemo(storeId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => demoActivo(storeId),
    () => false,
  )
}
