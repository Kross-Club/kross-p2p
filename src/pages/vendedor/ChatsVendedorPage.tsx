import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { supabase } from '../../lib/supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface SupabaseSession {
  id: string
  token: string
  buyer_id: string | null
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  stage: string
  created_at: string
  seller_name?: string | null
  seller_role?: string | null
  nota?: string | null
  assigned_seller_id?: string | null
  writer_seller_ids?: string[] | null
  chat_messages: { id: string; sender_role: string; type: string; body: string | null; created_at: string; read_at: string | null }[]
}

const NOTA_META: Record<string, { label: string; color: string }> = {
  no_contesta: { label: 'No contesta', color: '#F59E0B' },
  recuperado: { label: 'Recuperado', color: '#16A34A' },
  cancelado: { label: 'Cancelado', color: '#DC2626' },
  anulado: { label: 'Anulado', color: '#6B7280' },
}

const stageColor: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-green-100 text-green-700',
  preparando: 'bg-amber-100 text-amber-700',
  en_camino: 'bg-indigo-100 text-indigo-700',
  entregado: 'bg-green-200 text-green-800',
}
const stageLabel: Record<string, string> = {
  nuevo: 'Nuevo', confirmado: 'Confirmado', preparando: 'Preparando',
  en_camino: 'En camino', entregado: 'Entregado',
}

export default function ChatsVendedorPage() {
  const navigate = useNavigate()
  const { effective, isAdmin, impersonating } = useSeller()
  const [search, setSearch] = useState('')
  const [sessions, setSessions] = useState<SupabaseSession[]>([])
  const [loading, setLoading] = useState(true)
  const [onlineBuyers, setOnlineBuyers] = useState<Set<string>>(new Set())
  const [bumps, setBumps] = useState<Record<string, number>>({})
  const seenRef = useRef<Set<string>>(new Set())

  // Live presence of all buyers → green dot on active chats
  useEffect(() => {
    const ch = supabase
      .channel('presence:buyers')
      .on('presence', { event: 'sync' }, () => {
        setOnlineBuyers(new Set(Object.keys(ch.presenceState())))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Each team member sees only the leads assigned to them (Ventas: new leads,
  // Despacho: confirmed, Motorizado: en camino). The admin (not impersonating)
  // sees every order in the store.
  const onlyMine = !!effective && !(isAdmin && !impersonating)

  useEffect(() => {
    if (!effective) return
    setLoading(true)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${ANON}`,
      'x-store-id': effective.store_id,
    }
    if (onlyMine) headers['x-seller-id'] = effective.auth_user_id

    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((data: SupabaseSession[]) => {
        setSessions(Array.isArray(data) ? data : [])
        setBumps({}); seenRef.current.clear()
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [effective?.auth_user_id, effective?.store_id, onlyMine])

  // Live unread: listen to each order's channel and bump the counter in real time
  const sessionIds = sessions.map(s => s.id).join(',')
  useEffect(() => {
    if (sessions.length === 0) return
    const channels = sessions.map(s =>
      supabase.channel(`order:${s.id}`)
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
          const m = payload as { id: string; sender_role: string }
          if (m.sender_role !== 'buyer' || seenRef.current.has(m.id)) return
          seenRef.current.add(m.id)
          setBumps(b => ({ ...b, [s.id]: (b[s.id] ?? 0) + 1 }))
        })
        .subscribe()
    )
    return () => channels.forEach(c => supabase.removeChannel(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds])

  const filtered = sessions.filter(s =>
    !search ||
    s.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_name?.toLowerCase().includes(search.toLowerCase())
  )

  const scopeLabel = onlyMine ? 'Tus pedidos asignados' : 'Todos los pedidos de la tienda'

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-1">Chats de clientes</h1>
      <p className="text-xs text-gray-400 mb-4">{scopeLabel}</p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente o producto..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {onlyMine ? 'Aún no tienes pedidos asignados' : 'No hay pedidos que coincidan'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(session => {
            const meId = effective?.auth_user_id
            const readOnly = !isAdmin
              && session.assigned_seller_id !== meId
              && !(session.writer_seller_ids ?? []).includes(meId ?? '')
            const lastMsg = session.chat_messages?.slice(-1)[0]
            const preview = lastMsg?.type === 'text' ? lastMsg.body : lastMsg?.type === 'audio' ? '🎵 Audio' : 'Sin mensajes'
            const baseUnread = session.chat_messages?.filter(m => m.sender_role === 'buyer' && !m.read_at).length ?? 0
            const unread = baseUnread + (bumps[session.id] ?? 0)
            const timeAgo = new Date(session.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
            const online = !!session.buyer_id && onlineBuyers.has(session.buyer_id)

            return (
              <button
                key={session.id}
                onClick={() => navigate(`/vendedor/pedido/${session.token}`)}
                className="w-full bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left"
                style={{ borderColor: 'var(--brand)', borderWidth: '1.5px' }}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-black"
                    style={{ background: '#FFD400', color: '#111' }}>
                    {(session.buyer_name || 'C')[0]}
                  </div>
                  {online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                      style={{ background: '#4ADE80' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-gray-800 text-sm truncate">{session.buyer_name || 'Comprador'}</p>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      {unread > 0 && (
                        <span className="w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center"
                          style={{ background: 'var(--brand)' }}>{unread}</span>
                      )}
                      {session.nota && NOTA_META[session.nota] && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: `${NOTA_META[session.nota].color}22`, color: NOTA_META[session.nota].color }}>
                          {NOTA_META[session.nota].label}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${stageColor[session.stage] || 'bg-gray-100 text-gray-500'}`}>
                        {stageLabel[session.stage] || session.stage}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">
                    {readOnly && <span className="font-bold" style={{ color: '#863bff' }}>👁 {session.seller_role || 'En otro rol'} · </span>}
                    {session.product_name} · {session.pack_name || `S/${session.product_price}`}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 truncate flex-1">{preview}</p>
                    <span className="text-[10px] text-gray-300 flex-shrink-0 ml-1">{timeAgo}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}
