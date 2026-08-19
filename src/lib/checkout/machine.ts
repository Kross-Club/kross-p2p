// ─── SALES ENGINE · Máquina de estados del Checkout ──────────────────────────
// Reducer puro, sin React. La UI lo consume; el Voice Closer lee este mismo
// estado para guiar por voz. Reemplaza a src/lib/checkout-flow.ts.
//
// Regla de oro: `advanceAmount`, `deliveryMethod`, `needsLocationConfirmation`,
// `courierSurcharge` y `deliveryNote` son DERIVADOS. Ninguna acción los setea
// directamente — se recalculan en `derive()` después de cada cambio.

import { EXIT_DISCOUNT_PEN, YAPE_CODE_LENGTH, advanceFor } from './checkout.config'
import { isLimaMetro, methodForCoverage } from './services/DistrictCoverageService'
import type {
  AgencyName, CheckoutState, CheckoutStepId, CheckoutVariant, DistrictCoverage,
  LimaAddress, LocationType, PackId, PaymentVerification, PickupPoint, ProvinciaConfig,
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

export function initialCheckoutState(
  selectedPack: PackId | null = null,
  variant: CheckoutVariant = 'A',
  homeDeliveryEnabled = true,
): CheckoutState {
  return {
    orderId: newOrderId(),
    step: 1,
    selectedPack,
    variant,
    homeDeliveryEnabled,
    customerInfo: { dni: '', whatsapp: '', receiverName: '' },
    locationType: null,
    limaAddress: null,
    provinciaConfig: null,
    deliveryMethod: null,
    pickup: { ...EMPTY_PICKUP },
    needsLocationConfirmation: false,
    paymentVoucher: null,
    advanceYapeCode: '',
    advanceAmount: 0,
    discountPen: 0,
    exitOfferShown: false,
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
  /**
   * El distrito, y con él la región. Reemplaza a `SET_LOCATION_TYPE` +
   * `SET_LIMA_DISTRICT` + `SET_PROVINCIA_DISTRICT`: el comprador elige UNA vez
   * de entre los 483 distritos del país y `isLimaMetro()` decide la rama.
   */
  | { type: 'SET_DISTRICT'; department: string; province: string; district: string }
  | { type: 'SET_LIMA_ADDRESS'; addressText?: string; reference?: string }
  | { type: 'SET_LIMA_PIN'; lat: number; lng: number; addressText?: string }
  | { type: 'SET_PROVINCIA_PIN'; lat: number; lng: number }
  | { type: 'SET_COVERAGE'; check: DistrictCoverage }
  /** El comprador ignora el mapa o insiste en domicilio: manda su elección. */
  | { type: 'CHOOSE_AGENCY_BRANCH_FLOW' }
  | { type: 'RETRY_DOMICILIO' }
  | { type: 'SET_AGENCY'; agency: AgencyName }
  | { type: 'SET_AGENCY_BRANCH'; branchId: string }
  | { type: 'SET_PICKUP_POINT'; agency: AgencyName; branchId: string }
  | { type: 'CLEAR_PICKUP_POINT' }
  | { type: 'SET_OLVA_TEXT'; text: string }
  | { type: 'SET_PROVINCIA_ADDRESS'; addressText?: string; reference?: string }
  | { type: 'SET_DELIVERY_METHOD'; method: 'DOMICILIO' | 'AGENCIA' }
  | { type: 'SET_VOUCHER'; url: string; uploadedAt: string }
  | { type: 'SET_YAPE_CODE'; code: string }
  | { type: 'SET_VERIFICATION'; verification: PaymentVerification; reason?: string | null; matchedAt?: string | null }
  /** El comprador intentó salir: se le ofreció el descuento (una sola vez). */
  | { type: 'EXIT_OFFER_SHOWN' }
  | { type: 'APPLY_EXIT_DISCOUNT' }
  | { type: 'GOTO'; step: CheckoutStepId }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SUBMITTING' }
  | { type: 'SUBMITTED' }
  | { type: 'ERROR' }
  | { type: 'RESTORE'; state: CheckoutState }

const EMPTY_LIMA: LimaAddress = {
  department: null, province: null, district: null,
  lat: null, lng: null, addressText: '', reference: '',
}
const EMPTY_PROVINCIA: ProvinciaConfig = {
  department: null, province: null, district: null, city: null, eta: null,
  lat: null, lng: null, coverageResult: null,
}
const EMPTY_PICKUP: PickupPoint = { agency: null, branchId: null, freeText: null }

/**
 * Recalcula todo lo derivado. Se llama después de CADA acción, así que el estado
 * nunca puede quedar internamente inconsistente.
 */
function derive(state: CheckoutState): CheckoutState {
  // Una marca sin entrega a domicilio no puede quedar con `DOMICILIO`, venga de
  // donde venga. Se normaliza AQUÍ y no solo en las acciones porque `RESTORE`
  // entra por la puerta de atrás: un borrador guardado cuando la marca sí
  // repartía conservaba el método y cerraba el pedido prometiendo una entrega a
  // la puerta que el admin ya había apagado.
  const s: CheckoutState = !state.homeDeliveryEnabled && state.deliveryMethod === 'DOMICILIO'
    ? { ...state, deliveryMethod: 'AGENCIA' }
    : state

  const isProvincia = s.locationType === 'PROVINCIA'
  // El adelanto sale del destino Y de la agencia: Olva cobra más flete que
  // Shalom. A domicilio (sin agencia) va el base.
  const advanceAmount = advanceFor(isProvincia, s.pickup.agency, s.deliveryMethod)

  // El pedido se cierra SIN coordenada: la cobertura se decide por distrito. La
  // marca queda para que Logística afine la dirección después (AddressBar en el
  // chat del pedido), no para bloquear la venta.
  // Recoger en agencia no tiene puerta que ubicar, en ninguna de las dos
  // regiones: solo el domicilio deja una coordenada pendiente.
  const needsLocationConfirmation =
    s.deliveryMethod === 'AGENCIA' ? false
      : isProvincia ? s.deliveryMethod === 'DOMICILIO' && s.provinciaConfig?.lat == null
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

    // El distrito determina la región: `isLimaMetro()` ya sabía la respuesta que
    // antes se le preguntaba al comprador con el toggle Lima/Provincia.
    case 'SET_DISTRICT': {
      const { department, province, district } = action
      const next: LocationType = isLimaMetro({ department, province }) ? 'LIMA' : 'PROVINCIA'
      const sameRegion = state.locationType === next

      // Cambiar de región invalida lo capturado de la otra: no se arrastra un
      // distrito de Lima a un pedido de provincia.
      // Sin domicilio no hay nada que elegir: el método queda fijado en AGENCIA
      // desde que se sabe la región, y la UI ni siquiera muestra las tarjetas.
      const forced = state.homeDeliveryEnabled ? null : 'AGENCIA' as const

      if (!sameRegion) {
        return derive({
          ...state,
          locationType: next,
          limaAddress: next === 'LIMA' ? { ...EMPTY_LIMA, department, province, district } : null,
          provinciaConfig: next === 'PROVINCIA'
            ? { ...EMPTY_PROVINCIA, department, province, district, coverageResult: 'NOT_CHECKED' }
            : null,
          deliveryMethod: forced,
          pickup: { ...EMPTY_PICKUP },
          courierSurcharge: null,
          deliveryNote: null,
        })
      }

      if (next === 'LIMA') {
        if (lima().district === district && lima().province === province) return state
        // Otro distrito de Lima: la dirección escrita para el anterior ya no
        // corresponde, pero el pin sí se descarta — apunta a la zona vieja.
        return derive({
          ...state,
          limaAddress: { ...lima(), department, province, district, lat: null, lng: null },
          // Si había elegido recoger, la sede era la de su distrito anterior.
          deliveryMethod: forced,
          pickup: { ...EMPTY_PICKUP },
        })
      }

      const p = prov()
      if (p.district === district && p.province === province && p.department === department) return state
      // Otro distrito → el veredicto anterior ya no aplica.
      return derive({
        ...state,
        provinciaConfig: {
          ...p,
          department,
          province,
          district,
          city: null,
          eta: null,
          lat: null, lng: null,
          coverageResult: 'NOT_CHECKED',
        },
        // Cambiar de distrito limpia también el método y el punto. La sede está
        // atada a una ciudad: si no se borra, alguien que probó Trujillo y luego
        // eligió Carhuaz se queda con la sede de Trujillo y el paquete sale a
        // 500 km de donde vive.
        //
        // Y de paso arregla el precio que se adelantaba: con una agencia pegada
        // de antes, la nota mostraba "Adelanto de S/20" antes de que el
        // comprador eligiera nada.
        deliveryMethod: forced,
        pickup: { ...EMPTY_PICKUP },
        courierSurcharge: null,
        deliveryNote: null,
      })
    }

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
          eta: check.eta,
          coverageResult: check.result,
        },
        // En B el método lo elige el comprador: se deja en null a propósito
          // para que la UI muestre las dos tarjetas con su precio. Autodecidir
          // aquí sería exactamente lo que la variante existe para no hacer.
          // ...pero SOLO donde de verdad hay dos opciones. Sin cobertura del
          // courier no hay "a mi casa" que ofrecer, así que preguntarle sería
          // enseñarle una sola tarjeta y cobrarle un clic para llegar al mismo
          // sitio: las agencias. BORDERLINE también va directo — el courier no
          // garantiza esa zona y ofrecer domicilio ahí es prometer de más.
        // Sin domicilio da igual lo que diga la cobertura del courier: la marca
        // no tiene con quién repartir, y proponerlo cerraría pedidos con una
        // entrega a la puerta que nadie va a hacer.
        deliveryMethod: !state.homeDeliveryEnabled
          ? 'AGENCIA'
          : state.variant === 'B' && check.result === 'IN_ZONE'
            ? null
            : methodForCoverage(check.result),
        // Tarifa del courier: costo de la marca, jamás se le traslada al comprador.
        courierSurcharge: check.tariff,
        deliveryNote: note,
      })
    }

    // El comprador no coloca el pin o el mapa falla: nunca se le bloquea, va a
    // agencia con copy neutro y el pedido se cierra igual.
    case 'CHOOSE_AGENCY_BRANCH_FLOW':
      return derive({ ...state, deliveryMethod: 'AGENCIA' })

    case 'RETRY_DOMICILIO':
      if (!state.homeDeliveryEnabled) return state
      return derive({
        ...state,
        deliveryMethod: null,
        pickup: { ...EMPTY_PICKUP },
        provinciaConfig: { ...prov(), coverageResult: 'NOT_CHECKED' },
      })

    case 'SET_AGENCY':
      return derive({ ...state, pickup: {
        agency: action.agency,
        // Cambiar de agencia limpia la selección de la anterior.
        branchId: null,
        freeText: null,
      } })

    case 'SET_AGENCY_BRANCH':
      return derive({ ...state, pickup: { ...state.pickup, branchId: action.branchId } })

    // El comprador elige un PUNTO, no un courier: la agencia viene con el punto.
    // Va en una sola acción a propósito — despachar SET_AGENCY y después
    // SET_AGENCY_BRANCH deja un estado intermedio con agencia y sin sede, y como
    // SET_AGENCY limpia la sede, invertir el orden por descuido borraría la
    // elección recién hecha.
    case 'SET_PICKUP_POINT':
      return derive({ ...state, pickup: {
        agency: action.agency,
        branchId: action.branchId,
        // Elegir un punto del listado descarta el texto libre de `OTRO`.
        freeText: null,
      } })

    // Vuelta al listado desde el texto libre de `OTRO`. Deja la elección en
    // blanco en vez de apuntar a un courier concreto: cuál corresponde lo dice
    // la distancia, y el picker lo resuelve al montar.
    case 'CLEAR_PICKUP_POINT':
      return derive({ ...state, pickup: { ...EMPTY_PICKUP } })

    case 'SET_OLVA_TEXT':
      return derive({ ...state, pickup: { ...state.pickup, freeText: action.text } })

    case 'SET_DELIVERY_METHOD':
      // Red de seguridad: si la marca no reparte a domicilio, la acción se
      // ignora. La UI no ofrece la opción, pero el reducer es el contrato y no
      // debe poder quedar en un estado que la tienda no puede cumplir.
      if (action.method === 'DOMICILIO' && !state.homeDeliveryEnabled) return state
      // Cambiar de método invalida el punto ya elegido: si vuelve a "en casa"
      // después de haber marcado Shalom, el pedido saldría con agencia Y
      // domicilio, y el adelanto cobrado no calzaría con ninguno de los dos.
      return derive({
        ...state,
        deliveryMethod: action.method,
        pickup: action.method === 'DOMICILIO' ? { ...EMPTY_PICKUP } : state.pickup,
      })

    case 'SET_PROVINCIA_ADDRESS':
      return derive({ ...state, provinciaConfig: { ...prov(), address: {
        addressText: action.addressText ?? prov().address?.addressText ?? '',
        reference: action.reference ?? prov().address?.reference ?? '',
      } } })

    case 'SET_VOUCHER':
      return derive({ ...state, paymentVoucher: { url: action.url, uploadedAt: action.uploadedAt } })

    case 'SET_YAPE_CODE':
      return derive({ ...state, advanceYapeCode: action.code.replace(/\D/g, '').slice(0, YAPE_CODE_LENGTH) })

    case 'SET_VERIFICATION':
      return derive({ ...state, payment: {
        verification: action.verification,
        reason: action.reason ?? null,
        matchedAt: action.matchedAt ?? state.payment.matchedAt,
      } })

    case 'EXIT_OFFER_SHOWN':
      return { ...state, exitOfferShown: true }

    case 'APPLY_EXIT_DISCOUNT':
      // No se acumula: aplicarlo dos veces no duplica el descuento.
      return derive({ ...state, discountPen: EXIT_DISCOUNT_PEN, exitOfferShown: true })

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
