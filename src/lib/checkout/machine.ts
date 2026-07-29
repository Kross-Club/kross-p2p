// ─── SALES ENGINE · Máquina de estados del Checkout ──────────────────────────
// Reducer puro, sin React. La UI lo consume; el Voice Closer lee este mismo
// estado para guiar por voz. Reemplaza a src/lib/checkout-flow.ts.
//
// Regla de oro: `advanceAmount`, `deliveryMethod`, `needsLocationConfirmation`,
// `courierSurcharge` y `deliveryNote` son DERIVADOS. Ninguna acción los setea
// directamente — se recalculan en `derive()` después de cada cambio.

import { ADVANCE_LIMA_PEN, ADVANCE_PROVINCIA_PEN } from './checkout.config'
import { methodForCoverage } from './services/DistrictCoverageService'
import type {
  AgencyName, CheckoutState, CheckoutStepId, DistrictCoverage,
  LimaAddress, LocationType, PackId, PaymentVerification, ProvinciaConfig,
} from './types'

/** uuid v4. `randomUUID` exige contexto seguro; el fallback cubre dev por http. */
function newOrderId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function initialCheckoutState(selectedPack: PackId | null = null): CheckoutState {
  return {
    orderId: newOrderId(),
    step: 1,
    selectedPack,
    customerInfo: { dni: '', whatsapp: '', receiverName: '' },
    locationType: null,
    limaAddress: null,
    provinciaConfig: null,
    needsLocationConfirmation: false,
    paymentVoucher: null,
    advanceAmount: 0,
    status: 'DRAFT',
    payment: { verification: 'NOT_REQUIRED', matchedAt: null, reason: null },
    courierSurcharge: null,
    deliveryNote: null,
  }
}

export type CheckoutAction =
  | { type: 'SET_PACK'; packId: PackId }
  | { type: 'SET_DNI'; dni: string }
  | { type: 'SET_WHATSAPP'; whatsapp: string }
  | { type: 'SET_RECEIVER_NAME'; receiverName: string }
  | { type: 'SET_LOCATION_TYPE'; locationType: LocationType }
  | { type: 'SET_LIMA_DISTRICT'; district: string }
  | { type: 'SET_LIMA_ADDRESS'; addressText?: string; reference?: string }
  | { type: 'SET_LIMA_PIN'; lat: number; lng: number; addressText?: string }
  | { type: 'SET_PROVINCIA_DISTRICT'; department: string; province: string; district: string }
  | { type: 'SET_PROVINCIA_PIN'; lat: number; lng: number }
  | { type: 'SET_COVERAGE'; check: DistrictCoverage }
  /** El comprador ignora el mapa o insiste en domicilio: manda su elección. */
  | { type: 'CHOOSE_AGENCY_BRANCH_FLOW' }
  | { type: 'RETRY_DOMICILIO' }
  | { type: 'SET_AGENCY'; agency: AgencyName }
  | { type: 'SET_AGENCY_BRANCH'; branchId: string }
  | { type: 'SET_OLVA_TEXT'; text: string }
  | { type: 'SET_PROVINCIA_ADDRESS'; addressText?: string; reference?: string }
  | { type: 'SET_VOUCHER'; url: string; uploadedAt: string }
  | { type: 'SET_VERIFICATION'; verification: PaymentVerification; reason?: string | null; matchedAt?: string | null }
  | { type: 'GOTO'; step: CheckoutStepId }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SUBMITTING' }
  | { type: 'SUBMITTED' }
  | { type: 'ERROR' }
  | { type: 'RESTORE'; state: CheckoutState }

const EMPTY_LIMA: LimaAddress = { district: null, lat: null, lng: null, addressText: '', reference: '' }
const EMPTY_PROVINCIA: ProvinciaConfig = {
  department: null, province: null, district: null, city: null,
  lat: null, lng: null, coverageResult: null, deliveryMethod: null,
  selectedAgency: null, selectedAgencyBranchId: null, olvaBranchText: null,
}

/**
 * Recalcula todo lo derivado. Se llama después de CADA acción, así que el estado
 * nunca puede quedar internamente inconsistente.
 */
function derive(s: CheckoutState): CheckoutState {
  const isProvincia = s.locationType === 'PROVINCIA'
  const advanceAmount = isProvincia ? ADVANCE_PROVINCIA_PEN : ADVANCE_LIMA_PEN

  // El pedido se cierra SIN coordenada: la cobertura se decide por distrito. La
  // marca queda para que Logística afine la dirección después (AddressBar en el
  // chat del pedido), no para bloquear la venta.
  const needsLocationConfirmation =
    isProvincia ? s.provinciaConfig?.deliveryMethod === 'DOMICILIO' && s.provinciaConfig?.lat == null
      : s.locationType === 'LIMA' ? s.limaAddress?.lat == null
        : false

  // El adelanto solo entra a verificación si realmente hay algo que verificar.
  const verification: PaymentVerification =
    advanceAmount === 0 ? 'NOT_REQUIRED'
      : s.payment.verification === 'NOT_REQUIRED' ? 'PENDING'
        : s.payment.verification

  return { ...s, advanceAmount, needsLocationConfirmation, payment: { ...s.payment, verification } }
}

