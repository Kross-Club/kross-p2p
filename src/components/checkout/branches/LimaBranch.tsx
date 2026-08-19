// ─── Rama LIMA ───────────────────────────────────────────────────────────────
// Lima es entrega a la puerta: el flujo más corto que existe. Dirección y
// referencia. Sin mapa, sin pin.
//
// El distrito ya NO se pide aquí: lo elige un único selector en el paso 2, y es
// justamente ese distrito el que determinó que esta rama se montara.

import { useEffect } from 'react'
import { ADVANCE_LIMA_PEN, COPY } from '../../../lib/checkout/checkout.config'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState } from '../../../lib/checkout/types'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'

interface LimaBranchProps {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

export default function LimaBranch({ state, dispatch, errors, touch }: LimaBranchProps) {
  const address = state.limaAddress
  const district = address?.district ?? null

  // En Lima metropolitana el veredicto no se consulta: el motorizado propio
  // cubre la zona entera. Se registra igual para que el embudo de cobertura
  // tenga las dos regiones y no solo provincia.
  useEffect(() => {
    if (district) trackEvent({ name: 'coverage_checked', place: `${district}, Lima`, result: 'IN_ZONE' })
  }, [district])

  return (
    <div className="space-y-3.5">
      <Field
        label="Dirección"
        required
        placeholder="Calle y número"
        autoComplete="street-address"
        value={address?.addressText ?? ''}
        onChange={e => dispatch({ type: 'SET_LIMA_ADDRESS', addressText: e.target.value })}
        onBlur={() => touch('addressText')}
        error={errors.addressText}
      />

      <Field
        label="Referencia de entrega"
        placeholder={COPY.referencePlaceholder}
        autoComplete="off"
        value={address?.reference ?? ''}
        onChange={e => dispatch({ type: 'SET_LIMA_ADDRESS', reference: e.target.value })}
        hint="Ayuda al motorizado a llegar sin llamarte."
      />

      {/* Decía "Sin adelantos" y quedó mintiendo cuando Lima pasó a adelantar
          S/5. Peor que no decir nada: el comprador lee que no paga nada ahora y
          dos pantallas después le piden yapear — que es exactamente la sorpresa
          que este checkout existe para no dar. */}
      <p className="text-[11px] text-gray-500 bg-green-50 rounded-xl px-3 py-2.5">
        ✅ <strong className="font-black text-green-800">
          Adelanto de S/{ADVANCE_LIMA_PEN}
        </strong> para reservar tu pedido. El resto lo pagas al recibir.
      </p>
    </div>
  )
}
