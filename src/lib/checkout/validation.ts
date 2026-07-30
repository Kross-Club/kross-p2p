// ─── SALES ENGINE · Validación por paso ──────────────────────────────────────
// Schemas puros, sin dependencias externas. Son 4 campos: una librería de
// validación (~13 KB gzip) no se paga sola cuando el bundle del checkout es
// dinero. Se usan igual en el cliente (inline al blur) y antes del insert.
//
// Los mensajes de error dicen CÓMO arreglarlo, no qué está mal: "Deben ser 9
// dígitos" convierte mejor que "Teléfono inválido".

import { COVERAGE_MODE, DNI_LENGTH, PHONE_LENGTH_PE, VOUCHER_REQUIRED, YAPE_CODE_LENGTH } from './checkout.config'
import { hasBranchList } from './services/AgencyService'
import type { CheckoutState, CheckoutStepId } from './types'

export type FieldName =
  | 'selectedPack' | 'dni' | 'whatsapp' | 'receiverName' | 'locationType'
  | 'district' | 'addressText' | 'city' | 'agency' | 'agencyBranch' | 'voucher' | 'yapeCode'

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

  if (!s.locationType) {
    e.locationType = 'Elige dónde recibes tu pedido'
    return e
  }

  // El DNI SOLO se pide en provincia, donde la agencia lo exige para entregar y
  // donde además hubo dinero adelantado. En Lima es contraentrega en la puerta:
  // pedirlo ahí es fricción pura en el segmento de mayor volumen.
  // Ver docs/00-CORE-ARCHITECTURE.md · Identidad del comprador.
  if (s.locationType === 'PROVINCIA') {
    const dni = validateDni(s.customerInfo.dni)
    if (dni) e.dni = dni
  }

  if (s.locationType === 'LIMA') {
    const a = s.limaAddress
    if (!a?.district) e.district = 'Elige tu distrito'
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

  if (p.deliveryMethod === 'DOMICILIO') {
    const addr = validateAddressText(p.address?.addressText ?? '')
    if (addr) e.addressText = addr
    return e
  }

  // Rama agencia. Es la salida que SIEMPRE está abierta: si el distrito no tiene
  // cobertura a domicilio, o el comprador la prefiere, aquí elige su sede.
  if (!p.selectedAgency) {
    e.agency = 'Elige tu agencia de recojo'
    return e
  }
  // Shalom y Olva tienen listado; las demás caen a texto libre.
  if (hasBranchList(p.selectedAgency)) {
    if (!p.selectedAgencyBranchId) e.agencyBranch = 'Elige la sede donde vas a recoger'
  } else if (!p.olvaBranchText?.trim()) {
    e.agencyBranch = 'Escribe en qué agencia vas a recoger'
  }
  return e
}

export function validateYapeCode(code: string): string | null {
  const d = digits(code)
  if (!d) return 'Copia el código que te dio Yape'
  if (d.length !== YAPE_CODE_LENGTH) return `Son ${YAPE_CODE_LENGTH} dígitos`
  return null
}

function validateStep3(s: CheckoutState): FieldErrors {
  // Lima paga 100 % contraentrega: no hay nada que verificar y el CTA queda
  // habilitado de una. Es el segmento de mayor volumen y el flujo más corto.
  if (s.advanceAmount <= 0) return {}

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
