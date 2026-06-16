import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useKrossStore } from '../../store'
import type { PedidoEtapa } from '../../types'

const ETAPAS: { key: PedidoEtapa; label: string; color: string; bg: string }[] = [
  { key: 'nuevo', label: 'Pedido nuevo', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  { key: 'asesorando', label: 'Asesorando', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { key: 'confirmo', label: 'Confirmó', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  { key: 'despacho', label: 'En despacho', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { key: 'ruta', label: 'En ruta', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
  { key: 'destino', label: 'En destino', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
  { key: 'entregado', label: 'Entregado', color: 'text-green-800', bg: 'bg-green-100 border-green-300' },
  { key: 'cancelado', label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
]

export default function CRMPage() {
  const navigate = useNavigate()
  const { pedidos, clientes, productos, tiendas, currentUser, moveOrderStage } = useKrossStore()
  const [view, setView] = useState<'kanban' | 'lista'>('lista')
  const [showMotivoModal, setShowMotivoModal] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const misPedidos = pedidos.filter(p => p.tiendaId === tienda?.id)

  const handleMove = (pedidoId: string, etapa: PedidoEtapa) => {
    if (etapa === 'cancelado') {
      setShowMotivoModal(pedidoId)
    } else {
      moveOrderStage(pedidoId, etapa)
    }
  }

  const confirmCancel = () => {
    if (showMotivoModal) {
      moveOrderStage(showMotivoModal, 'cancelado', motivo)
      setShowMotivoModal(null)
      setMotivo('')
    }
  }

  const PedidoCard = ({ pedido }: { pedido: typeof misPedidos[0] }) => {
    const cliente = clientes.find(c => c.id === pedido.clienteId)
    const producto = productos.find(p => p.id === pedido.productoId)
    const etapaInfo = ETAPAS.find(e => e.key === pedido.etapa)
    const etapaIdx = ETAPAS.findIndex(e => e.key === pedido.etapa)

    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-bold text-gray-800 text-sm">{cliente?.nombre}</p>
            <p className="text-xs text-gray-400">{producto?.nombre}</p>
          </div>
          <span className={`text-[9px] font-bold px-2 py-1 rounded-full border flex-shrink-0 ${etapaInfo?.bg} ${etapaInfo?.color}`}>
            {etapaInfo?.label}
          </span>
        </div>

        {pedido.motivoCancelacion && (
          <p className="text-[10px] text-red-500 mb-2">Motivo: {pedido.motivoCancelacion}</p>
        )}

        <div className="flex gap-1 flex-wrap">
          {pedido.etapa !== 'entregado' && pedido.etapa !== 'cancelado' && (
            <>
              {etapaIdx < ETAPAS.length - 2 && (
                <button
                  onClick={() => handleMove(pedido.id, ETAPAS[etapaIdx + 1].key)}
                  className="text-[10px] bg-green-500 text-white font-bold px-2.5 py-1 rounded-full"
                >
                  → {ETAPAS[etapaIdx + 1].label}
                </button>
              )}
              <button
                onClick={() => handleMove(pedido.id, 'cancelado')}
                className="text-[10px] bg-red-50 text-red-600 border border-red-200 font-medium px-2.5 py-1 rounded-full"
              >
                Cancelar
              </button>
            </>
          )}
          <button
            onClick={() => navigate(`/vendedor/chat/${pedido.chatId}`)}
            className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 font-medium px-2.5 py-1 rounded-full flex items-center gap-1"
          >
            Ver chat <ChevronRight size={9} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">CRM</h1>
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          <button onClick={() => setView('lista')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Lista</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Kanban</button>
        </div>
      </div>

      {view === 'lista' ? (
        <div className="space-y-6">
          {ETAPAS.map(etapa => {
            const pedidosEtapa = misPedidos.filter(p => p.etapa === etapa.key)
            if (pedidosEtapa.length === 0) return null
            return (
              <div key={etapa.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-black px-3 py-1 rounded-full border ${etapa.bg} ${etapa.color}`}>
                    {etapa.label}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">{pedidosEtapa.length}</span>
                </div>
                <div className="space-y-2">
                  {pedidosEtapa.map(p => <PedidoCard key={p.id} pedido={p} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ETAPAS.map(etapa => {
            const pedidosEtapa = misPedidos.filter(p => p.etapa === etapa.key)
            return (
              <div key={etapa.key} className="flex-shrink-0 w-52">
                <div className={`text-[10px] font-black px-3 py-1.5 rounded-xl border mb-2 text-center ${etapa.bg} ${etapa.color}`}>
                  {etapa.label} ({pedidosEtapa.length})
                </div>
                <div className="space-y-2">
                  {pedidosEtapa.map(p => <PedidoCard key={p.id} pedido={p} />)}
                  {pedidosEtapa.length === 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center text-[10px] text-gray-300">vacío</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showMotivoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-6">
            <h3 className="font-bold text-gray-900 mb-2">¿Por qué se cancela?</h3>
            <div className="space-y-2 mb-3">
              {['No contestó en 1 semana', 'Se arrepintió', 'Dirección incorrecta', 'Producto sin stock', 'Otro'].map(m => (
                <button key={m} onClick={() => setMotivo(m)} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${motivo === m ? 'bg-red-50 border-red-400 text-red-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowMotivoModal(null); setMotivo('') }} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium">Cancelar</button>
              <button onClick={confirmCancel} disabled={!motivo} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
