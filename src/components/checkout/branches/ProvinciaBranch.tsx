// ─── Rama PROVINCIA ──────────────────────────────────────────────────────────
// Distrito → veredicto de cobertura → domicilio o agencia. El adelanto se avisa
// ANTES del paso de pago: la sorpresa en el paso 3 es la principal causa de caída.
//
// La rama de agencia SIEMPRE está abierta. Aunque el distrito tenga cobertura a
// domicilio, el comprador puede preferir recoger — y si no la tiene, no hay
// callejón sin salida.

import { useEffect, useState } from 'react'
import { Home, PackageCheck, Store } from 'lucide-react'
import { ADVANCE_AGENCY_FROM_PEN, ADVANCE_PROVINCIA_DOMICILIO_PEN, COPY } from '../../../lib/checkout/checkout.config'
import { DistrictCoverageService } from '../../../lib/checkout/services/DistrictCoverageService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState } from '../../../lib/checkout/types'
import type { LatLng } from '../../../lib/geo/haversine'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import AgencyPicker from './AgencyPicker'

interface ProvinciaBranchProps {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

export default function ProvinciaBranch({ state, dispatch, errors, touch }: ProvinciaBranchProps) {
  // El distrito ya resuelto se guarda como llave, así `checking` se DERIVA en
  // vez de setearse dentro del efecto — mismo patrón que `AgencyPicker`.
  const [checked, setChecked] = useState<string | null>(null)
  const [center, setCenter] = useState<LatLng | null>(null)
  const p = state.provinciaConfig

  // El distrito ya viene elegido del paso 2. Consultar la cobertura es una
  // REACCIÓN a ese distrito, no algo que dispare un handler de esta pantalla:
  // así el veredicto también se recalcula cuando el comprador vuelve atrás y
  // cambia de distrito, sin que este componente tenga que enterarse de cómo.
  const districtKey = p?.district && p.province && p.department
    ? `${p.department}|${p.province}|${p.district}`
    : null

  useEffect(() => {
    if (!districtKey) return
    const [department, province, district] = districtKey.split('|')
    let alive = true
    void (async () => {
      try {
        const check = await DistrictCoverageService.checkDistrict(department, province, district)
        if (!alive) return
        dispatch({ type: 'SET_COVERAGE', check })
        trackEvent({ name: 'coverage_checked', place: `${district}, ${province}`, result: check.result })
        if (check.zoned) trackEvent({ name: 'coverage_zoned_district', place: `${district}, ${province}` })
        const c = await DistrictCoverageService.getDistrictCenter(department, province, district)
        if (alive) setCenter(c)
      } catch {
        // Si la cobertura falla NO se bloquea: se cae a agencia, que siempre entrega.
        if (alive) dispatch({ type: 'CHOOSE_AGENCY_BRANCH_FLOW' })
      } finally {
        if (alive) setChecked(districtKey)
      }
    })()
    return () => { alive = false }
  }, [districtKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const checking = Boolean(districtKey) && checked !== districtKey
  const method = state.deliveryMethod

  return (
    <div className="space-y-3.5">
      {checking && <p className="text-[11px] text-gray-400">Viendo si llegamos a tu zona…</p>}

      {/* Variante B: el método lo elige el comprador, y aparece SOLO después de
          poner su distrito — antes no se sabe si el courier llega ni cuánto
          cuesta, así que ofrecerlo sería preguntar a ciegas. Con los dos
          precios al lado, "recojo yo y ahorro S/10" es una decisión que puede
          tomar; en la variante A nunca se entera de que existía. */}
      {/* Solo donde HAY cobertura: sin courier la máquina ya mandó el pedido
          directo a agencia y no queda nada que preguntar. */}
      {/* `IN_ZONE` es la llave: antes de elegir distrito no hay veredicto de
          cobertura, así que sin esto el selector salía ya montado al abrir el
          paso — preguntándole cómo quiere recibir algo que todavía no sabe si
          le llega. Y solo con cobertura hay dos opciones reales: sin courier la
          máquina ya mandó el pedido a agencia y no queda nada que preguntar. */}
      {!checking && state.variant === 'B'
        && p?.coverageResult === 'IN_ZONE' && !method && (
        <MethodPicker
          onPick={m => {
            dispatch({ type: 'SET_DELIVERY_METHOD', method: m })
            trackEvent({ name: 'delivery_method_selected', method: m })
          }}
        />
      )}

      {!checking && method === 'DOMICILIO' && (
        <>
          <div className="rounded-2xl px-4 py-3" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <p className="text-sm font-black text-green-800">
              ✅ {state.variant === 'B' ? COPY.inZoneChosen : COPY.inZone}
            </p>
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
            <p className="text-sm font-black" style={{ color: '#5B21B6' }}>
              📦 {state.variant === 'B' ? COPY.outOfZoneChosen : COPY.outOfZone}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: '#6D28D9' }}>{COPY.outOfZoneBenefit}</p>
            {state.deliveryNote && (
              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#6D28D9' }}>
                ℹ️ {state.deliveryNote}
              </p>
            )}
          </div>

          <AgencyPicker
            near={center}
          isProvincia={true}
            agency={state.pickup.agency}
            branchId={state.pickup.branchId}
            freeText={state.pickup.freeText}
            errorAgency={errors.agency}
            errorBranch={errors.agencyBranch}
            onSelectPoint={(agency, branchId) => {
              dispatch({ type: 'SET_PICKUP_POINT', agency, branchId })
              touch('agency'); touch('agencyBranch')
            }}
            onChooseOther={() => { dispatch({ type: 'SET_AGENCY', agency: 'OTRO' }); touch('agency') }}
            onBackToList={() => dispatch({ type: 'CLEAR_PICKUP_POINT' })}
            onFreeText={text => dispatch({ type: 'SET_OLVA_TEXT', text })}
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

      {/* El adelanto se avisa ANTES del paso de pago, nunca como sorpresa. Pero
          el monto solo sale cuando ya ESTÁ decidido: hasta que elige casa o
          agencia —y cuál— puede ser S/20, S/25 o S/30, y `advanceAmount` cae
          mientras tanto al base de Shalom. Enseñar S/20 y cobrar S/30 es
          exactamente la sorpresa que este aviso existe para evitar. Sin cifra
          tranquiliza igual, y la cifra llega cuando es cierta. */}
      {p?.district && (
        <p className="text-[11px] rounded-xl px-3 py-2.5 flex items-start gap-1.5"
          style={{ background: '#FFF7ED', color: '#9A3412' }}>
          <PackageCheck size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#EA580C' }} />
          <span>
            {method === 'DOMICILIO' || state.pickup.agency ? (
              <>
                <strong className="font-black">Adelanto de S/{state.advanceAmount}.</strong>{' '}
                {COPY.advanceHeadsUpShort}
              </>
            ) : COPY.advanceHeadsUpNoAmount}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Casa o agencia (variante B) ─────────────────────────────────────────────
// Dos tarjetas con el precio DENTRO. El adelanto es la única diferencia real
// entre las dos opciones, así que esconderlo hasta el paso del pago convertiría
// la elección en una sorpresa: el comprador elige "en casa" pensando que es
// gratis y descubre S/30 dos pantallas después.
function MethodPicker({ onPick }: { onPick: (m: 'DOMICILIO' | 'AGENCIA') => void }) {
  return (
    <div>
      <p className="text-xs font-black text-gray-700 mb-2">¿Cómo prefieres recibirlo?</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo prefieres recibirlo">
        {/* Este picker solo se monta con cobertura confirmada, así que las dos
            opciones son reales. Prometer domicilio donde el courier no llega es
            el reclamo que el checkout entero existe para evitar. */}
        <button
            type="button"
            onClick={() => onPick('DOMICILIO')}
            className="rounded-2xl px-3 py-3 text-left border border-gray-200 bg-white active:scale-[0.98] transition"
          >
            <Home size={18} style={{ color: 'var(--brand)' }} />
            <p className="text-sm font-black text-gray-900 mt-1.5">En mi casa</p>
            <p className="text-[11px] text-gray-500">Te lo llevan a la puerta</p>
            <p className="text-[11px] font-black mt-1" style={{ color: 'var(--brand)' }}>
              Adelanto S/{ADVANCE_PROVINCIA_DOMICILIO_PEN}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick('AGENCIA')}
          className="rounded-2xl px-3 py-3 text-left border border-gray-200 bg-white active:scale-[0.98] transition"
        >
          <Store size={18} style={{ color: 'var(--brand)' }} />
          <p className="text-sm font-black text-gray-900 mt-1.5">Recojo en agencia</p>
          {/* Nombrar los couriers aquí obliga a editar este texto cada vez que
              se suma uno, y no le dice nada al comprador: lo que le importa es
              que el punto le quede cerca, no de quién es. */}
          <p className="text-[11px] text-gray-500">En un punto cerca de ti</p>
          <p className="text-[11px] font-black mt-1" style={{ color: 'var(--brand)' }}>
            Desde S/{ADVANCE_AGENCY_FROM_PEN}
          </p>
        </button>
      </div>
    </div>
  )
}
