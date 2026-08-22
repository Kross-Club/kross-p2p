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
// La tarjeta mostraba el adelanto de su courier (S/20 Shalom, S/25 Olva). Ya no:
// el adelanto es un porcentaje del pedido, igual en todas, así que repetir la
// misma cifra cuatro veces solo gastaba línea y sugería una diferencia que no
// existe.

import { useEffect, useRef, useState } from 'react'
import { Check, MapPin, Store } from 'lucide-react'
import { keepAligned, pinToTop } from '../fields/scroll'
import { AgencyService, describePickupDistance, pointKey } from '../../../lib/checkout/services/AgencyService'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { AgencyBranch, AgencyName, NearbyBranch } from '../../../lib/checkout/types'

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
  errorAgency?: string
  errorBranch?: string
  /** El punto trae su courier: agencia y sede se fijan de una sola vez. */
  onSelectPoint: (agency: AgencyName, branchId: string) => void
}

export default function AgencyPicker({
  near, agency, branchId, errorAgency, errorBranch, onSelectPoint,
}: AgencyPickerProps) {
  // Aquí vivía la rama de texto libre para `OTRO`, con su botón "Mi agencia no
  // está en la lista". Se quitó: las 911 sedes cubren los 25 departamentos, así
  // que el caso que justificaba la salida —no encontrar la propia agencia— en la
  // práctica no existe. Lo que sí generaba era pedidos con una sede escrita a
  // mano que alguien tenía que verificar después. Quien no vea su agencia elige
  // el punto más cercano, que es lo que el ranking ya le pone primero.
  //
  // Un borrador viejo con `OTRO` no se rompe: llega sin `branchId`, así que el
  // ranking le preselecciona el punto más cercano al montar.
  return (
    <PointPicker
      near={near}
      agency={agency}
      branchId={branchId}
      error={errorBranch ?? errorAgency}
      onSelectPoint={onSelectPoint}
    />
  )
}

// ─── Puntos de recojo de TODAS las agencias, ordenados por cercanía ──────────

function PointPicker({ near, agency, branchId, error, onSelectPoint }: {
  near: { lat: number; lng: number } | null
  agency: AgencyName | null
  branchId: string | null
  error?: string
  onSelectPoint: (agency: AgencyName, branchId: string) => void
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

  const wrapRef = useRef<HTMLDivElement>(null)

  // Al aparecer las tarjetas, subirlas a la vista: nacen debajo del pliegue del
  // modal (el comprador viene de elegir distrito, campos arriba) y sin esto no
  // sabe que ya puede escoger — ni que hay más de una opción. En el buscador
  // ("ver todos") el alineado además se repite en cada cambio de viewport,
  // porque el teclado abre después del foco y vuelve a tapar los resultados.
  useEffect(() => {
    if (loading) return
    const el = wrapRef.current
    if (!el) return
    if (!showAll) {
      const raf = requestAnimationFrame(() => pinToTop(el))
      return () => cancelAnimationFrame(raf)
    }
    return keepAligned(() => pinToTop(el))
  }, [loading, showAll])

  const pick = (b: AgencyBranch, rank?: number, distanceKm?: number) => {
    onSelectPoint(b.agency, b.id)
    trackEvent({ name: 'agency_selected', agency: b.agency, rank, distanceKm })
  }

  if (loading) {
    return <p className="text-[11px] text-gray-400 py-2">Buscando los puntos de recojo más cercanos…</p>
  }

  return (
    <div ref={wrapRef}>
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
      </span>
      <span className="flex flex-col items-end gap-1 flex-shrink-0">
        {distanceKm !== undefined && (
          <span className="flex items-center gap-0.5 text-[10px] font-black text-gray-400 whitespace-nowrap">
            <MapPin size={9} className="flex-shrink-0" />{describePickupDistance(distanceKm)}
          </span>
        )}
        {selected && <Check size={14} className="text-green-600" />}
      </span>
    </button>
  )
}
