// ─── PASO 2 · Datos de quien recibe ──────────────────────────────────────────
// El orden de los campos importa: es orden de compromiso creciente.
//   1. WhatsApp  → apenas es válido se guarda el lead parcial
//   2. DNI       → trae el nombre de RENIEC, así que el campo siguiente suele
//                  aparecer ya lleno
//   3. Nombre
//   4. Distrito  → UNO solo, con los 1 874 del país
//
// Aquí vivía un toggle "Lima y Callao / Provincia" antes del DNI. Se eliminó:
// `isLimaMetro()` deduce la región del distrito, así que el toggle pedía un dato
// que el sistema ya tenía y cobraba un tap para llegar al mismo sitio. Peor,
// obligaba a mantener DOS selectores de distrito —uno por rama— que entre los
// dos ya se habían dejado 128 distritos afuera una vez.
//
// Lo que la región sigue decidiendo es lo que va DESPUÉS del distrito: en Lima
// la dirección de entrega, en provincia el veredicto de cobertura y el punto de
// recojo. Eso no es una pregunta, es una consecuencia.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { COPY, DNI_LENGTH } from '../../../lib/checkout/checkout.config'
import { DistrictCoverageService, isLimaMetro } from '../../../lib/checkout/services/DistrictCoverageService'
import { getGeoHint } from '../../../lib/checkout/services/GeoHintService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { CheckoutState, DistrictOption } from '../../../lib/checkout/types'
import type { CheckoutAction } from '../../../lib/checkout/machine'
import type { FieldErrors, FieldName } from '../../../lib/checkout/validation'
import Field from '../fields/Field'
import PhoneField from '../fields/PhoneField'
import SearchSelect from '../fields/SearchSelect'
import type { SelectOption } from '../fields/SearchSelect'
import LimaBranch from '../branches/LimaBranch'
import ProvinciaBranch from '../branches/ProvinciaBranch'

/** Llave estable de una opción: desambigua los homónimos (dos Miraflores). */
const optionKey = (d: { department: string; province: string; district: string }): string =>
  `${d.department}|${d.province}|${d.district}`

/**
 * Qué opción aparece marcada en el selector.
 *
 * El camino normal es interpolar la llave. El `find` existe para los borradores
 * guardados ANTES de que la dirección de Lima llevara departamento y provincia:
 * tienen distrito pero no la llave completa, y mostrar el campo vacío le pediría
 * al comprador repetir algo que ya eligió. Se ubica por nombre dentro de su
 * región, que es lo que hace segura la búsqueda pese a los homónimos.
 */
