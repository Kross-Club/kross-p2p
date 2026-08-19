// ─── Rama agencia · un LUGAR, no un courier ──────────────────────────────────
// El comprador elige dónde recoge. Qué empresa opera ese punto es un atributo de
// la tarjeta, no una pregunta previa.
//
// Antes eran dos decisiones —agencia y después sede— y la primera se tomaba sin
// el dato que decide: la distancia. Peor, la agencia por defecto era una
// constante global (`RECOMMENDED_AGENCY = 'SHALOM'`) apoyada en un adelanto que
// ya no es el que dice el comentario. Con las 911 sedes cargadas, cuál conviene
// depende de la zona: Shalom domina la costa (Ica 18-5, Lambayeque 21-9) y Olva
// la sierra centro (Huancavelica 9-1, Ayacucho 13-5). Esa constante recomendaba
// la agencia equivocada en 11 de los 25 departamentos.
//
// Ordenar por distancia real cruzando las dos hace emerger la recomendación
// regional sola, y se mantiene sola cuando un courier abre o cierra un local.
//
// El adelanto va DENTRO de cada tarjeta porque cambia según el courier (Shalom
// S/20, Olva S/25): que el monto suba después de haber elegido se lee como
// cambio de precio a mitad de compra.

import { useEffect, useState } from 'react'
import { Check, MapPin, Store } from 'lucide-react'
import { AgencyService, pointKey } from '../../../lib/checkout/services/AgencyService'
import { formatDistance } from '../../../lib/geo/haversine'
import { advanceFor } from '../../../lib/checkout/checkout.config'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { AgencyBranch, AgencyName, NearbyBranch } from '../../../lib/checkout/types'
import Field from '../fields/Field'

/** Cuántos puntos se muestran antes de mandar al buscador. Cuatro y no tres:
 *  mezclando dos couriers, tres tarjetas pueden salir todas del mismo y la
 *  pantalla deja de comunicar que había alternativas. */
const NEAREST_COUNT = 4

const AGENCY_LABEL: Record<AgencyName, string> = {
  SHALOM: 'Shalom',
  OLVA: 'Olva',
  OTRO: 'Otra agencia',
}

interface AgencyPickerProps {
  /** Punto de referencia para ordenar sedes: centroide del distrito elegido. */
  near: { lat: number; lng: number } | null
  agency: AgencyName | null
  branchId: string | null
  /** Texto libre para agencias sin listado. */
  freeText: string | null
  errorAgency?: string
  errorBranch?: string
  /** El punto trae su courier: agencia y sede se fijan de una sola vez. */
  onSelectPoint: (agency: AgencyName, branchId: string) => void
  /** Salida a texto libre cuando su agencia no está en el listado. */
  onChooseOther: () => void
  /** Vuelta al listado desde el texto libre. */
  onBackToList: () => void
  onFreeText: (text: string) => void
  onBlur: () => void
}

export default function AgencyPicker({
  near, agency, branchId, freeText, errorAgency, errorBranch,
  onSelectPoint, onChooseOther, onBackToList, onFreeText, onBlur,
}: AgencyPickerProps) {
  // `OTRO` es la única agencia sin listado: ahí no hay punto que ordenar y la
  // pantalla entera cambia a texto libre.
  if (agency === 'OTRO') {
    return (
      <div className="space-y-2">
        <Field
          label="¿En qué agencia vas a recoger?"
          required
          value={freeText ?? ''}
          onChange={e => onFreeText(e.target.value)}
          onBlur={() => { onBlur(); trackEvent({ name: 'olva_branch_typed', length: (freeText ?? '').length }) }}
          placeholder="Ej. Marvisur Av. España 1234, Trujillo"
          error={errorBranch}
          autoComplete="off"
          hint="Escribe el nombre y la dirección. Un asesor confirma la sede contigo."
        />
        <button
          type="button"
          onClick={onBackToList}
          className="text-[11px] font-bold text-blue-600 underline"
        >
          ← Ver los puntos de recojo cerca de mí
        </button>
      </div>
    )
  }

  return (
    <PointPicker
      near={near}
      agency={agency}
      branchId={branchId}
      error={errorBranch ?? errorAgency}
      onSelectPoint={onSelectPoint}
      onChooseOther={onChooseOther}
    />
  )
}

// ─── Puntos de recojo de TODAS las agencias, ordenados por cercanía ──────────

