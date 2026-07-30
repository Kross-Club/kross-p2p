// ─── PASO 2 · Datos de quien recibe ──────────────────────────────────────────
// El orden de los campos importa: es orden de compromiso creciente.
//   1. WhatsApp        → apenas es válido se guarda el lead parcial
//   2. Lima/Provincia  → toggle grande, no un <select>. Va temprano porque
//                        define qué campos siguen; es un tap, no un compromiso.
//   3a. LIMA      → solo el nombre. SIN DNI: es contraentrega en la puerta y
//                   nadie más lo exige. Un campo menos en el mayor volumen.
//   3b. PROVINCIA → DNI primero y luego el nombre, que Decolecta rellena solo.
//                   Aquí el DNI no es trámite nuestro: la agencia no entrega el
//                   paquete sin él. Ver docs/00-CORE-ARCHITECTURE.md.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Store, Truck } from 'lucide-react'
import { COPY, DNI_LENGTH } from '../../../lib/checkout/checkout.config'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState, LocationType } from '../../../lib/checkout/types'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import PhoneField from '../fields/PhoneField'
import LimaBranch from '../branches/LimaBranch'
import ProvinciaBranch from '../branches/ProvinciaBranch'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Step2Props {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  errors: FieldErrors
  touch: (field: FieldName) => void
}

export default function Step2Delivery({ state, dispatch, errors, touch }: Step2Props) {
  const { customerInfo, locationType } = state
  const phoneRef = useRef<HTMLDivElement>(null)

  // Foco en el primer campo vacío al entrar al paso.
  useEffect(() => {
    phoneRef.current?.querySelector('input')?.focus()
  }, [])

  return (
    <>
      <h2 className="text-xl font-black text-gray-900 mb-0.5">{COPY.step2Title}</h2>
      <p className="text-sm text-gray-500 mb-4">
        {locationType === 'PROVINCIA' ? 'Son 4 datos y listo.' : 'Son 3 datos y listo.'}
      </p>

      <div className="space-y-3.5">
        <div ref={phoneRef}>
          <PhoneField
            value={customerInfo.whatsapp}
            onChange={whatsapp => dispatch({ type: 'SET_WHATSAPP', whatsapp })}
            onBlur={() => touch('whatsapp')}
            error={errors.whatsapp}
          />
        </div>

        <LocationToggle
          value={locationType}
          error={errors.locationType}
          onChange={type => {
            dispatch({ type: 'SET_LOCATION_TYPE', locationType: type })
            touch('locationType')
            trackEvent({ name: 'location_selected', locationType: type })
          }}
        />

        {/* Provincia: el DNI va ANTES del nombre para que Decolecta lo rellene
            y el comprador escriba un campo menos. */}
        {locationType === 'PROVINCIA' && (
          <DniField
            value={customerInfo.dni}
            error={errors.dni}
            onChange={dni => dispatch({ type: 'SET_DNI', dni })}
            onBlur={() => touch('dni')}
            // El nombre de RENIEC solo rellena si el campo está vacío: nunca
            // pisa lo que el comprador ya escribió.
            onResolvedName={name => {
              if (!customerInfo.receiverName.trim()) {
                dispatch({ type: 'SET_RECEIVER_NAME', receiverName: name })
              }
            }}
          />
        )}

        {locationType && (
          <Field
            label="Nombre de quien recibe"
            required
            value={customerInfo.receiverName}
            onChange={e => dispatch({ type: 'SET_RECEIVER_NAME', receiverName: e.target.value })}
            onBlur={() => touch('receiverName')}
            placeholder="Nombre y apellido"
            autoComplete="name"
            error={errors.receiverName}
            hint={locationType === 'PROVINCIA' ? COPY.dniOtherReceiver : undefined}
          />
        )}

        {locationType === 'LIMA' && (
          <LimaBranch state={state} dispatch={dispatch} errors={errors} touch={touch} />
        )}
        {locationType === 'PROVINCIA' && (
          <ProvinciaBranch state={state} dispatch={dispatch} errors={errors} touch={touch} />
        )}
      </div>
    </>
  )
}

