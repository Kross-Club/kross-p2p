import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useIsDesktop } from '../lib/use-desktop'

// ─── El cajón que entra por la derecha ───────────────────────────────────────
//
// La forma de abrir algo sin salir de donde estás. Lo usan el pedido y la ficha
// del cliente: si cada uno trajera su propio marco, uno terminaría anclado a la
// ventana y el otro al panel, y se verían como dos aplicaciones distintas.
//
// En PC la app es una tarjeta 16:9 centrada con margen gris alrededor
// (`Layout`). Un cajón anclado a la VENTANA se desbordaría sobre ese gris; acá
// se repite esa misma caja —mismas medidas, mismo `p-4`— y el cajón entra
// dentro, recortado por sus esquinas redondeadas.

export default function PanelDerecha({ etiqueta, ancho = 'min(560px, 100%)', onCerrar, children }: {
  /** Para lectores de pantalla: qué es lo que se abrió. */
  etiqueta: string
  /** Ancho en escritorio. En móvil siempre ocupa la pantalla. */
  ancho?: string
  onCerrar: () => void
  children: ReactNode
}) {
  const desktop = useIsDesktop()

  // Escape cierra. Es lo que uno intenta antes de buscar la X, y en algo que
  // tapa la pantalla no tenerlo se siente como estar atrapado.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  // El fondo no scrollea mientras está abierto: si no, la rueda del mouse mueve
  // la lista de atrás cuando el puntero sale del cajón.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  const velo = (
    <div className="absolute inset-0 panel-velo" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCerrar} aria-hidden="true" />
  )

  const cajon = (w: string) => (
    <div role="dialog" aria-modal="true" aria-label={etiqueta}
      className="absolute inset-y-0 right-0 flex flex-col shadow-2xl panel-derecha overflow-hidden"
      style={{ width: w, background: 'var(--surface)' }}>
      {children}
    </div>
  )

  if (!desktop) {
    return <div className="fixed inset-0 z-50">{velo}{cajon('100%')}</div>
  }

  // `pointer-events-none` en la capa de fuera: hacer clic en el gris de los
  // bordes no cierra nada, porque ahí no hay nada.
  return (
    <div className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none">
      <div className="relative overflow-hidden rounded-2xl pointer-events-auto"
        style={{ width: 'min(1440px, 100%, calc((100vh - 2rem) * 16 / 9))', aspectRatio: '16 / 9' }}>
        {velo}
        {cajon(ancho)}
      </div>
    </div>
  )
}