export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  const lima = () => state.limaAddress ?? EMPTY_LIMA
  const prov = () => state.provinciaConfig ?? EMPTY_PROVINCIA

  switch (action.type) {
    case 'RESTORE':
      return derive(action.state)

    case 'SET_PACK':
      return derive({ ...state, selectedPack: action.packId })

    case 'SET_DNI':
      return derive({ ...state, customerInfo: { ...state.customerInfo, dni: action.dni.replace(/\D/g, '') } })

    case 'SET_WHATSAPP':
      return derive({ ...state, customerInfo: { ...state.customerInfo, whatsapp: action.whatsapp.replace(/\D/g, '') } })

    case 'SET_RECEIVER_NAME':
      return derive({ ...state, customerInfo: { ...state.customerInfo, receiverName: action.receiverName } })

    case 'SET_LOCATION_TYPE': {
      if (state.locationType === action.locationType) return state
      // Cambiar de región invalida lo capturado de la otra: no se arrastra un
      // distrito de Lima a un pedido de provincia.
      return derive({
        ...state,
        locationType: action.locationType,
        limaAddress: action.locationType === 'LIMA' ? { ...EMPTY_LIMA } : null,
        provinciaConfig: action.locationType === 'PROVINCIA' ? { ...EMPTY_PROVINCIA } : null,
        courierSurcharge: null,
        deliveryNote: null,
      })
    }

    case 'SET_LIMA_DISTRICT':
      return derive({ ...state, limaAddress: { ...lima(), district: action.district } })

    case 'SET_LIMA_ADDRESS':
      return derive({ ...state, limaAddress: {
        ...lima(),
        addressText: action.addressText ?? lima().addressText,
        reference: action.reference ?? lima().reference,
      } })

    case 'SET_LIMA_PIN':
      return derive({ ...state, limaAddress: {
        ...lima(),
        lat: action.lat,
        lng: action.lng,
        // El reverse geocoding NO pisa lo que el comprador ya escribió.
        addressText: lima().addressText || action.addressText || '',
      } })

    case 'SET_PROVINCIA_DISTRICT': {
      const p = prov()
      if (p.district === action.district && p.province === action.province && p.department === action.department) return state
      // Otro distrito → el veredicto anterior ya no aplica.
      return derive({
        ...state,
        provinciaConfig: {
          ...p,
          department: action.department,
          province: action.province,
          district: action.district,
          city: null,
          lat: null, lng: null,
          coverageResult: 'NOT_CHECKED',
          deliveryMethod: null,
        },
        courierSurcharge: null,
        deliveryNote: null,
      })
    }

    case 'SET_PROVINCIA_PIN':
      return derive({ ...state, provinciaConfig: { ...prov(), lat: action.lat, lng: action.lng } })

    case 'SET_COVERAGE': {
      const { check } = action
      // El aviso operativo SÍ se le muestra al comprador: prometer 48h donde el
      // courier pasa una vez por semana es el reclamo que queremos evitar.
      const note = check.weekly
        ? 'En tu zona el courier pasa una vez por semana.'
        : check.weekdaysOnly ? 'En tu zona se entrega solo de lunes a viernes.' : null

      return derive({
        ...state,
        provinciaConfig: {
          ...prov(),
          city: check.city,
          coverageResult: check.result,
          deliveryMethod: methodForCoverage(check.result),
        },
        // Tarifa del courier: costo de la marca, jamás se le traslada al comprador.
        courierSurcharge: check.tariff,
        deliveryNote: note,
      })
    }

    // El comprador no coloca el pin o el mapa falla: nunca se le bloquea, va a
    // agencia con copy neutro y el pedido se cierra igual.
    case 'CHOOSE_AGENCY_BRANCH_FLOW':
      return derive({ ...state, provinciaConfig: { ...prov(), deliveryMethod: 'AGENCIA' } })

    case 'RETRY_DOMICILIO':
      return derive({ ...state, provinciaConfig: { ...prov(), deliveryMethod: null, coverageResult: 'NOT_CHECKED' } })

    case 'SET_AGENCY':
      return derive({ ...state, provinciaConfig: {
        ...prov(),
        selectedAgency: action.agency,
        // Cambiar de agencia limpia la selección de la anterior.
        selectedAgencyBranchId: null,
        olvaBranchText: null,
      } })

    case 'SET_AGENCY_BRANCH':
      return derive({ ...state, provinciaConfig: { ...prov(), selectedAgencyBranchId: action.branchId } })

    case 'SET_OLVA_TEXT':
      return derive({ ...state, provinciaConfig: { ...prov(), olvaBranchText: action.text } })

    case 'SET_PROVINCIA_ADDRESS':
      return derive({ ...state, provinciaConfig: { ...prov(), address: {
        addressText: action.addressText ?? prov().address?.addressText ?? '',
        reference: action.reference ?? prov().address?.reference ?? '',
      } } })

    case 'SET_VOUCHER':
      return derive({ ...state, paymentVoucher: { url: action.url, uploadedAt: action.uploadedAt } })

    case 'SET_VERIFICATION':
      return derive({ ...state, payment: {
        verification: action.verification,
        reason: action.reason ?? null,
        matchedAt: action.matchedAt ?? state.payment.matchedAt,
      } })

    case 'GOTO':
      return { ...state, step: action.step }

    case 'NEXT':
      return { ...state, step: Math.min(3, state.step + 1) as CheckoutStepId }

    case 'BACK':
      // "Atrás" conserva todo lo ingresado: solo mueve el paso.
      return { ...state, step: Math.max(1, state.step - 1) as CheckoutStepId }

    case 'SUBMITTING':
      return { ...state, status: 'SUBMITTING' }

    case 'SUBMITTED':
      return { ...state, status: 'SUBMITTED' }

    case 'ERROR':
      // El error NO borra la data ni el voucher ya subido: se puede reintentar.
      return { ...state, status: 'ERROR' }

    default:
      return state
  }
}
