// ─── Rama PROVINCIA ──────────────────────────────────────────────────────────
// Distrito → veredicto de cobertura → domicilio o agencia. El adelanto se avisa
// ANTES del paso de pago: la sorpresa en el paso 3 es la principal causa de caída.
//
// La rama de agencia SIEMPRE está abierta. Aunque el distrito tenga cobertura a
// domicilio, el comprador puede preferir recoger — y si no la tiene, no hay
// callejón sin salida.

import { useEffect, useMemo, useState } from 'react'
import { Home, PackageCheck } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { DistrictCoverageService } from '../../../lib/checkout/services/DistrictCoverageService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState, DistrictOption } from '../../../lib/checkout/types'
import type { LatLng } from '../../../lib/geo/haversine'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import SearchSelect from '../fields/SearchSelect'
import type { SelectOption } from '../fields/SearchSelect'
import AgencyPicker from './AgencyPicker'

interface ProvinciaBranchProps {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

/** Llave estable de una opción: desambigua los homónimos (dos Miraflores). */
const optionKey = (d: { department: string; province: string; district: string }): string =>
  `${d.department}|${d.province}|${d.district}`

export default function ProvinciaBranch({ state, dispatch, errors, touch }: ProvinciaBranchProps) {
  const [all, setAll] = useState<DistrictOption[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [center, setCenter] = useState<LatLng | null>(null)
  const p = state.provinciaConfig

  useEffect(() => {
    let alive = true
    DistrictCoverageService.listDistricts()
      // Lima tiene su propia rama: aquí solo el resto del país.
      .then(list => { if (alive) setAll(list.filter(d => d.department !== 'Lima')) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const options: SelectOption[] = useMemo(() => (all ?? []).map(d => ({
    value: optionKey(d),
    label: d.district,
    detail: `${d.province}, ${d.department}`,
    badge: d.covered && !d.weekly ? 'A tu puerta' : undefined,
  })), [all])

  const selectedKey = p?.district && p.province && p.department
    ? optionKey({ department: p.department, province: p.province, district: p.district })
    : null

  const pickDistrict = async (key: string) => {
    const [department, province, district] = key.split('|')
    dispatch({ type: 'SET_PROVINCIA_DISTRICT', department, province, district })
    touch('district')

    setChecking(true)
    try {
      const check = await DistrictCoverageService.checkDistrict(department, province, district)
      dispatch({ type: 'SET_COVERAGE', check })
      trackEvent({ name: 'coverage_checked', place: `${district}, ${province}`, result: check.result })
      if (check.zoned) trackEvent({ name: 'coverage_zoned_district', place: `${district}, ${province}` })
      setCenter(await DistrictCoverageService.getDistrictCenter(department, province, district))
    } catch {
      // Si la cobertura falla NO se bloquea: se cae a agencia, que siempre entrega.
      dispatch({ type: 'CHOOSE_AGENCY_BRANCH_FLOW' })
    } finally {
      setChecking(false)
    }
  }

  if (failed) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
        No pudimos cargar los distritos. Recarga la página e inténtalo de nuevo.
      </p>
    )
  }

  const method = p?.deliveryMethod

  return (
    <div className="space-y-3.5">
      <SearchSelect
        label="Tu distrito"
        required
        placeholder="Escribe tu distrito o ciudad"
        options={options}
        loading={all === null}
        value={selectedKey}
        error={errors.district}
        onBlur={() => touch('district')}
        onChange={pickDistrict}
      />

      {checking && <p className="text-[11px] text-gray-400">Viendo si llegamos a tu zona…</p>}

      {!checking && method === 'DOMICILIO' && (
        <>
          <div className="rounded-2xl px-4 py-3" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <p className="text-sm font-black text-green-800">✅ {COPY.inZone}</p>
            <p className="text-[11px] text-green-700 mt-0.5">
              Entrega en {p?.eta ?? 'pocos días'} con nuestro motorizado aliado.
            </p>
          </div>

          <Field
            label="Dirección"
            required
            placeholder="Calle y número"
            autoComplete="street-address"
            value={p?.address?.addressText ?? ''}
            onChange={e => dispatch({ type: 'SET_PROVINCIA_ADDRESS', addressText: e.target.value })}
            onBlur={() => touch('addressText')}
            error={errors.addressText}
          />
          <Field
            label="Referencia de entrega"
            placeholder={COPY.referencePlaceholder}
            autoComplete="off"
            value={p?.address?.reference ?? ''}
            onChange={e => dispatch({ type: 'SET_PROVINCIA_ADDRESS', reference: e.target.value })}
          />

          {/* Salida siempre abierta: puede preferir recoger aunque le llegue. */}
          <button
            type="button"
            onClick={() => dispatch({ type: 'CHOOSE_AGENCY_BRANCH_FLOW' })}
            className="text-[11px] font-bold text-blue-600 underline"
          >
            Prefiero recoger en una agencia
          </button>
        </>
      )}

      {!checking && method === 'AGENCIA' && (
        <>
          <div className="rounded-2xl px-4 py-3" style={{ background: '#F5F3FF', border: '1px solid #C4B5FD' }}>
            <p className="text-sm font-black" style={{ color: '#5B21B6' }}>📦 {COPY.outOfZone}</p>
            <p className="text-[11px] mt-0.5" style={{ color: '#6D28D9' }}>{COPY.outOfZoneBenefit}</p>
            {state.deliveryNote && (
              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#6D28D9' }}>
                ℹ️ {state.deliveryNote}
              </p>
            )}
          </div>

          <AgencyPicker
            near={center}
            agency={p?.selectedAgency ?? null}
            branchId={p?.selectedAgencyBranchId ?? null}
            olvaText={p?.olvaBranchText ?? null}
            errorAgency={errors.agency}
            errorBranch={errors.agencyBranch}
            onSelectAgency={agency => { dispatch({ type: 'SET_AGENCY', agency }); touch('agency') }}
            onSelectBranch={branchId => { dispatch({ type: 'SET_AGENCY_BRANCH', branchId }); touch('agencyBranch') }}
            onOlvaText={text => dispatch({ type: 'SET_OLVA_TEXT', text })}
            onBlur={() => touch('agencyBranch')}
          />

          {/* Si llegó aquí desde una cobertura válida, puede volver a domicilio. */}
          {p?.coverageResult === 'IN_ZONE' && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'RETRY_DOMICILIO' })}
              className="text-[11px] font-bold text-blue-600 underline flex items-center gap-1"
            >
              <Home size={12} /> {COPY.retryDomicilio}
            </button>
          )}
        </>
      )}

      {/* El adelanto se avisa ANTES del paso de pago, nunca como sorpresa. */}
      {p?.district && (
        <p className="text-[11px] rounded-xl px-3 py-2.5 flex items-start gap-1.5"
          style={{ background: '#FFF7ED', color: '#9A3412' }}>
          <PackageCheck size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#EA580C' }} />
          <span>
            <strong className="font-black">Adelanto de S/{state.advanceAmount}.</strong>{' '}
            {COPY.advanceHeadsUpShort}
          </span>
        </p>
      )}
    </div>
  )
}
