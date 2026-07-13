import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Package } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// The 5 real stages of the value chain
const ETAPAS: { key: string; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'nuevo',      label: 'Pedido',     emoji: '📋', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'confirmado', label: 'Confirmado', emoji: '📞', color: '#16A34A', bg: '#F0FDF4' },
  { key: 'preparando', label: 'Preparando', emoji: '📦', color: '#863bff', bg: '#F5F3FF' },
  { key: 'en_camino',  label: 'En camino',  emoji: '🚚', color: '#EA580C', bg: '#FFF7ED' },
  { key: 'entregado',  label: 'Entregado',  emoji: '✅', color: '#15803D', bg: '#DCFCE7' },
]

interface Sess {
  id: string
  token: string
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  stage: string
  status?: string
  nota?: string | null
  seller_name?: string | null
  seller_role?: string | null
}

const NOTA_META: Record<string, { label: string; color: string }> = {
  no_contesta: { label: 'No contesta', color: '#F59E0B' },
  recuperado: { label: 'Recuperado', color: '#16A34A' },
  cancelado: { label: 'Cancelado', color: '#DC2626' },
  anulado: { label: 'Anulado', color: '#6B7280' },
}

export default function CRMPage() {
  const navigate = useNavigate()
  const { effective, isAdmin, impersonating } = useSeller()
  const [view, setView] = useState<'lista' | 'kanban'>('lista')
  const [sessions, setSessions] = useState<Sess[]>([])
  const [loading, setLoading] = useState(true)

  const onlyMine = !!effective && !(isAdmin && !impersonating)

  useEffect(() => {
    if (!effective) return
    setLoading(true)
    const headers: Record<string, string> = { Authorization: `Bearer ${ANON}`, 'x-store-id': effective.store_id, 'x-include-cancelled': '1' }
    if (onlyMine) headers['x-seller-id'] = effective.auth_user_id
    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((data: Sess[]) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [effective?.auth_user_id, effective?.store_id, onlyMine])

  const Card = ({ s }: { s: Sess }) => (
    <button onClick={() => navigate(`/vendedor/pedido/${s.token}`)}
      className="w-full bg-white border border-gray-100 rounded-2xl p-3 shadow-sm text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{s.buyer_name || 'Comprador'}</p>
          <p className="text-xs text-gray-400 truncate">{s.product_name} · {s.pack_name || `S/${s.product_price}`}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {s.seller_name && <span className="text-[10px] text-gray-400">Atiende: {s.seller_name.split(' ')[0]}</span>}
            {s.nota && NOTA_META[s.nota] && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: `${NOTA_META[s.nota].color}22`, color: NOTA_META[s.nota].color }}>
                {NOTA_META[s.nota].label}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </button>
  )

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900">CRM</h1>
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          <button onClick={() => setView('lista')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Lista</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Kanban</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">{onlyMine ? 'Tus pedidos por estado' : 'Todos los pedidos de la tienda'}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
        </div>
      ) : view === 'lista' ? (
        <div className="space-y-5">
          {ETAPAS.map(etapa => {
            const items = sessions.filter(s => s.status !== 'cancelado' && s.stage === etapa.key)
            return (
              <div key={etapa.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: etapa.bg, color: etapa.color }}>
                    {etapa.emoji} {etapa.label}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-[11px] text-gray-300 pl-1">Sin pedidos</p>
                ) : (
                  <div className="space-y-2">{items.map(s => <Card key={s.id} s={s} />)}</div>
                )}
              </div>
            )
          })}
          {(() => {
            const cancel = sessions.filter(s => s.status === 'cancelado')
            if (cancel.length === 0) return null
            return (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: '#FEE2E2', color: '#DC2626' }}>❌ Cancelados / notas</span>
                  <span className="text-xs text-gray-400 font-semibold">{cancel.length}</span>
                </div>
                <div className="space-y-2">{cancel.map(s => <Card key={s.id} s={s} />)}</div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ETAPAS.map(etapa => {
            const items = sessions.filter(s => s.status !== 'cancelado' && s.stage === etapa.key)
            return (
              <div key={etapa.key} className="flex-shrink-0 w-56">
                <div className="text-[11px] font-black px-3 py-1.5 rounded-xl mb-2 text-center" style={{ background: etapa.bg, color: etapa.color }}>
                  {etapa.emoji} {etapa.label} ({items.length})
                </div>
                <div className="space-y-2">
                  {items.map(s => <Card key={s.id} s={s} />)}
                  {items.length === 0 && (
                    <div className="bg-gray-50 rounded-xl p-4 text-center text-[10px] text-gray-300 flex flex-col items-center gap-1">
                      <Package size={16} className="opacity-40" /> vacío
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
