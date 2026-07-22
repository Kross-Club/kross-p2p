// ─── SALES ENGINE · Máquina de estados del Checkout Guiado (tipo Quiz) ───────────
// Lógica pura (sin React) del popup paso-a-paso con bifurcación Lima/Provincia y
// cierre de pago anticipado. La UI la consume; el Voice Closer (useVoiceCloser) lee
// este mismo estado para guiar por voz. Ver docs/01-SALES-ENGINE.md.

import type { PaymentMethod, DispatchType, AgencyName } from './session'

// Pasos del flujo. 'pago_adelanto' solo aplica a provincia (o pago anticipado).
export type CheckoutStep = 'contacto' | 'entrega' | 'pago_adelanto' | 'confirmado'

export type DeliveryType = DispatchType // 'MOTORIZADO_LIMA' | 'AGENCIA_PROVINCIA'

// Estado del pago del adelanto (provincia). COD Lima no pasa por aquí.
export type PaymentStatus =
  | 'NO_REQUERIDO'                 // Lima COD → no hay adelanto
  | 'PENDIENTE'                    // se pide adelanto, aún no paga
  | 'AWAITING_ADVANCE_VERIFICATION' // subió comprobante / nro operación, falta verificar
  | 'VERIFICADO'

// Respuestas capturadas por el "quiz" del checkout.
export interface QuizAnswers {
  packIdx: number
  documentNumber: string
  resolvedName: string | null       // nombre validado por RENIEC (Decolecta)
  whatsapp: string
  // Entrega
  deliveryType: DeliveryType | null
  lat: number | null
  lng: number | null
  addressText: string | null
  reference: string | null
  agencyName: AgencyName | null     // solo provincia
  // Pago
  paymentMethod: PaymentMethod
  advanceProofUrl: string | null    // comprobante Yape/Plin subido
  advanceOpNumber: string | null    // número de operación
}

export interface CheckoutState {
  step: CheckoutStep
  answers: QuizAnswers
  paymentStatus: PaymentStatus
  submitting: boolean
}

// Monto de adelanto por defecto para provincia (flete). Configurable por marca luego.
export const DEFAULT_ADVANCE_PEN = 20

export const initialCheckoutState = (packIdx = 0): CheckoutState => ({
  step: 'contacto',
  submitting: false,
  paymentStatus: 'NO_REQUERIDO',
  answers: {
    packIdx,
    documentNumber: '',
    resolvedName: null,
    whatsapp: '',
    deliveryType: null,
    lat: null, lng: null, addressText: null, reference: null,
    agencyName: null,
    paymentMethod: 'CONTRAENTREGA',
    advanceProofUrl: null,
    advanceOpNumber: null,
  },
})

// ─── Acciones ────────────────────────────────────────────────────────────────
export type CheckoutAction =
  | { type: 'SET_PACK'; packIdx: number }
  | { type: 'SET_DNI'; documentNumber: string; resolvedName?: string | null }
  | { type: 'SET_WHATSAPP'; whatsapp: string }
  | { type: 'SET_DELIVERY_TYPE'; deliveryType: DeliveryType }
  | { type: 'SET_PIN'; lat: number; lng: number; addressText?: string | null }
  | { type: 'SET_REFERENCE'; reference: string }
  | { type: 'SET_AGENCY'; agencyName: AgencyName }
  | { type: 'SET_PAYMENT_METHOD'; paymentMethod: PaymentMethod }
  | { type: 'SET_ADVANCE_PROOF'; url?: string | null; opNumber?: string | null }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SUBMITTING'; value: boolean }
  | { type: 'CONFIRMED' }

// Provincia (o pago anticipado) requiere el paso de adelanto.
export function requiresAdvance(a: QuizAnswers): boolean {
  return a.deliveryType === 'AGENCIA_PROVINCIA' || a.paymentMethod === 'YAPE_PLIN'
}

// Orden de pasos según la bifurcación.
export function stepsFor(a: QuizAnswers): CheckoutStep[] {
  return requiresAdvance(a)
    ? ['contacto', 'entrega', 'pago_adelanto', 'confirmado']
    : ['contacto', 'entrega', 'confirmado']
}

// ¿Se puede avanzar del paso actual? (validaciones mínimas de MVP)
export function canAdvance(s: CheckoutState): boolean {
  const a = s.answers
  switch (s.step) {
    case 'contacto':
      return a.documentNumber.replace(/\D/g, '').length === 8 && !!a.resolvedName && a.whatsapp.replace(/\D/g, '').length >= 9
    case 'entrega':
      if (!a.deliveryType) return false
      if (a.deliveryType === 'AGENCIA_PROVINCIA') return !!a.agencyName
      return a.lat != null && a.lng != null // Lima: pin fijado
    case 'pago_adelanto':
      return !!a.advanceProofUrl || !!a.advanceOpNumber
    default:
      return true
  }
}

// Reducer puro del flujo.
export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  const set = (patch: Partial<QuizAnswers>): CheckoutState => ({ ...state, answers: { ...state.answers, ...patch } })

  switch (action.type) {
    case 'SET_PACK': return set({ packIdx: action.packIdx })
    case 'SET_DNI': return set({ documentNumber: action.documentNumber, resolvedName: action.resolvedName ?? state.answers.resolvedName })
    case 'SET_WHATSAPP': return set({ whatsapp: action.whatsapp })
    case 'SET_DELIVERY_TYPE': {
      const isProv = action.deliveryType === 'AGENCIA_PROVINCIA'
      return {
        ...state,
        answers: {
          ...state.answers,
          deliveryType: action.deliveryType,
          // Provincia: adelanto por Yape; Lima: COD por defecto
          paymentMethod: isProv ? 'YAPE_PLIN' : 'CONTRAENTREGA',
          agencyName: isProv ? state.answers.agencyName : null,
        },
        paymentStatus: isProv ? 'PENDIENTE' : 'NO_REQUERIDO',
      }
    }
    case 'SET_PIN': return set({ lat: action.lat, lng: action.lng, addressText: action.addressText ?? state.answers.addressText })
    case 'SET_REFERENCE': return set({ reference: action.reference })
    case 'SET_AGENCY': return set({ agencyName: action.agencyName })
    case 'SET_PAYMENT_METHOD': {
      const advance = action.paymentMethod === 'YAPE_PLIN' || state.answers.deliveryType === 'AGENCIA_PROVINCIA'
      return { ...set({ paymentMethod: action.paymentMethod }), paymentStatus: advance ? 'PENDIENTE' : 'NO_REQUERIDO' }
    }
    case 'SET_ADVANCE_PROOF':
      return {
        ...set({ advanceProofUrl: action.url ?? state.answers.advanceProofUrl, advanceOpNumber: action.opNumber ?? state.answers.advanceOpNumber }),
        paymentStatus: 'AWAITING_ADVANCE_VERIFICATION',
      }
    case 'NEXT': {
      if (!canAdvance(state)) return state
      const flow = stepsFor(state.answers)
      const i = flow.indexOf(state.step)
      return { ...state, step: flow[Math.min(i + 1, flow.length - 1)] }
    }
    case 'BACK': {
      const flow = stepsFor(state.answers)
      const i = flow.indexOf(state.step)
      return { ...state, step: flow[Math.max(i - 1, 0)] }
    }
    case 'SUBMITTING': return { ...state, submitting: action.value }
    case 'CONFIRMED': return { ...state, step: 'confirmado', submitting: false }
    default: return state
  }
}
