import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// ─── "¿Seguro?" — la pregunta antes de lo que no se deshace ─────────────────
//
// El panel tiene varias acciones de un solo clic que **no tienen vuelta atrás**:
// avanzar de etapa (no se puede retroceder), cambiar la cantidad de un producto,
// quitar un producto. Un dedo que resbala en el móvil del vendedor cuesta un
// pedido mal despachado.
//
// Va por `createPortal` al `body` y no donde se declara: se usa DENTRO del cajón
// del pedido, y un `fixed` dentro de un contenedor animado se ancla al
// contenedor, no a la pantalla.
//
// Es un diálogo y no un `window.confirm` porque el `confirm` del navegador no se
// puede leer en el móvil del vendedor —sale con el dominio y sin contexto— y
// bloquea el hilo mientras espera.

export default function Confirmar({ titulo, detalle, si = 'Sí', no = 'No', peligro = false, ocupado = false, onSi, onNo }: {
  titulo: string
  detalle?: string
  si?: string
  no?: string
  /** Pinta el "Sí" en rojo: lo que cierra o destruye algo. */
  peligro?: boolean
  ocupado?: boolean
  onSi: () => void
  onNo: () => void
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onNo() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onNo])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onNo}>
      <div role="alertdialog" aria-label={titulo} onClick={e => e.stopPropagation()}
        className="w-full max-w-[340px] rounded-3xl p-5 shadow-2xl panel-velo"
        style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
        <p className="font-black text-sm" style={{ color: 'var(--text)' }}>{titulo}</p>
        {detalle && (
          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{detalle}</p>
        )}
        <div className="flex gap-2 mt-4">
          {/* "No" primero y a la izquierda: es la salida, y la salida no se
              esconde detrás de la acción. */}
          <button type="button" onClick={onNo} disabled={ocupado}
            className="flex-1 py-2.5 rounded-2xl text-sm font-black disabled:opacity-50"
            style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
            {no}
          </button>
          <button type="button" onClick={onSi} disabled={ocupado} autoFocus
            className="flex-1 py-2.5 rounded-2xl text-sm font-black disabled:opacity-50"
            style={peligro
              ? { background: 'var(--danger-bg)', color: 'var(--danger-fg)' }
              : { background: 'var(--invert)', color: 'var(--invert-fg)' }}>
            {ocupado ? '…' : si}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
