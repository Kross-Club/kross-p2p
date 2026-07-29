// ─── SALES ENGINE · Hook del Checkout ────────────────────────────────────────
// Cose la máquina de estados con la persistencia, la validación al blur y la
// instrumentación. Es lo único que los componentes necesitan conocer: ningún
// paso habla directo con localStorage ni con trackEvent.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { checkoutReducer, initialCheckoutState } from './machine'
import type { CheckoutAction } from './machine'
import { clearDraft, loadActiveDraft, purgeExpiredDrafts, saveDraft } from './persistence'
import { canAdvance, isWhatsappComplete, validateStep } from './validation'
import type { FieldErrors, FieldName } from './validation'
import { createStepTimer, trackEvent } from './analytics'
import type { CheckoutState, CheckoutStepId, PackId } from './types'

export interface UseCheckoutOptions {
  initialPack: PackId | null
  /** Guarda el lead parcial apenas el WhatsApp es válido. Se inyecta desde la
   *  landing para no acoplar el hook a Supabase. */
  onPartialLead?: (state: CheckoutState) => void
}

export interface UseCheckout {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  /** Errores del paso actual, filtrados por los campos ya tocados. */
  errors: FieldErrors
  /** Errores de TODOS los campos del paso, tocados o no. Para el submit. */
  allErrors: FieldErrors
  touch: (field: FieldName) => void
  canAdvance: boolean
  next: () => void
  back: () => void
  goTo: (step: CheckoutStepId) => void
  /** ¿Hay data ingresada? Decide si cerrar pide confirmación. */
  isDirty: boolean
  abandon: () => void
}

/** ¿El comprador avanzó algo? Decide si vale la pena guardar el borrador y si
 *  cerrar debe pedir confirmación. */
export function hasProgress(state: CheckoutState): boolean {
  const { whatsapp, dni, receiverName } = state.customerInfo
  return Boolean(whatsapp || dni || receiverName || state.locationType || state.step > 1)
}

export function useCheckout({ initialPack, onPartialLead }: UseCheckoutOptions): UseCheckout {
  const [state, dispatch] = useReducer(checkoutReducer, null, () => initialCheckoutState(initialPack))
  const [touched, setTouched] = useState<Set<FieldName>>(new Set())
  const timer = useRef(createStepTimer())

  // ─── Retomar el borrador ───────────────────────────────────────────────────
  // Si vuelve del anuncio o recarga, retoma en el mismo paso con la data intacta.
  useEffect(() => {
    purgeExpiredDrafts()
    const draft = loadActiveDraft()
    if (draft) dispatch({ type: 'RESTORE', state: draft })
    trackEvent({ name: 'checkout_opened' })
    // Solo al montar: retomar un borrador después sería pisar lo que escribe.
  }, [])

  // ─── Persistir ─────────────────────────────────────────────────────────────
  // Solo cuando hay algo que guardar. Persistir el estado inicial vacío en el
  // montaje movía el puntero del borrador activo al pedido nuevo y recién vacío,
  // y la recarga retomaba en el paso 1 con todo perdido. Además evita crear un
  // borrador por cada vez que alguien abre el modal y no escribe nada.
  useEffect(() => {
    if (hasProgress(state)) saveDraft(state)
  }, [state])

  // ─── Instrumentar el paso ──────────────────────────────────────────────────
  useEffect(() => { timer.current.enter(state.step) }, [state.step])

  // ─── Lead parcial ──────────────────────────────────────────────────────────
  // Apenas el WhatsApp es válido se guarda el lead, aunque el comprador abandone.
  // Es lo que permite recuperar abandonos; se dispara UNA vez por número.
  const leadSentFor = useRef<string | null>(null)
  useEffect(() => {
    const phone = state.customerInfo.whatsapp
    if (!isWhatsappComplete(phone) || leadSentFor.current === phone) return
    leadSentFor.current = phone
    onPartialLead?.(state)
    // `state` completo dispararía en cada tecla; la llave real es el teléfono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.customerInfo.whatsapp])

  const allErrors = useMemo(() => validateStep(state), [state])

  // Solo se le muestran los errores de lo que ya tocó: marcar en rojo un campo
  // que todavía no llenó es castigarlo por no haber llegado ahí.
  const errors = useMemo(() => {
    const visible: FieldErrors = {}
    for (const [field, message] of Object.entries(allErrors) as [FieldName, string][]) {
      if (touched.has(field)) visible[field] = message
    }
    return visible
  }, [allErrors, touched])

  const touch = useCallback((field: FieldName) => {
    setTouched(prev => {
      if (prev.has(field)) return prev
      return new Set(prev).add(field)
    })
  }, [])

  // Al tocar un campo con error se registra: dice qué campo rompe el funnel.
  const reportedErrors = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const field of Object.keys(errors)) {
      if (reportedErrors.current.has(field)) continue
      reportedErrors.current.add(field)
      trackEvent({ name: 'field_error', field })
    }
  }, [errors])

  const ready = canAdvance(state)

  const next = useCallback(() => {
    if (!canAdvance(state)) {
      // El CTA está deshabilitado, pero si se llega aquí se destapan los errores
      // en vez de no hacer nada: un botón muerto se lee como un bug.
      setTouched(new Set(Object.keys(validateStep(state)) as FieldName[]))
      return
    }
    timer.current.complete()
    dispatch({ type: 'NEXT' })
  }, [state])

  const back = useCallback(() => dispatch({ type: 'BACK' }), [])
  const goTo = useCallback((step: CheckoutStepId) => dispatch({ type: 'GOTO', step }), [])

  const isDirty = useMemo(() => hasProgress(state), [state])

  const abandon = useCallback(() => {
    trackEvent({ name: 'checkout_abandoned', lastStep: state.step })
  }, [state.step])

  // Objeto memoizado: si cambiara de identidad en cada render, cualquier efecto
  // que dependa de él se re-ejecutaría sin motivo aguas abajo.
  return useMemo(
    () => ({ state, dispatch, errors, allErrors, touch, canAdvance: ready, next, back, goTo, isDirty, abandon }),
    [state, errors, allErrors, touch, ready, next, back, goTo, isDirty, abandon],
  )
}

/** Limpia el borrador tras un pedido confirmado. */
export { clearDraft }
