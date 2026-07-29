// ─── Rama agencia · Shalom y Olva ────────────────────────────────────────────
// Las dos tienen listado con coordenadas (487 y 424 sedes), así que las resuelve
// el MISMO componente: se muestran las 3 más cercanas con su distancia real y se
// preselecciona la primera. Quién tiene listado y quién no lo decide
// `AgencyService.hasBranchList`, nunca un `if (agency === 'OLVA')` aquí.
//
// Las agencias sin listado (hoy solo `OTRO`) caen a texto libre y el pedido
// queda marcado para verificación manual de Logística.
//
// Shalom va primero y marcada como recomendada: su adelanto es la mitad, y la
// ruta más barata para el comprador debe ser también la ruta por defecto.

import { useEffect, useState } from 'react'
import { ExternalLink, Store, Check } from 'lucide-react'
import { AgencyService, RECOMMENDED_AGENCY } from '../../../lib/checkout/services/AgencyService'
import { formatDistance } from '../../../lib/geo/haversine'
import { COPY, advanceFor } from '../../../lib/checkout/checkout.config'
import { trackEvent } from '../../../lib/checkout/analytics'
import type { AgencyBranch, AgencyName, NearbyBranch } from '../../../lib/checkout/types'
import Field from '../fields/Field'

// El adelanto se muestra en cada tarjeta ANTES de elegir: Olva cobra más flete
// que Shalom, y que el monto cambie después de haber elegido se lee como que le
// subieron el precio a mitad de compra.
const AGENCIES: { id: AgencyName; label: string }[] = [
  { id: 'SHALOM', label: 'Shalom' },
  { id: 'OLVA', label: 'Olva' },
]

interface AgencyPickerProps {
  /** Punto de referencia para ordenar sedes: centroide del distrito elegido. */
  near: { lat: number; lng: number } | null
  agency: AgencyName | null
  branchId: string | null
  olvaText: string | null
  errorAgency?: string
  errorBranch?: string
  onSelectAgency: (agency: AgencyName) => void
  onSelectBranch: (branchId: string) => void
  onOlvaText: (text: string) => void
  onBlur: () => void
}

