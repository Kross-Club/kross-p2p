// ─── SALES ENGINE · Modal del Checkout ───────────────────────────────────────
// Contenedor de los 3 pasos. En móvil es un bottom-sheet a pantalla casi
// completa; en desktop, un contenedor centrado de ancho legible — el flujo
// entero tiene que poder ejecutarse con mouse y teclado para grabar tutoriales.
//
// Accesibilidad: role="dialog", trap de foco, Esc cierra (pidiendo confirmación
// si hay data ingresada) y el CTA es sticky dentro del safe area de iOS.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useCheckout } from '../../lib/checkout/useCheckout'
import type { CheckoutState } from '../../lib/checkout/types'
import Step1Pack from './steps/Step1Pack'
import type { PackOption } from './steps/Step1Pack'
import Step2Delivery from './steps/Step2Delivery'

const STEP_LABEL = ['Tu pack', 'Tus datos', 'Confirmar'] as const
const TOTAL_STEPS = 3

interface CheckoutModalProps {
  packs: PackOption[]
  unitPrice: number
  bestPackId: string | null
  initialPack: string | null
  onClose: () => void
  onPartialLead?: (state: CheckoutState) => void
}

export default function CheckoutModal({
  packs, unitPrice, bestPackId, initialPack, onClose, onPartialLead,
}: CheckoutModalProps) {
  const co = useCheckout({ initialPack, onPartialLead })
  const { state, dispatch, errors, touch } = co
  const [confirmingClose, setConfirmingClose] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  const requestClose = useCallback(() => {
    // Con data ingresada se pide confirmación: cerrar por error tras llenar
    // cuatro campos es perder la venta. Nada de confirm() nativo.
    if (co.isDirty && !confirmingClose) { setConfirmingClose(true); return }
    co.abandon()
    onClose()
  }, [co, confirmingClose, onClose])

  // El handler vive en un ref para que el efecto de abajo se monte UNA sola vez.
  // Si dependiera de `requestClose` —que cambia de identidad en cada render— su
  // cleanup correría en cada render y `restoreFocus` le robaría el foco al campo
  // que el comprador está escribiendo. Pasó: el paso 2 era imposible de llenar.
  const closeRef = useRef(requestClose)
  useEffect(() => { closeRef.current = requestClose }, [requestClose])

  // ─── Trap de foco + Esc ────────────────────────────────────────────────────
  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return }
      if (e.key !== 'Tab') return

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      restoreFocus.current?.focus?.()
    }
    // Sin dependencias a propósito: el modal monta y desmonta una vez.
  }, [])

  const stepIdx = state.step - 1

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={requestClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Completa tu pedido"
        className="fixed z-50 bg-white flex flex-col
          inset-x-0 bottom-0 rounded-t-3xl max-h-[95dvh]
          sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[90dvh] sm:w-[min(480px,calc(100%-2rem))] sm:rounded-3xl"
      >
        {/* ── Cabecera: progreso siempre visible ── */}
        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <div className="flex justify-center sm:hidden mb-2">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          <button
            onClick={requestClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center
              focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            <X size={16} className="text-gray-500" />
          </button>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ background: i <= stepIdx ? '#16A34A' : '#E5E7EB' }}
              />
            ))}
          </div>
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mt-1.5">
            Paso {state.step} de {TOTAL_STEPS} · {STEP_LABEL[stepIdx]}
          </p>
        </div>

        {/* ── Contenido del paso ── */}
        <div className="px-5 pb-4 overflow-y-auto flex-1">
          {state.step === 1 && (
            <Step1Pack
              packs={packs}
              unitPrice={unitPrice}
              selected={state.selectedPack}
              bestPackId={bestPackId}
              onSelect={packId => dispatch({ type: 'SET_PACK', packId })}
            />
          )}

          {state.step === 2 && (
            <Step2Delivery state={state} dispatch={dispatch} errors={errors} touch={touch} />
          )}

          {state.step === 3 && (
            <div className="py-8 text-center">
              <p className="text-sm font-black text-gray-800">Resumen y pago</p>
              <p className="text-xs text-gray-400 mt-1">En construcción (Fase 3).</p>
            </div>
          )}
        </div>

        {/* ── CTA sticky, dentro del safe area de iOS ── */}
        <div
          className="px-5 pt-3 border-t border-gray-100 flex-shrink-0 bg-white sm:rounded-b-3xl"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {confirmingClose ? (
            <ConfirmClose onCancel={() => setConfirmingClose(false)} onConfirm={() => { co.abandon(); onClose() }} />
          ) : (
            <div className="flex items-center gap-2">
              {state.step > 1 && (
                <button
                  onClick={co.back}
                  className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                >
                  <ArrowLeft size={16} /> Atrás
                </button>
              )}
              <button
                onClick={co.next}
                aria-disabled={!co.canAdvance}
                className={`flex-1 font-black py-4 rounded-2xl text-base shadow-lg transition-transform active:scale-95
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500
                  ${co.canAdvance ? 'bg-green-500 text-white shadow-green-200' : 'bg-green-300 text-white cursor-not-allowed'}`}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Un botón gris sin explicación se lee como un error. */}
          {!confirmingClose && !co.canAdvance && state.step === 2 && (
            <p className="text-[11px] text-gray-400 text-center mt-2">
              Completa los datos marcados para continuar
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function ConfirmClose({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="pb-1">
      <p className="text-sm font-black text-gray-800 mb-0.5">¿Salir sin terminar?</p>
      <p className="text-xs text-gray-500 mb-3">Guardamos tu avance por 24 horas.</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm
            focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          Salir
        </button>
        <button
          onClick={onCancel}
          autoFocus
          className="flex-1 py-3 rounded-2xl bg-green-500 text-white font-black text-sm
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
        >
          Seguir comprando
        </button>
      </div>
    </div>
  )
}
