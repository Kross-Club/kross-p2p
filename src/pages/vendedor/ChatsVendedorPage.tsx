import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight, Phone } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface SupabaseSession {
  id: string
  token: string
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  stage: string
  created_at: string
  seller_name?: string | null
  seller_role?: string | null
  assigned_seller_id?: string | null
  writer_seller_ids?: string[] | null
  chat_messages: { id: string; sender_role: string; type: string; body: string | null; created_at: string; read_at: string | null }[]
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
      .then((data: SupabaseSession[]) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [effective?.auth_user_id, effective?.store_id, onlyMine])

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
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#55C8F5]/30"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" />
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
            const unread = session.chat_messages?.filter(m => m.sender_role === 'buyer' && !m.read_at).length ?? 0
            const timeAgo = new Date(session.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

            return (
              <button
                key={session.id}
                onClick={() => navigate(`/vendedor/pedido/${session.token}`)}
                className="w-full bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left"
                style={{ borderColor: '#55C8F5', borderWidth: '1.5px' }}
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-black flex-shrink-0"
                  style={{ background: '#FFD400', color: '#111' }}>
                  {(session.buyer_name || 'C')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-gray-800 text-sm truncate">{session.buyer_name || 'Comprador'}</p>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      {unread > 0 && (
                        <span className="w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center"
                          style={{ background: '#55C8F5' }}>{unread}</span>
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

      <div className="mt-6 flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100">
        <Phone size={12} style={{ color: '#55C8F5' }} />
        <p className="text-[10px] text-gray-400">Cuando un cliente llame, verás el popup de llamada entrante aquí</p>
      </div>
    </div>
  )
}
