import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useKrossStore } from '../../store'

export default function ChatsVendedorPage() {
  const navigate = useNavigate()
  const { chats, clientes, productos, pedidos, currentUser, tiendas, vendedoras } = useKrossStore()
  const [search, setSearch] = useState('')

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const vendedora = vendedoras.find(v => v.id === currentUser.id)

  let tiendaChats = chats.filter(c => c.tiendaId === tienda?.id)
  if (vendedora?.alcance === 'solo_asignados') {
    tiendaChats = tiendaChats.filter(c => c.vendedoraAsignadaId === vendedora.id)
  }

  const filtered = tiendaChats.filter(chat => {
    const cliente = clientes.find(c => c.id === chat.clienteId)
    const producto = productos.find(p => p.id === chat.productoId)
    return (
      cliente?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      producto?.nombre.toLowerCase().includes(search.toLowerCase())
    )
  })

  const etapaLabel: Record<string, string> = {
    nuevo: 'Nuevo', asesorando: 'Asesorando', confirmo: 'Confirmado',
    despacho: 'Despacho', ruta: 'En ruta', destino: 'Destino',
    entregado: 'Entregado', cancelado: 'Cancelado'
  }

  const etapaColor: Record<string, string> = {
    nuevo: 'bg-blue-100 text-blue-700', asesorando: 'bg-amber-100 text-amber-700',
    confirmo: 'bg-green-100 text-green-700', despacho: 'bg-purple-100 text-purple-700',
    ruta: 'bg-indigo-100 text-indigo-700', destino: 'bg-cyan-100 text-cyan-700',
    entregado: 'bg-green-200 text-green-800', cancelado: 'bg-red-100 text-red-700'
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-4">Chats de clientes</h1>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente o producto..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-200"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No hay chats que coincidan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(chat => {
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
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-lg font-black flex-shrink-0">
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
        </div>
      )}
    </div>
  )
}
