import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Package } from 'lucide-react'
import { useKrossStore } from '../../store'
import ChatView from '../../components/ChatView'

const ETAPAS = ['nuevo', 'asesorando', 'confirmo', 'despacho', 'ruta', 'destino', 'entregado', 'cancelado'] as const
const ETAPA_LABELS: Record<string, string> = {
  nuevo: 'Pedido nuevo', asesorando: 'Asesorando', confirmo: 'Confirmó',
  despacho: 'En despacho', ruta: 'En ruta', destino: 'En destino',
  entregado: 'Entregado', cancelado: 'Cancelado'
}

export default function ChatDetalleVendedor() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const { chats, pedidos, clientes, productos, moveOrderStage } = useKrossStore()

  const chat = chats.find(c => c.id === chatId)
  const pedido = pedidos.find(p => p.chatId === chatId)
  const cliente = clientes.find(c => c.id === chat?.clienteId)
  const producto = productos.find(p => p.id === pedido?.productoId)

  if (!chat) return <div className="p-4 text-gray-400">Chat no encontrado</div>

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black flex-shrink-0">
            {(cliente?.nombre || 'C')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <User size={10} className="text-gray-400" />
              <p className="font-semibold text-gray-800 text-sm truncate">{cliente?.nombre}</p>
            </div>
            <div className="flex items-center gap-1">
              <Package size={10} className="text-gray-400" />
              <p className="text-xs text-gray-400 truncate">{producto?.nombre}</p>
            </div>
          </div>
          {cliente && (
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-400">Score</p>
              <p className="text-sm font-black text-green-600">{cliente.score}</p>
            </div>
          )}
        </div>
      </div>

      {pedido && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Etapa del pedido</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {ETAPAS.map(etapa => (
              <button
                key={etapa}
                onClick={() => moveOrderStage(pedido.id, etapa)}
                className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all ${
                  pedido.etapa === etapa
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-green-300'
                }`}
              >
                {ETAPA_LABELS[etapa]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ChatView chat={chat} isVendedor />
      </div>
    </div>
  )
}