export default function AgencyPicker({
  near, agency, branchId, olvaText, errorAgency, errorBranch,
  onSelectAgency, onSelectBranch, onOlvaText, onBlur,
}: AgencyPickerProps) {
  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-bold text-gray-600 mb-1.5 block">Elige tu agencia de recojo *</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Agencia de recojo">
          {AGENCIES.map(a => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={agency === a.id}
              onClick={() => { onSelectAgency(a.id); trackEvent({ name: 'agency_selected', agency: a.id }) }}
              className={`relative flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
                ${agency === a.id ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
            >
              {a.id === RECOMMENDED_AGENCY && (
                <span className="absolute -top-2 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-green-600 text-white">
                  RECOMENDADA
                </span>
              )}
              <Store size={18} className={agency === a.id ? 'text-green-600' : 'text-gray-400'} />
              <span className={`text-sm font-black ${agency === a.id ? 'text-green-800' : 'text-gray-700'}`}>
                {a.label}
              </span>
              <span className="text-[10px] text-gray-400">
                Adelanto S/{advanceFor(true, a.id)}
              </span>
            </button>
          ))}
        </div>
        {errorAgency && <p role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{errorAgency}</p>}
      </div>

      {agency && AgencyService.hasBranchList(agency) && (
        <BranchPicker agency={agency} near={near} selected={branchId} onSelect={onSelectBranch} error={errorBranch} />
      )}

      {agency && !AgencyService.hasBranchList(agency) && (
        <div>
          <Field
            label={COPY.olvaQuestion}
            required
            value={olvaText ?? ''}
            onChange={e => onOlvaText(e.target.value)}
            onBlur={() => { onBlur(); trackEvent({ name: 'olva_branch_typed', length: (olvaText ?? '').length }) }}
            placeholder="Ej. Olva Av. España 1234"
            error={errorBranch}
            autoComplete="off"
            hint={
              <a
                href={COPY.olvaFinderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-blue-600"
              >
                Buscar agencias Olva <ExternalLink size={11} />
              </a>
            }
          />
        </div>
      )}
    </div>
  )
}

// ─── Sedes más cercanas (sirve para cualquier agencia con listado) ───────────

function BranchPicker({ agency, near, selected, onSelect, error }: {
  agency: AgencyName
  near: { lat: number; lng: number } | null
  selected: string | null
  onSelect: (id: string) => void
  error?: string
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
    AgencyService.getNearest(agency, near, 3)
      .then(list => { if (alive) setData({ key: nearKey, list: list ?? [] }) })
      // Si falla, se cae al listado buscable: nunca se deja al comprador sin salida.
      .catch(() => { if (alive) setData({ key: nearKey, list: [] }) })
    return () => { alive = false }
  }, [agency, nearKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = data?.key === nearKey ? data.list : null
  const loading = Boolean(nearKey) && fresh === null
  // Sin punto de referencia no hay cercanía que calcular, ni tampoco si la
  // búsqueda no devolvió nada: en ambos casos va el listado completo.
  const showAll = showAllRequested || !nearKey || (fresh !== null && fresh.length === 0)

  // Preselecciona la más cercana: un tap menos para el caso más común.
  useEffect(() => {
    if (!selected && fresh?.length) onSelect(fresh[0].id)
  }, [fresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showAll) return
    let alive = true
    AgencyService.search(agency, query, 30)
      .then(list => { if (alive) setResults(list) })
      .catch(() => { if (alive) setResults([]) })
    return () => { alive = false }
  }, [agency, showAll, query])

  if (loading) {
    return <p className="text-[11px] text-gray-400 py-2">Buscando las sedes más cercanas…</p>
  }

  return (
    <div>
      <span className="text-xs font-bold text-gray-600 mb-1.5 block">
        {showAll ? 'Busca tu sede *' : 'Sedes más cercanas a ti *'}
      </span>

      {!showAll && fresh && (
        <>
          <ul className="space-y-2">
            {fresh.map(b => (
              <li key={b.id}>
                <BranchCard branch={b} selected={selected === b.id} onSelect={onSelect} distanceKm={b.distanceKm} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowAllRequested(true)}
            className="mt-2 text-[11px] font-bold text-blue-600 underline"
          >
            Ver todas las sedes
          </button>
        </>
      )}

      {showAll && (
        <>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Escribe tu distrito o dirección"
            autoComplete="off"
            aria-label="Buscar sede"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-2 focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
          {results === null
            ? <p className="text-[11px] text-gray-400 py-2">Cargando sedes…</p>
            : results.length === 0
              ? <p className="text-[11px] text-gray-400 py-2">No encontramos sedes con "{query}".</p>
              : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {results.map(b => (
                    <li key={b.id}>
                      <BranchCard branch={b} selected={selected === b.id} onSelect={onSelect} />
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

function BranchCard({ branch, selected, onSelect, distanceKm }: {
  branch: AgencyBranch
  selected: boolean
  onSelect: (id: string) => void
  /** Solo lo traen las sedes del ranking de cercanía. */
  distanceKm?: number
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(branch.id)}
      aria-pressed={selected}
      className={`w-full flex items-start gap-2 text-left px-3.5 py-2.5 rounded-2xl border-2 transition-all
        focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
        ${selected ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
    >
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-black truncate ${selected ? 'text-green-800' : 'text-gray-800'}`}>
          {branch.name}
        </span>
        <span className="block text-[11px] text-gray-500 line-clamp-2">{branch.address}</span>
      </span>
      <span className="flex flex-col items-end gap-1 flex-shrink-0">
        {distanceKm !== undefined && (
          <span className="text-[10px] font-black text-gray-400">{formatDistance(distanceKm)}</span>
        )}
        {selected && <Check size={14} className="text-green-600" />}
      </span>
    </button>
  )
}
