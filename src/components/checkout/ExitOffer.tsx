// ─── SALES ENGINE · Exit-intent centrado ─────────────────────────────────────
// El comprador toca la X (o Esc en desktop) con datos ya ingresados. Es el
// último momento para retenerlo, así que NO se resuelve reemplazando el pie del
// modal —ahí compite con el CTA y se lee como una nota— sino con un diálogo
// propio al centro de la pantalla: nada más que decidir en ese instante.
//
// Dos variantes:
//   offer → la oferta única de S/EXIT_DISCOUNT_PEN, con el monto como héroe.
//   plain → la confirmación seca, cuando ya se le ofreció el descuento antes.
//
// Accesibilidad: role="alertdialog", foco en la acción que retiene, trap de Tab
// propio y Esc = quedarse (nunca perder la venta por una tecla).

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { COPY, EXIT_DISCOUNT_PEN } from '../../lib/checkout/checkout.config'

interface ExitOfferProps {
  /** ¿Toca ofrecer el descuento, o solo confirmar la salida? */
  offerDiscount: boolean
  onApplyDiscount: () => void
  /** Quedarse en el checkout. Es la acción por defecto y la del Esc. */
  onCancel: () => void
  /** Salir de verdad. */
  onConfirm: () => void
}

export default function ExitOffer({ offerDiscount, onApplyDiscount, onCancel, onConfirm }: ExitOfferProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  // El foco entra al diálogo, no se queda detrás en el checkout tapado.
  useEffect(() => { primaryRef.current?.focus() }, [])

  // Trap propio. `stopPropagation` evita que el trap del modal de abajo —que
  // recorre TODOS sus controles, incluidos los que este diálogo tapa— mueva el
  // foco a algo que el comprador no ve.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const focusables = boxRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
    if (!focusables?.length) return
    e.stopPropagation()
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    // z-60: por encima del panel del checkout (z-50), que queda visible y
    // oscurecido detrás — recordarle que su pedido sigue ahí retiene más que
    // taparlo por completo.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />

      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="exit-offer-title"
        className="relative w-full max-w-[340px] bg-white rounded-3xl px-6 pt-7 pb-6 text-center shadow-2xl"
      >
        <button
          type="button"
          onClick={onConfirm}
          aria-label={COPY.exitConfirmLeave}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-gray-300
            hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          <X size={16} />
        </button>

        {offerDiscount ? (
          <>
            <span
              className="inline-block text-[9px] font-black tracking-widest px-2.5 py-1 rounded-full text-white mb-3"
              style={{ background: '#DC2626' }}
            >
              {COPY.exitBadge}
            </span>

            <p id="exit-offer-title" className="text-lg font-black text-gray-900 leading-tight mb-3">
              {COPY.exitTitle}
            </p>

            {/* El monto es el héroe: es lo único que tiene que entenderse de un
                vistazo antes de que el dedo siga camino a cerrar. */}
            <p className="text-5xl font-black leading-none" style={{ color: '#16A34A' }}>
              S/{EXIT_DISCOUNT_PEN}
            </p>
            <p className="text-[11px] font-bold text-gray-500 mt-1.5 mb-4">{COPY.exitAmountLabel}</p>

            <p className="text-xs text-gray-500 mb-5">{COPY.exitBody}</p>

            <button
              ref={primaryRef}
              type="button"
              onClick={onApplyDiscount}
              className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-base shadow-lg shadow-green-200
                active:scale-95 transition-transform
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
            >
              {COPY.exitApply}
            </button>

            {/* Salir queda disponible pero sin peso visual: no se le esconde la
                salida, solo se deja de competir con la acción que conviene. */}
            <button
              type="button"
              onClick={onConfirm}
              className="mt-3 text-[11px] font-bold text-gray-400 underline
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded"
            >
              {COPY.exitLeave}
            </button>
          </>
        ) : (
          <>
            <p id="exit-offer-title" className="text-lg font-black text-gray-900 leading-tight mb-2">
              {COPY.exitConfirmTitle}
            </p>
            <p className="text-xs text-gray-500 mb-5">{COPY.exitConfirmBody}</p>

            <button
              ref={primaryRef}
              type="button"
              onClick={onCancel}
              className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-base shadow-lg shadow-green-200
                active:scale-95 transition-transform
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
            >
              {COPY.exitConfirmStay}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="mt-3 text-[11px] font-bold text-gray-400 underline
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded"
            >
              {COPY.exitConfirmLeave}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
