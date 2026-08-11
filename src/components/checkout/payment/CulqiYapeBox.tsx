// ─── SALES ENGINE · Formulario del cobro en línea ────────────────────────────
// Reemplaza a YapeBox cuando la tienda cobra con Culqi: en vez de copiar un
// número, yapear a mano y volver con la evidencia, el comprador trae una
// AUTORIZACIÓN (el código de aprobación) y el cobro entra al toque, por el
// monto exacto, sin captura ni cruce.
//
// El celular se PRELLENA desde el WhatsApp del paso 2 — en la enorme mayoría
// es el mismo número, y es un campo menos que teclear en la pantalla más cara
// del embudo. Editable: hay quien yapea con el número de un familiar, y
// forzar la coincidencia mataría esas ventas (decisión deliberada, no olvido).
//
// La estética es la de YapeBox (morado de Yape): para el comprador esto ES
// pagar con Yape — el motor es cocina nuestra y no se nombra.

import { useEffect } from 'react'
import { COPY, CULQI_OTP_LENGTH, PHONE_LENGTH_PE } from '../../../lib/checkout/checkout.config'
import { isWhatsappComplete } from '../../../lib/checkout/validation'
import type { CheckoutState } from '../../../lib/checkout/types'
import type { FieldErrors } from '../../../lib/checkout/validation'
import CulqiApprovalHint from '../CulqiApprovalHint'
import Field from '../fields/Field'

/** ¿Con qué se prellena el celular de Yape? Puro, para poder testearlo sin
 *  montar el efecto: WhatsApp válido y campo aún vacío → el WhatsApp; si el
 *  comprador ya escribió algo, jamás se pisa. */
export function culqiPrefillPhone(s: Pick<CheckoutState, 'culqiPhone' | 'customerInfo'>): string | null {
  if (s.culqiPhone) return null
  return isWhatsappComplete(s.customerInfo.whatsapp) ? s.customerInfo.whatsapp : null
}

interface CulqiYapeBoxProps {
  state: CheckoutState
  amount: number
  errors: FieldErrors
  touch: (field: 'culqiPhone' | 'culqiOtp') => void
  onPhone: (phone: string) => void
  onOtp: (otp: string) => void
  /** El fallo anterior exige un código NUEVO: se avisa arriba del campo. */
  askNewOtp?: boolean
}

export default function CulqiYapeBox({
  state, amount, errors, touch, onPhone, onOtp, askNewOtp,
}: CulqiYapeBoxProps) {
  // El prellenado corre al montar y cuando el WhatsApp cambia — nunca pisa lo
  // que el comprador ya escribió (el helper devuelve null en ese caso).
  useEffect(() => {
    const prefill = culqiPrefillPhone(state)
    if (prefill) onPhone(prefill)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.customerInfo.whatsapp])

  return (
    <div className="rounded-2xl border-2 p-4" style={{ borderColor: '#742284', background: '#FAF5FB' }}>
      <p className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#742284' }}>
        Yapea S/{amount} con tu código de aprobación
      </p>
      <p className="text-xs text-gray-600 mb-3">{COPY.culqiIntro}</p>

      <Field
        label={COPY.culqiPhoneLabel}
        required
        value={state.culqiPhone}
        onChange={e => onPhone(e.target.value)}
        onBlur={() => touch('culqiPhone')}
        error={errors.culqiPhone}
        hint={COPY.culqiPhoneHint}
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={PHONE_LENGTH_PE}
      />

      <div className="mt-3">
        <CulqiApprovalHint />
        {askNewOtp && (
          <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-2">
            {COPY.culqiOtpNew}
          </p>
        )}
        <Field
          label={COPY.culqiOtpLabel}
          required
          value={state.culqiOtp}
          onChange={e => onOtp(e.target.value)}
          onBlur={() => touch('culqiOtp')}
          error={errors.culqiOtp}
          hint={COPY.culqiOtpHint}
          placeholder={COPY.culqiOtpPlaceholder}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CULQI_OTP_LENGTH}
          className="tracking-[0.4em] text-center text-lg font-black"
        />
      </div>
    </div>
  )
}
