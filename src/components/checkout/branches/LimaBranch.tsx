// ─── Rama LIMA ───────────────────────────────────────────────────────────────
// Lima es 100 % contraentrega: el flujo más corto que existe. Distrito con
// búsqueda, dirección y referencia. Sin mapa, sin pin, sin adelanto.

import { useEffect, useMemo, useState } from 'react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { DistrictCoverageService } from '../../../lib/checkout/services/DistrictCoverageService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState, DistrictOption } from '../../../lib/checkout/types'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import SearchSelect from '../fields/SearchSelect'
import type { SelectOption } from '../fields/SearchSelect'

interface LimaBranchProps {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

export default function LimaBranch({ state, dispatch, errors, touch }: LimaBranchProps) {
  const [districts, setDistricts] = useState<DistrictOption[] | null>(null)
  const [failed, setFailed] = useState(false)
  const address = state.limaAddress

  useEffect(() => {
    let alive = true
    // La definición vive en el servicio: las dos ramas la comparten para que
    // ningún distrito quede fuera de ambas. Ver `districtsFor`.
    DistrictCoverageService.districtsFor('LIMA')
      .then(list => { if (alive) setDistricts(list) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const options: SelectOption[] = useMemo(() => (districts ?? []).map(d => ({
    value: d.district,
    label: d.district,
    detail: d.province === 'Callao' ? 'Callao' : undefined,
  })), [districts])

  if (failed) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
        No pudimos cargar los distritos. Recarga la página e inténtalo de nuevo.
      </p>
    )
  }

  return (
    <div className="space-y-3.5">
      <SearchSelect
        label="Tu distrito"
        required
        placeholder="Escribe tu distrito"
        options={options}
        loading={districts === null}
        value={address?.district ?? null}
        error={errors.district}
        onBlur={() => touch('district')}
        onChange={district => {
          dispatch({ type: 'SET_LIMA_DISTRICT', district })
          touch('district')
          trackEvent({ name: 'coverage_checked', place: `${district}, Lima`, result: 'IN_ZONE' })
        }}
      />

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

      <p className="text-[11px] text-gray-500 bg-green-50 rounded-xl px-3 py-2.5">
        ✅ <strong className="font-black text-green-800">Pagas al recibir.</strong> Sin adelantos.
      </p>
    </div>
  )
}
