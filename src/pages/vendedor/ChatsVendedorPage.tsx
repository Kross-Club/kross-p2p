import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight, Phone } from 'lucide-react'
import { useKrossStore } from '../../store'

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
  const { chats, clientes, productos, pedidos, currentUser, tiendas, vendedoras } = useKrossStore()
  const [search, setSearch] = useState('')
  const [supabaseSessions, setSupabaseSessions] = useState<SupabaseSession[]>([])
  const [loadingReal, setLoadingReal] = useState(false)

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const storeId = tienda?.id ?? currentUser.tiendaId

  // Load real Supabase sessions for this store
  useEffect(() => {
    if (!storeId) return
    setLoadingReal(true)
    fetch(`${BASE}/get-store-sessions`, {
      headers: { Authorization: `Bearer ${ANON}`, 'x-store-id': storeId, 'x-seller-id': currentUser.id },
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: SupabaseSession[]) => setSupabaseSessions(data))
      .catch(() => {})
      .finally(() => setLoadingReal(false))
  }, [storeId])

  // Mock chats
  const vendedora = vendedoras.find(v => v.id === currentUser.id)
  let tiendaChats = chats.filter(c => c.tiendaId === tienda?.id)
  if (vendedora?.alcance === 'solo_asignados') {
    tiendaChats = tiendaChats.filter(c => c.vendedoraAsignadaId === vendedora.id)
  }
  const filteredMock = tiendaChats.filter(chat => {
    const cliente = clientes.find(c => c.id === chat.clienteId)
    const producto = productos.find(p => p.id === chat.productoId)
    return (
      !search ||
      cliente?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      producto?.nombre.toLowerCase().includes(search.toLowerCase())
    )
  })

  const filteredReal = supabaseSessions.filter(s =>
    !search ||
    s.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_name?.toLowerCase().includes(search.toLowerCase())
  )

  const etapaColor: Record<string, string> = {
    nuevo: 'bg-blue-100 text-blue-700', asesorando: 'bg-amber-100 text-amber-700',
    confirmo: 'bg-green-100 text-green-700', despacho: 'bg-purple-100 text-purple-700',
    ruta: 'bg-indigo-100 text-indigo-700', destino: 'bg-cyan-100 text-cyan-700',
    entregado: 'bg-green-200 text-green-800', cancelado: 'bg-red-100 text-red-700'
  }
  const etapaLabel: Record<string, string> = {
    nuevo: 'Nuevo', asesorando: 'Asesorando', confirmo: 'Confirmado',
    despacho: 'Despacho', ruta: 'En ruta', destino: 'Destino',
    entregado: 'Entregado', cancelado: 'Cancelado'
  }

  const totalCount = filteredMock.length + filteredReal.length

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-4">Chats de clientes</h1>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente o producto..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#55C8F5]/30"
        />
      </div>

      {totalCount === 0 && !loadingReal ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No hay chats que coincidan</p>
        </div>
      ) : (
        <div className="space-y-3">

          {/* Real Supabase sessions */}
          {filteredReal.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">Pedidos reales</p>
              {filteredReal.map(session => {
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
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-black flex-shrink-0"
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
                      <p className="text-[11px] text-gray-400 truncate">{session.product_name} · {session.pack_name || `S/${session.product_price}`}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500 truncate flex-1">{preview}</p>
                        <span className="text-[10px] text-gray-300 flex-shrink-0 ml-1">{timeAgo}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </button>
                )
              })}
            </>
          )}

          {loadingReal && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-[#55C8F5] animate-spin" />
            </div>
          )}

          {/* Mock chats */}
          {filteredMock.length > 0 && (
            <>
              {filteredReal.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1 pt-2">Demo</p>
              )}
              {filteredMock.map(chat => {
                const cliente = clientes.find(c => c.id === chat.clienteId)
                const producto = productos.find(p => p.id === chat.productoId)
                const pedido = pedidos.find(p => p.chatId === chat.id)
                const lastMsg = chat.mensajes[chat.mensajes.length - 1]
                const preview = lastMsg?.tipo === 'texto' ? (lastMsg.contenido as string) : '🎵 Mensaje de audio'

                return (
                  <button
                    key={chat.id}
                    onClick={() => navigate(`/vendedor/chat/${chat.id}`)}
                    className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#55C8F5] to-[#2BB5EE] flex items-center justify-center text-white text-lg font-black flex-shrink-0">
                      {(cliente?.nombre || 'C')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-semibold text-gray-800 text-sm truncate">{cliente?.nombre}</p>
                        {pedido && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-1 flex-shrink-0 ${etapaColor[pedido.etapa] || 'bg-gray-100 text-gray-500'}`}>
                            {etapaLabel[pedido.etapa]}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{producto?.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">{preview}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Call tip */}
      <div className="mt-6 flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100">
        <Phone size={12} style={{ color: '#55C8F5' }} />
        <p className="text-[10px] text-gray-400">Cuando un cliente llame, verás el popup de llamada entrante aquí</p>
      </div>
    </div>
  )
}