// ─── Lima vs Provincia ───────────────────────────────────────────────────────

function LocationToggle({ value, error, onChange }: {
  value: LocationType | null
  error?: string
  onChange: (type: LocationType) => void
}) {
  const options: { id: LocationType; icon: typeof Truck; title: string; sub: string }[] = [
    { id: 'LIMA', icon: Truck, title: 'Lima', sub: 'Pagas al recibir' },
    { id: 'PROVINCIA', icon: Store, title: 'Provincia', sub: 'Envío a todo el Perú' },
  ]

  return (
    <div>
      <span className="text-xs font-bold text-gray-600 mb-1.5 block">¿Dónde lo recibes? *</span>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Dónde lo recibes?">
        {options.map(({ id, icon: Icon, title, sub }) => {
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center gap-1 px-3 py-4 rounded-2xl border-2 transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
                ${active ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
            >
              <Icon size={22} className={active ? 'text-green-600' : 'text-gray-400'} />
              <span className={`text-sm font-black ${active ? 'text-green-800' : 'text-gray-700'}`}>{title}</span>
              <span className="text-[10px] text-gray-400 text-center">{sub}</span>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{error}</p>}
    </div>
  )
}

// ─── DNI con validación RENIEC ───────────────────────────────────────────────

function DniField({ value, error, onChange, onBlur, onResolvedName }: {
  value: string
  error?: string
  onChange: (dni: string) => void
  onBlur: () => void
  onResolvedName: (name: string) => void
}) {
  // La consulta se dispara en el handler, no en un efecto: es una reacción a lo
  // que el comprador escribe, no una sincronización con un sistema externo.
  const [lookup, setLookup] = useState<{ dni: string; status: LookupStatus; name: string | null } | null>(null)
  const current = lookup?.dni === value ? lookup : null

  const handleChange = (raw: string) => {
    const dni = raw.replace(/\D/g, '').slice(0, DNI_LENGTH)
    onChange(dni)
    if (dni.length !== DNI_LENGTH) return

    setLookup({ dni, status: 'looking', name: null })
    fetch(`${BASE}/dni-lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_number: dni }),
    })
      .then(r => r.json())
      .then((d: { nombre?: string }) => {
        if (d?.nombre) {
          setLookup({ dni, status: 'ok', name: d.nombre })
          onResolvedName(d.nombre)
        } else {
          setLookup({ dni, status: 'notfound', name: null })
        }
      })
      // Si RENIEC no responde NO se bloquea la venta: el DNI queda tal cual y el
      // pedido sigue. Un servicio caído no puede costar un pedido.
      .catch(() => setLookup({ dni, status: 'failed', name: null }))
  }

  const hint = HINTS[current?.status ?? 'idle']

  return (
    <div>
      <Field
        label="Tu DNI"
        required
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        maxLength={DNI_LENGTH}
        placeholder={`Tus ${DNI_LENGTH} dígitos`}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={onBlur}
        error={error}
        hint={hint}
        className="font-mono tracking-widest"
      />
      {current?.status === 'ok' && current.name && (
        <div
          className="mt-1.5 flex items-center gap-1.5 rounded-xl px-3 py-2"
          style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}
        >
          <ShieldCheck size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs font-black text-green-800 truncate">{current.name}</p>
        </div>
      )}
    </div>
  )
}

type LookupStatus = 'idle' | 'looking' | 'ok' | 'notfound' | 'failed'

const HINTS: Record<LookupStatus, ReactNode> = {
  idle: (
    <span className="flex items-start gap-1">
      <ShieldCheck size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
      {COPY.dniWhy}
    </span>
  ),
  looking: 'Validando tu DNI…',
  ok: (
    <span className="flex items-start gap-1">
      <ShieldCheck size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
      {COPY.dniWhy}
    </span>
  ),
  notfound: 'No pudimos validarlo, pero puedes continuar.',
  failed: 'No pudimos validarlo ahora. Puedes continuar igual.',
}
