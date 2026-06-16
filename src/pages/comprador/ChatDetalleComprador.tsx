import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Star } from 'lucide-react'
import { useState } from 'react'
import { useKrossStore } from '../../store'
import ChatView from '../../components/ChatView'

export default function ChatDetalleComprador() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const { chats, pedidos, tiendas, currentUser, clientes, marcarRecibido, addValoracion, addReclamo } = useKrossStore()

  const chat = chats.find(c => c.id === chatId)
  const pedido = pedidos.find(p => p.chatId === chatId)
  const tienda = chat ? tiendas.find(t => t.id === chat.tiendaId) : null
  const cliente = clientes.find(c => c.usuarioId === currentUser.id)

  const [showValoracion, setShowValoracion] = useState(false)
  const [estrellas, setEstrellas] = useState(5)
  const [comentario, setComentario] = useState('')
  const [showReclamo, setShowReclamo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [scoreAnimado, setScoreAnimado] = useState(false)

  if (!chat) return <div className="p-4 text-gray-400">Chat no encontrado</div>

  const handleMarcarRecibido = () => {
    if (pedido) {
      marcarRecibido(pedido.id)
      setScoreAnimado(true)
      setTimeout(() => setScoreAnimado(false), 3000)
    }
  }

  const handleValoracion = () => {
    if (!pedido || !cliente) return
    addValoracion({ productoId: pedido.productoId, clienteId: cliente.id, estrellas, comentario, fecha: new Date().toISOString().split('T')[0] })
    setShowValoracion(false)
  }

  const handleReclamo = () => {
    if (!pedido || !cliente) return
    addReclamo({ pedidoId: pedido.id, clienteId: cliente.id, motivo, estado: 'abierto', fecha: new Date().toISOString().split('T')[0] })
    setShowReclamo(false)
  }

  const etapaLabels: Record<string, string> = {
    nuevo: 'Pedido nuevo', asesorando: 'Asesorando', confirmo: 'Confirmado',
    despacho: 'En despacho', ruta: 'En ruta', destino: 'En destino',
    entregado: 'Entregado', cancelado: 'Cancelado'
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-xl">
            {tienda?.logo}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">{tienda?.nombre}</p>
            {pedido && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                pedido.etapa === 'entregado' ? 'bg-green-100 text-green-700' :
                pedido.etapa === 'cancelado' ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {etapaLabels[pedido.etapa]}
              </span>
            )}
          </div>
        </div>
      </div>

      {scoreAnimado && (
        <div className="bg-green-500 text-white text-center py-2 px-4 text-sm font-semibold animate-pulse">
          🎉 ¡+10 puntos! Tu score subió. ¡Sigue así!
        </div>
      )}

      {pedido?.etapa === 'entregado' && !pedido.clienteMarcoRecibido && (
        <div className="px-4 py-3 bg-green-50 border-b border-green-100">
          <p className="text-sm text-green-800 font-medium mb-2">¿Ya recibiste tu pedido?</p>
          <div className="flex gap-2">
            <button onClick={handleMarcarRecibido} className="flex items-center gap-1 bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <CheckCircle size={14} /> Sí, ya llegó ✓
            </button>
            <button onClick={() => setShowReclamo(true)} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-medium border border-red-200">
              Hay un problema
            </button>
          </div>
        </div>
      )}

      {pedido?.clienteMarcoRecibido && (
        <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
          <p className="text-sm text-green-700 font-medium">✓ Marcaste como recibido</p>
          <button onClick={() => setShowValoracion(true)} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
            <Star size={12} /> Valorar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ChatView chat={chat} />
      </div>

      {showValoracion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">¿Cómo fue tu experiencia?</h3>
            <div className="flex gap-2 mb-4">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setEstrellas(n)}>
                  <Star size={28} className={n <= estrellas ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                </button>
              ))}
            </div>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Cuéntanos más (opcional)..." className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm resize-none h-20 outline-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowValoracion(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium">Cancelar</button>
              <button onClick={handleValoracion} className="flex-1 py-3 rounded-2xl bg-green-500 text-white font-bold text-sm">Enviar valoración</button>
            </div>
          </div>
        </div>
      )}

      {showReclamo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">¿Cuál es el problema?</h3>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el problema..." className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm resize-none h-24 outline-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowReclamo(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium">Cancelar</button>
              <button onClick={handleReclamo} disabled={!motivo.trim()} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm disabled:opacity-50">Enviar reclamo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
