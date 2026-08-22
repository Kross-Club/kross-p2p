// ─── Rama LIMA ───────────────────────────────────────────────────────────────
// Dos formas de recibirlo, igual que en provincia: a la puerta con el motorizado
// propio, o recogiendo en agencia. Shalom tiene 163 sedes en el departamento de
// Lima y Olva 128, así que el mostrador es una opción real y no un parche.
//
// A diferencia de provincia, aquí NO hay veredicto de cobertura que consultar:
// el motorizado propio llega a todo Lima metropolitana. Por eso la elección es
// del comprador desde el primer instante, sin esperar a nada — mientras la marca
// ofrezca domicilio. Si `homeDeliveryEnabled` está apagado no hay dos opciones
// que comparar y el reducer ya fijó AGENCIA al elegir el distrito.
//
// El distrito ya viene elegido del paso 2 — es lo que determinó que esta rama se
// montara.

import { useEffect, useState } from 'react'
import { Home, Store } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { DistrictCoverageService } from '../../../lib/checkout/services/DistrictCoverageService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState } from '../../../lib/checkout/types'
import type { LatLng } from '../../../lib/geo/haversine'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import AgencyPicker from './AgencyPicker'

interface LimaBranchProps {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

export default function LimaBranch({ state, dispatch, errors, touch }: LimaBranchProps) {
  const address = state.limaAddress
  const district = address?.district ?? null
  const method = state.deliveryMethod
  const [center, setCenter] = useState<LatLng | null>(null)

  // El centroide del distrito ordena las sedes por cercanía. Se pide siempre,
  // no solo al elegir agencia: si se pidiera al elegir, la lista aparecería
  // vacía el primer instante justo después del tap.
  useEffect(() => {
    if (!district) return
    let alive = true
    void DistrictCoverageService.getDistrictCenter(address?.department ?? 'Lima', address?.province ?? 'Lima', district)
      .then(c => { if (alive) setCenter(c) })
      .catch(() => { /* sin centroide el picker cae a su listado buscable */ })
    return () => { alive = false }
  }, [district]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lima metropolitana siempre tiene cobertura del motorizado propio: se
  // registra el veredicto para que el embudo tenga las dos regiones.
  useEffect(() => {
    if (district) trackEvent({ name: 'coverage_checked', place: `${district}, Lima`, result: 'IN_ZONE' })
  }, [district])

  return (
    <div className="space-y-3.5">
      {/* Sin domicilio no hay dos opciones que ofrecer: el reducer ya fijó
          AGENCIA al elegir el distrito, y mostrar un selector de una sola
          tarjeta cobra un tap para llegar al mismo sitio. */}
      {state.homeDeliveryEnabled && (
        <MethodPicker
          value={method}
          onPick={m => {
            dispatch({ type: 'SET_DELIVERY_METHOD', method: m })
            trackEvent({ name: 'delivery_method_selected', method: m })
          }}
        />
      )}

      {method === 'DOMICILIO' && (
        <>
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
        </>
      )}

      {method === 'AGENCIA' && (
        <AgencyPicker
          near={center}
          agency={state.pickup.agency}
          branchId={state.pickup.branchId}
          errorAgency={errors.agency}
          errorBranch={errors.agencyBranch}
          onSelectPoint={(agency, branchId) => {
            dispatch({ type: 'SET_PICKUP_POINT', agency, branchId })
            touch('agency'); touch('agencyBranch')
          }}
        />
      )}

      {/* Decía "Sin adelantos" y quedó mintiendo cuando Lima pasó a adelantar
          S/5. Peor que no decir nada: el comprador lee que no paga nada ahora y
          dos pantallas después le piden yapear — que es exactamente la sorpresa
          que este checkout existe para no dar. */}
      {method && (
        <p className="text-[11px] text-gray-500 bg-green-50 rounded-xl px-3 py-2.5">
          ✅ <strong className="font-black text-green-800">
            Adelanto de S/{state.advanceAmount}
          </strong> para reservar tu pedido. {method === 'AGENCIA'
            /* El saldo de agencia no se paga en el mostrador: se paga por la
               app y ese pago suelta la clave de recojo. */
            ? 'El resto lo pagas por la app cuando tu pedido ya esté enviado.'
            : 'El resto lo pagas al recibir.'}
        </p>
      )}
    </div>
  )
}

// ─── Casa o agencia ──────────────────────────────────────────────────────────
// Las tarjetas mostraban su adelanto (S/5 y S/5) porque antes el monto dependía
// del destino. Ya no: es un porcentaje del pedido, idéntico recoja o le lleven.
// Repetir la misma cifra en las dos no informaba nada y hacía parecer que la
// elección tenía precio. Lo que sí las distingue —dónde lo recibe— es lo único
// que queda.

function MethodPicker({ value, onPick }: {
  value: 'DOMICILIO' | 'AGENCIA' | null
  onPick: (m: 'DOMICILIO' | 'AGENCIA') => void
}) {
  const options = [
    { id: 'DOMICILIO' as const, icon: Home, title: 'En mi casa', sub: 'Te lo llevan a la puerta' },
    { id: 'AGENCIA' as const, icon: Store, title: 'Recojo en agencia', sub: 'En un punto cerca de ti' },
  ]

  return (
    <div>
      <p className="text-xs font-black text-gray-700 mb-2">¿Cómo prefieres recibirlo? *</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Cómo prefieres recibirlo?">
        {options.map(({ id, icon: Icon, title, sub }) => {
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(id)}
              className={`rounded-2xl px-3 py-3 text-left border-2 transition-all active:scale-[0.98]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
                ${active ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
            >
              <Icon size={18} className={active ? 'text-green-600' : 'text-gray-400'} />
              <p className={`text-sm font-black mt-1.5 ${active ? 'text-green-800' : 'text-gray-900'}`}>{title}</p>
              <p className="text-[11px] text-gray-500">{sub}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
