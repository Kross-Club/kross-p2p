// ─── SALES ENGINE · Mando del experimento A/B del checkout ───────────────────
// Dos versiones del mismo checkout conviven (`lib/checkout/variant.ts`). Este
// panel es lo único que hay para operarlas sin un deploy: repartir o mandar
// todo el tráfico a la ganadora, y ver cuál convierte.
//
// Regla de lectura que el panel HACE VISIBLE en vez de esconder: la variante
// solo cambia el flujo en provincia con cobertura del courier (en B el
// comprador elige domicilio o agencia; en A lo decide la cobertura). En Lima
// las dos son idénticas, así que el total global mezcla tráfico sin
// experimento. Por eso el número grande es el de provincia y el global va
// debajo, en gris, diciendo lo que es.

import { useEffect, useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type AbMode = 'SPLIT' | 'A' | 'B'

interface VariantStats {
  leads: number
  pedidos: number
  leadsProvincia: number
  pedidosProvincia: number
}
interface AbStats {
  since: string | null
  A: VariantStats
  B: VariantStats
}

/** Debajo de esto no se pinta ganador. Con 8 leads por rama, una diferencia de
 *  dos pedidos parece un 25 % y es ruido: el dueño toma decisiones con esto. */
const MIN_LEADS = 30

const MODES: { value: AbMode; label: string; hint: string }[] = [
  { value: 'SPLIT', label: '50 / 50', hint: 'Sorteo entre las dos. Es lo que produce los números.' },
  { value: 'A', label: 'Todos a A', hint: 'La cobertura decide el envío. Sin experimento.' },
  { value: 'B', label: 'Todos a B', hint: 'El comprador elige el envío. Sin experimento.' },
]

async function call(payload: Record<string, unknown>) {
  const { data: authData } = await supabase.auth.getSession()
  const jwt = authData.session?.access_token ?? ANON
  const res = await fetch(`${BASE}/manage-store`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

const pct = (num: number, den: number): string =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—'

export default function AbTestPanel({ storeId }: { storeId: string }) {
  const [mode, setMode] = useState<AbMode>('SPLIT')
  const [stats, setStats] = useState<AbStats | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guarda `alive` como en el resto del panel: un super admin que salta de marca
  // dispara dos cargas, y sin esto la respuesta lenta de la anterior pisaría el
  // switch de la nueva — mostrando el reparto de otra tienda.
  useEffect(() => {
    let alive = true
    void (async () => {
      const [cfg, st] = await Promise.all([
        call({ action: 'list', store_id: storeId }),
        call({ action: 'ab_stats', store_id: storeId }),
      ])
      if (!alive) return
      if (cfg.ok) {
        const mine = (cfg.data?.stores ?? []).find((s: { id: string }) => s.id === storeId)
        const raw = mine?.checkout_ab_mode
        setMode(raw === 'A' || raw === 'B' ? raw : 'SPLIT')
      }
      if (st.ok) setStats(st.data as AbStats)
    })()
    return () => { alive = false }
  }, [storeId])

  const change = async (next: AbMode) => {
    if (next === mode || saving) return
    const previous = mode
    setMode(next)            // optimista: el switch tiene que sentirse inmediato
    setSaving(true)
    setError(null)
    const { ok } = await call({ action: 'update', store_id: storeId, checkout_ab_mode: next })
    setSaving(false)
    if (!ok) {
      setMode(previous)      // se revierte: un switch que miente es peor que uno lento
      setError('No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  // Se compara sobre PROVINCIA, que es donde las dos versiones se diferencian.
  const a = stats?.A
  const b = stats?.B
  const leadsA = a?.leadsProvincia ?? 0
  const leadsB = b?.leadsProvincia ?? 0
  const tasaA = leadsA > 0 ? (a!.pedidosProvincia / leadsA) : null
  const tasaB = leadsB > 0 ? (b!.pedidosProvincia / leadsB) : null
  const suficiente = leadsA >= MIN_LEADS && leadsB >= MIN_LEADS
  const ganadora = suficiente && tasaA !== null && tasaB !== null && tasaA !== tasaB
    ? (tasaA > tasaB ? 'A' : 'B')
    : null

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical size={15} style={{ color: 'var(--brand)' }} />
        <p className="text-xs font-black text-gray-900">Experimento del checkout</p>
        {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Dos versiones del paso de envío. Se diferencian solo en provincia con cobertura:
        en <b>A</b> la cobertura decide, en <b>B</b> elige el comprador.
      </p>

      <div className="flex gap-1.5 mb-1">
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => change(m.value)}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-black transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--brand)]"
            style={mode === m.value
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: '#F3F4F6', color: '#6B7280' }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mb-4">{MODES.find(m => m.value === mode)?.hint}</p>
      {error && <p role="alert" className="text-[11px] font-bold text-red-600 mb-3">{error}</p>}

      {/* ── Contador ── */}
      {!stats || (leadsA === 0 && leadsB === 0) ? (
        <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5">
          Todavía sin datos. Se empiezan a contar con el primer comprador que teclee su
          WhatsApp desde ahora — los pedidos anteriores no tienen versión marcada.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map(v => {
              const s = v === 'A' ? a : b
              const leads = v === 'A' ? leadsA : leadsB
              const tasa = v === 'A' ? tasaA : tasaB
              const gana = ganadora === v
              return (
                <div key={v} className="rounded-xl px-3 py-2.5"
                  style={gana ? { background: '#F0FDF4', border: '1px solid #BBF7D0' } : { background: '#F9FAFB' }}>
                  <p className="text-[10px] font-black uppercase tracking-wide"
                    style={{ color: gana ? '#15803D' : '#9CA3AF' }}>
                    Versión {v}{gana ? ' · va ganando' : ''}
                  </p>
                  <p className="text-xl font-black" style={{ color: gana ? '#15803D' : '#111827' }}>
                    {tasa === null ? '—' : pct(s!.pedidosProvincia, leads)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {s!.pedidosProvincia} de {leads} en provincia
                  </p>
                  <p className="text-[10px] text-gray-300 mt-1">
                    Todo el tráfico: {s!.pedidos} de {s!.leads}
                  </p>
                </div>
              )
            })}
          </div>

          {!suficiente && (
            <p className="text-[10px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2">
              Muestra corta ({leadsA} y {leadsB} de {MIN_LEADS} por versión). Con estos números
              la diferencia todavía puede ser azar — no cambies el reparto por lo que veas hoy.
            </p>
          )}
        </>
      )}
    </div>
  )
}