function PointPicker({ near, agency, branchId, error, onSelectPoint, onChooseOther }: {
  near: { lat: number; lng: number } | null
  agency: AgencyName | null
  branchId: string | null
  error?: string
  onSelectPoint: (agency: AgencyName, branchId: string) => void
  onChooseOther: () => void
}) {
  // El resultado se guarda junto a la llave del punto que lo produjo, así el
  // estado de carga se DERIVA en vez de setearse dentro del efecto.
  const nearKey = near ? `${near.lat},${near.lng}` : null
  const [data, setData] = useState<{ key: string; list: NearbyBranch[] } | null>(null)
  const [showAllRequested, setShowAllRequested] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AgencyBranch[] | null>(null)

  useEffect(() => {
    if (!nearKey || !near) return
    let alive = true
    AgencyService.getNearestPoints(near, NEAREST_COUNT)
      .then(list => { if (alive) setData({ key: nearKey, list }) })
      // Si falla, se cae al listado buscable: nunca se deja al comprador sin salida.
      .catch(() => { if (alive) setData({ key: nearKey, list: [] }) })
    return () => { alive = false }
  }, [nearKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = data?.key === nearKey ? data.list : null
  const loading = Boolean(nearKey) && fresh === null
  // Sin punto de referencia no hay cercanía que calcular, ni tampoco si la
  // búsqueda no devolvió nada: en ambos casos va el listado completo.
  const showAll = showAllRequested || !nearKey || (fresh !== null && fresh.length === 0)

  // Preselecciona el más cercano: un tap menos para el caso más común.
  useEffect(() => {
    if (!branchId && fresh?.length) onSelectPoint(fresh[0].agency, fresh[0].id)
  }, [fresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showAll) return
    let alive = true
    AgencyService.searchPoints(query, 30)
      .then(list => { if (alive) setResults(list) })
      .catch(() => { if (alive) setResults([]) })
    return () => { alive = false }
  }, [showAll, query])

  const selectedKey = agency && branchId ? pointKey({ agency, id: branchId }) : null

  const pick = (b: AgencyBranch, rank?: number, distanceKm?: number) => {
    onSelectPoint(b.agency, b.id)
    trackEvent({ name: 'agency_selected', agency: b.agency, rank, distanceKm })
  }

  if (loading) {
    return <p className="text-[11px] text-gray-400 py-2">Buscando los puntos de recojo más cercanos…</p>
  }

  return (
    <div>
      <span className="text-xs font-bold text-gray-600 mb-1.5 block">
        {showAll ? 'Busca tu punto de recojo *' : '¿Dónde recoges tu pedido? *'}
      </span>

      {!showAll && fresh && (
        <>
          <ul className="space-y-2">
            {fresh.map((b, i) => (
              <li key={pointKey(b)}>
                <PointCard
                  branch={b}
                  selected={selectedKey === pointKey(b)}
                  /* El badge sale del ORDEN, no de una constante: quien queda
                     primero es quien está más cerca, y eso cambia por zona. */
                  nearest={i === 0}
                  distanceKm={b.distanceKm}
                  onSelect={() => pick(b, i, b.distanceKm)}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowAllRequested(true)}
            className="mt-2 text-[11px] font-bold text-blue-600 underline"
          >
            Ver todos los puntos de mi zona
          </button>
        </>
      )}

      {showAll && (
        <>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Escribe tu distrito, dirección o agencia"
            autoComplete="off"
            aria-label="Buscar punto de recojo"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-2 focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
          {/* Vuelta al ranking de cercanía. El buscador es un callejón sin salida
              sin esto: quien entra a "ver todos" para curiosear se queda con 900
              sedes ordenadas por nada y ya no encuentra la que tenía al lado.
              Solo aparece si HAY ranking al que volver — sin distrito ubicado no
              existe, y un botón que no lleva a ningún lado es peor que ninguno. */}
          {nearKey && fresh && fresh.length > 0 && (
            <button
              type="button"
              onClick={() => { setShowAllRequested(false); setQuery('') }}
              className="mb-2 text-[11px] font-bold text-blue-600 underline"
            >
              ← Ver los puntos más cercanos a mí
            </button>
          )}

          {results === null
            ? <p className="text-[11px] text-gray-400 py-2">Cargando puntos…</p>
            : results.length === 0
              ? <p className="text-[11px] text-gray-400 py-2">No encontramos puntos con "{query}".</p>
              : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {results.map(b => (
                    <li key={pointKey(b)}>
                      <PointCard
                        branch={b}
                        selected={selectedKey === pointKey(b)}
                        onSelect={() => pick(b)}
                      />
                    </li>
                  ))}
                </ul>
              )}
        </>
      )}

      {error && <p role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{error}</p>}

      {/* Salida siempre abierta: 911 sedes cubren los 25 departamentos, pero si
          su agencia de confianza no es ninguna de las dos, el pedido se cierra
          igual y Logística confirma la sede después. */}
      <button
        type="button"
        onClick={onChooseOther}
        className="mt-2 text-[11px] font-bold text-gray-500 underline"
      >
        Mi agencia no está en la lista
      </button>
    </div>
  )
}

function PointCard({ branch, selected, nearest, distanceKm, onSelect }: {
  branch: AgencyBranch
  selected: boolean
  /** El más cercano del ranking. No lo trae el buscador, que no ordena por distancia. */
  nearest?: boolean
  /** Solo lo traen los puntos del ranking de cercanía. */
  distanceKm?: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full flex items-start gap-2 text-left px-3.5 py-2.5 rounded-2xl border-2 transition-all
        focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
        ${selected ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
    >
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 flex-wrap">
          <Store size={12} className={selected ? 'text-green-600' : 'text-gray-400'} />
          <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">
            {AGENCY_LABEL[branch.agency]}
          </span>
          {nearest && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-green-600 text-white">
              MÁS CERCANA
            </span>
          )}
        </span>
        <span className={`block text-sm font-black truncate mt-0.5 ${selected ? 'text-green-800' : 'text-gray-800'}`}>
          {branch.name}
        </span>
        <span className="block text-[11px] text-gray-500 line-clamp-2">{branch.address}</span>
        <span className="block text-[10px] font-black text-gray-400 mt-1">
          Adelanto S/{advanceFor(true, branch.agency)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 flex-shrink-0">
        {distanceKm !== undefined && (
          <span className="flex items-center gap-0.5 text-[10px] font-black text-gray-400">
            <MapPin size={9} />{formatDistance(distanceKm)}
          </span>
        )}
        {selected && <Check size={14} className="text-green-600" />}
      </span>
    </button>
  )
}
