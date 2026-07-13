import { useNavigate } from 'react-router-dom'
import { MessageCircle, ChevronRight } from 'lucide-react'
import { useKrossStore } from '../../store'

export default function ChatsPage() {
  const navigate = useNavigate()
  const { chats, currentUser, clientes, tiendas, productos } = useKrossStore()

  const cliente = clientes.find(c => c.usuarioId === currentUser.id)
  const misChats = chats.filter(c => c.clienteId === cliente?.id)

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
        <MessageCircle size={48} className="text-[var(--brand)]/30 mb-4" />
        <p className="text-gray-500 text-sm">Aún no tienes chats. Busca un producto y empieza a chatear.</p>
        <button onClick={() => navigate('/landing/l1')} className="mt-4 bg-[var(--brand)] text-white px-6 py-3 rounded-2xl font-bold text-sm">
          Ver productos
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-4">Mis chats</h1>

      {misChats.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="text-[var(--brand)]/30 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No tienes chats abiertos aún.</p>
          <button onClick={() => navigate('/landing/l1')} className="mt-4 bg-[var(--brand)] text-white px-6 py-3 rounded-2xl font-bold text-sm">
            Ver productos
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {misChats.map(chat => {
            const tienda = tiendas.find(t => t.id === chat.tiendaId)
            const producto = productos.find(p => p.id === chat.productoId)
            const lastMsg = chat.mensajes[chat.mensajes.length - 1]
            const preview = lastMsg?.tipo === 'texto' ? (lastMsg.contenido as string) : '🎵 Mensaje de audio'

            return (
              <button
                key={chat.id}
                onClick={() => navigate(`/comprador/chat/${chat.id}`)}
                className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#EEF9FF] flex items-center justify-center text-2xl flex-shrink-0">
                  {tienda?.logo || '🏪'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800 text-sm truncate">{tienda?.nombre}</p>
                    <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">
                      {lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{producto?.nombre}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{preview}</p>
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
