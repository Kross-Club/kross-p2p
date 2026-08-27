import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useIsDesktop } from '../lib/use-desktop'

// ─── Una ventana en el centro ────────────────────────────────────────────────
//
// Hermana de `PanelDerecha`, y la diferencia es de intención, no de estilo:
//
//   · el cajón de la derecha es para TRABAJAR sobre algo — se queda, se escribe,
//     la lista sigue detrás;
//   · esta ventana es para MIRAR algo un momento y cerrarlo — un pedido viejo
//     del mismo cliente, para acordarse de qué pasó.
//
// Por eso va centrada y no pegada al borde: no continúa el trabajo de atrás, lo
// interrumpe a propósito.
//
// Como el cajón, va por `createPortal` al `body`: se abre desde dentro de otro
// panel, y un `fixed` dentro de un contenedor animado se ancla al contenedor.

export default function PanelCentro({ titulo, detalle, capa = 3, onCerrar, children }: {
  titulo: string
  detalle?: string
  /** Se apila sobre los cajones (1 y 2). Ver PanelDerecha. */
  capa?: 3
  onCerrar: () => void
  children: ReactNode
}) {
  const desktop = useIsDesktop()

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6 panel-velo"
      style={{ zIndex: 50 + capa * 5, background: 'rgba(0,0,0,0.6)' }}
      onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={e => e.stopPropagation()}
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl panel-centro"
        style={{
          background: 'var(--chat-bg)',
          border: '0.5px solid var(--border)',
          width: desktop ? 'min(1040px, 100%)' : '100%',
          height: desktop ? 'min(84vh, 700px)' : '92vh',
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '0.5px solid var(--border)' }}>
          <div className="min-w-0">
            <p className="text-sm font-black truncate" style={{ color: 'var(--text)' }}>{titulo}</p>
            {detalle && <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{detalle}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-faint)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
