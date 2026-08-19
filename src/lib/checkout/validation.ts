// ─── SALES ENGINE · Validación por paso ──────────────────────────────────────
// Schemas puros, sin dependencias externas. Son 4 campos: una librería de
// validación (~13 KB gzip) no se paga sola cuando el bundle del checkout es
// dinero. Se usan igual en el cliente (inline al blur) y antes del insert.
//
// Los mensajes de error dicen CÓMO arreglarlo, no qué está mal: "Deben ser 9
// dígitos" convierte mejor que "Teléfono inválido".

import { COVERAGE_MODE, CULQI_OTP_LENGTH, DNI_LENGTH, PHONE_LENGTH_PE, VOUCHER_REQUIRED, YAPE_CODE_LENGTH, culqiActiveFor } from './checkout.config'
import { hasBranchList } from './services/AgencyService'
import type { CheckoutState, CheckoutStepId } from './types'

// `locationType` era un campo del formulario y ya no existe: la región se deriva
// del distrito, así que sus errores se reportan en `district`.
export type FieldName =
  | 'selectedPack' | 'dni' | 'whatsapp' | 'receiverName'
  | 'district' | 'addressText' | 'city' | 'agency' | 'agencyBranch' | 'voucher' | 'yapeCode'
  | 'culqiPhone' | 'culqiOtp'

export type FieldErrors = Partial<Record<FieldName, string>>

const digits = (s: string): string => s.replace(/\D/g, '')

// ─── Validadores de campo ────────────────────────────────────────────────────

export function validateDni(dni: string): string | null {
  const d = digits(dni)
  if (!d) return 'Ingresa tu DNI'
  if (d.length !== DNI_LENGTH) return `Deben ser ${DNI_LENGTH} dígitos`
  return null
}

export function validateWhatsapp(phone: string): string | null {
  const d = digits(phone)
  if (!d) return 'Ingresa tu WhatsApp'
  if (d.length !== PHONE_LENGTH_PE) return `Deben ser ${PHONE_LENGTH_PE} dígitos`
  // Todo celular peruano empieza en 9. Atajarlo aquí evita un pedido que nadie
  // puede contactar, que es peor que un campo rechazado.
  if (!d.startsWith('9')) return 'Un celular peruano empieza con 9'
  return null
}

export function validateReceiverName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Ingresa el nombre de quien recibe'
  if (n.length < 3) return 'Escribe el nombre completo'
  return null
}

export function validateAddressText(text: string): string | null {
  const t = text.trim()
  if (!t) return 'Ingresa tu dirección'
  if (t.length < 6) return 'Falta la calle y el número'
  return null
}

/** ¿El WhatsApp ya sirve para guardar el lead parcial? */
export const isWhatsappComplete = (phone: string): boolean => validateWhatsapp(phone) === null

// ─── Validación por paso ─────────────────────────────────────────────────────

function validateStep1(s: CheckoutState): FieldErrors {
  // El pack viene preseleccionado, así que este error no debería verse nunca —
  // existe para que el CTA no pueda enviar un estado imposible.
  return s.selectedPack ? {} : { selectedPack: 'Elige tu pack' }
}

function validateStep2(s: CheckoutState): FieldErrors {
  const e: FieldErrors = {}

  const phone = validateWhatsapp(s.customerInfo.whatsapp)
  if (phone) e.whatsapp = phone

  const name = validateReceiverName(s.customerInfo.receiverName)
  if (name) e.receiverName = name

  // Sin distrito no hay región: `locationType` se deriva de él, así que su
  // ausencia se le reporta al comprador en el campo que sí tocó.
  if (!s.locationType) {
    e.district = 'Elige tu distrito'
    return e
  }

  // El DNI se pide SIEMPRE, también en Lima. Antes era solo provincia, con el
  // argumento de que en Lima es contraentrega y pedirlo es fricción. Ese
  // argumento se cayó cuando Lima pasó a adelantar: donde hay dinero por
  // delante hace falta saber a nombre de quién, y el DNI es lo que deja cuadrar
  // el Yape con la persona. Además es la llave del comprador en todo el
  // sistema —recompra, puntos, historial— y tenerla solo para provincia partía
  // en dos la base de clientes.
  // Ver docs/00-CORE-ARCHITECTURE.md · Identidad del comprador.
  {
    const dni = validateDni(s.customerInfo.dni)
    if (dni) e.dni = dni
  }

  if (s.locationType === 'LIMA') {
    const a = s.limaAddress
    if (!a?.district) e.district = 'Elige tu distrito'
    // Lima también puede recoger en agencia: ahí no hay dirección que pedir.
    if (s.deliveryMethod === 'AGENCIA') return { ...e, ...validatePickup(s) }
    const addr = validateAddressText(a?.addressText ?? '')
    if (addr) e.addressText = addr
    // El pin NO se valida: en modo DISTRICT el pedido se cierra sin él.
    return e
  }

  const p = s.provinciaConfig
  if (!p?.district) {
    e.district = 'Elige tu distrito'
    return e
  }

  if (s.deliveryMethod === 'DOMICILIO') {
    const addr = validateAddressText(p.address?.addressText ?? '')
    if (addr) e.addressText = addr
    return e
  }

  return { ...e, ...validatePickup(s) }
}