function selectedKey(
  chosen: { department: string | null; province: string | null; district: string | null } | null,
  all: DistrictOption[] | null,
  locationType: CheckoutState['locationType'],
): string | null {
  if (!chosen?.district) return null
  if (chosen.department && chosen.province) {
    return optionKey({ department: chosen.department, province: chosen.province, district: chosen.district })
  }
  const hit = (all ?? []).find(o =>
    o.district === chosen.district && isLimaMetro(o) === (locationType === 'LIMA'))
  return hit ? optionKey(hit) : null
}

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

  // El DNI está completo. Se mide por longitud, no por el resultado de RENIEC:
  // si la consulta falla o el documento no está en el padrón, el comprador tiene
  // que poder seguir igual. Bloquear el formulario por un servicio externo caído
  // es perder la venta por algo que no es culpa suya.
  const dniReady = customerInfo.dni.replace(/\D/g, '').length === DNI_LENGTH
  const phoneRef = useRef<HTMLDivElement>(null)

  // Foco en el primer campo vacío al entrar al paso.
  useEffect(() => {
    phoneRef.current?.querySelector('input')?.focus()
  }, [])

  // Precalentar la pista de geo-IP: el selector de distrito recién se monta
  // cuando el DNI está completo, y para entonces la respuesta ya está en cache
  // — así el orden por cercanía no le cuesta espera a nadie.
  useEffect(() => { void getGeoHint() }, [])

  return (
    <>
      <h2 className="text-xl font-black text-gray-900 mb-0.5">{COPY.step2Title}</h2>
      {/* Cuatro en las dos regiones: al derivarse del distrito, la región dejó
          de sumar un campo. Antes decía "3" en Lima porque el toggle no contaba
          como dato, cosa que el comprador no tenía por qué adivinar. */}
      <p className="text-sm text-gray-500 mb-4">Son 4 datos y listo.</p>

      <div className="space-y-3.5">
        <div ref={phoneRef}>
          <PhoneField
            value={customerInfo.whatsapp}
            onChange={whatsapp => dispatch({ type: 'SET_WHATSAPP', whatsapp })}
            onBlur={() => touch('whatsapp')}
            error={errors.whatsapp}
          />
        </div>

        {/* El DNI va ANTES del nombre para que Decolecta lo rellene y el
            comprador escriba un campo menos. */}
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

        {/* Nombre y distrito aparecen recién con el DNI completo. El paso 2 pide
            cuatro cosas y mostrarlas todas de golpe se lee como un formulario
            largo — la razón número uno de abandono en móvil. De a poco no oculta
            trabajo: lo reparte, y cada campo resuelto empuja al siguiente.

            Además el DNI trae el nombre de RENIEC, así que cuando el campo
            aparece suele venir ya lleno: el comprador ve que el formulario
            trabaja para él en vez de pedirle. Por eso se revela con el DNI y no
            con cualquier otro campo. */}
        {dniReady && (
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

        {dniReady && <DistrictSelect state={state} dispatch={dispatch} error={errors.district} touch={touch} />}

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

// ─── Distrito · uno solo, los 1 874 del país ─────────────────────────────────
// Antes había dos selectores, uno por rama, cada uno con su propio filtro. Entre
// los dos se perdieron los 128 distritos del departamento de Lima que no son
// Lima metropolitana. Con una sola lista ese agujero no puede volver a existir.
//
// El ORDEN de la lista es el prior del ranking de `SearchSelect`: entre
// coincidencias del mismo nivel gana la que va primero aquí. Con pista de
// geo-IP se ordena por cercanía; sin ella, Lima metro → cubiertos → resto,
// que es donde vive el grueso de los pedidos. El dataset crudo venía por
// departamento alfabético y "santiago" mostraba 22 homónimos rurales antes
// que Santiago de Surco.

/** Prior sin geo: menor = más arriba. */
const defaultPrior = (d: DistrictOption): number =>
  isLimaMetro(d) ? 0 : d.covered ? 1 : 2

function DistrictSelect({ state, dispatch, error, touch }: {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  error?: string
  touch: (field: FieldName) => void
}) {
  const [all, setAll] = useState<DistrictOption[] | null>(null)
  const [geoUsed, setGeoUsed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      let list: DistrictOption[]
      try {
        list = await DistrictCoverageService.listDistricts()
      } catch {
        if (alive) setFailed(true)
        return
      }
      // `sort` es estable: dentro de cada prior se conserva el orden del padrón.
      let ordered = [...list].sort((a, b) => defaultPrior(a) - defaultPrior(b))
      try {
        const near = await getGeoHint()
        if (near) {
          ordered = await DistrictCoverageService.sortByProximity(ordered, near)
          if (alive) setGeoUsed(true)
        }
      } catch {
        // Sin geo no se pierde nada: el prior por defecto ya está aplicado.
      }
      if (alive) setAll(ordered)
    })()
    return () => { alive = false }
  }, [])

  const options: SelectOption[] = useMemo(() => (all ?? []).map(d => ({
    value: optionKey(d),
    label: d.district,
    detail: `${d.province}, ${d.department}`,
    // Promete de menos a propósito: hasta que el veredicto de cobertura corre,
    // "a tu casa" es una posibilidad, no un compromiso.
    //
    // Y solo si la marca REPARTE a domicilio. En una tienda solo-agencia no hay
    // motorizado que mandar, y prometerlo en la lista donde el comprador ELIGE
    // es la peor sorpresa posible: la descubre dos campos después, cuando solo
    // le ofrecemos puntos de recojo.
    badge: state.homeDeliveryEnabled && d.covered && !d.weekly
      ? 'Podemos ir a tu casa'
      : undefined,
  })), [all, state.homeDeliveryEnabled])

  const p = state.provinciaConfig
  const l = state.limaAddress
  const chosen = p?.district ? p : l?.district ? l : null
  const current = selectedKey(chosen, all, state.locationType)

  if (failed) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
        No pudimos cargar los distritos. Recarga la página e inténtalo de nuevo.
      </p>
    )
  }

  return (
    <SearchSelect
      label="¿A qué distrito enviamos?"
      required
      placeholder="Escribe tu distrito o ciudad"
      options={options}
      loading={all === null}
      value={current}
      error={error}
      onBlur={() => touch('district')}
      onChange={key => {
        const [department, province, district] = key.split('|')
        dispatch({ type: 'SET_DISTRICT', department, province, district })
        touch('district')
        // La región sale de la MISMA función que usa el reducer. Reescribirla
        // aquí es cómo se abren los agujeros que este refactor vino a cerrar.
        trackEvent({
          name: 'location_selected',
          locationType: isLimaMetro({ department, province }) ? 'LIMA' : 'PROVINCIA',
          // Posición del elegido en la lista SIN teclear: mide si el prior
          // (geo o por defecto) recomienda bien, igual que `rank` en
          // `agency_selected` valida el orden por cercanía de las agencias.
          rank: options.findIndex(o => o.value === key),
          geoHint: geoUsed,
        })
      }}
    />
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