/**
 * El punto de recojo, igual en las dos regiones.
 *
 * Es la salida que SIEMPRE está abierta: si el distrito no tiene cobertura a
 * domicilio, o el comprador prefiere recoger, aquí elige su punto.
 *
 * Elige un PUNTO y la agencia viene con él, así que el primer error solo aparece
 * cuando no llegó a elegir ninguno — por eso habla de dónde recoge, no de qué
 * courier prefiere: esa pregunta ya no se le hace.
 */
function validatePickup(s: CheckoutState): FieldErrors {
  const { agency, branchId, freeText } = s.pickup
  if (!agency) return { agency: 'Elige dónde vas a recoger tu pedido' }
  // Shalom y Olva tienen listado; las demás caen a texto libre.
  if (hasBranchList(agency)) {
    return branchId ? {} : { agencyBranch: 'Elige el punto donde vas a recoger' }
  }
  return freeText?.trim() ? {} : { agencyBranch: 'Escribe en qué agencia vas a recoger' }
}

export function validateYapeCode(code: string): string | null {
  const d = digits(code)
  if (!d) return 'Copia el código que te dio Yape'
  if (d.length !== YAPE_CODE_LENGTH) return `Son ${YAPE_CODE_LENGTH} dígitos`
  return null
}

/** El celular que aprueba en Yape: mismas reglas que un celular peruano. */
export function validateCulqiPhone(phone: string): string | null {
  const d = digits(phone)
  if (!d) return 'Pon el celular con el que vas a yapear'
  if (d.length !== PHONE_LENGTH_PE) return `Deben ser ${PHONE_LENGTH_PE} dígitos`
  if (!d.startsWith('9')) return 'Un celular peruano empieza con 9'
  return null
}

export function validateCulqiOtp(otp: string): string | null {
  const d = digits(otp)
  if (!d) return 'Genera tu código de aprobación en Yape'
  if (d.length !== CULQI_OTP_LENGTH) return `Son ${CULQI_OTP_LENGTH} dígitos`
  return null
}

function validateStep3(s: CheckoutState): FieldErrors {
  // Sin adelanto no hay nada que verificar y el CTA queda habilitado de una.
  if (s.advanceAmount <= 0) return {}

  // Cobro en línea: lo obligatorio es el celular + el código de aprobación.
  // Ni el código de seguridad de 3 dígitos ni la captura aplican — no hay
  // notificación que cruzar ni evidencia que revisar: el cargo ES la prueba.
  if (culqiActiveFor(s)) {
    const e: FieldErrors = {}
    const ph = validateCulqiPhone(s.culqiPhone)
    if (ph) e.culqiPhone = ph
    const otp = validateCulqiOtp(s.culqiOtp)
    if (otp) e.culqiOtp = otp
    return e
  }

  const e: FieldErrors = {}

  // El CÓDIGO es lo obligatorio, no la imagen. Es la llave que cuadra el pago
  // con la notificación que le llega a la marca; son 3 dígitos que el comprador
  // tiene en pantalla. Ver VOUCHER_REQUIRED en checkout.config.ts.
  const code = validateYapeCode(s.advanceYapeCode)
  if (code) e.yapeCode = code

  // La captura solo bloquea si la marca lo pide explícitamente. Nunca se espera
  // al RESULTADO de la verificación: esa corre en background y el comprador no
  // debe quedarse mirando un spinner.
  if (VOUCHER_REQUIRED && !s.paymentVoucher) e.voucher = 'Sube tu comprobante para terminar'

  return e
}

const VALIDATORS: Record<CheckoutStepId, (s: CheckoutState) => FieldErrors> = {
  1: validateStep1,
  2: validateStep2,
  3: validateStep3,
}

export function validateStep(s: CheckoutState, step: CheckoutStepId = s.step): FieldErrors {
  return VALIDATORS[step](s)
}

/** ¿Se puede avanzar del paso actual? */
export function canAdvance(s: CheckoutState): boolean {
  return Object.keys(validateStep(s)).length === 0
}

/** ¿Está el pedido completo y listo para el insert? Valida los 3 pasos. */
export function canSubmit(s: CheckoutState): boolean {
  if (s.status === 'SUBMITTING' || s.status === 'SUBMITTED') return false
  return ([1, 2, 3] as CheckoutStepId[]).every(step => Object.keys(validateStep(s, step)).length === 0)
}

/** Modo de cobertura vigente para la región elegida. */
export function coverageModeFor(s: CheckoutState) {
  return s.locationType ? COVERAGE_MODE[s.locationType] : null
}
