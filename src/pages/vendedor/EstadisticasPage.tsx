import { useKrossStore } from '../../store'
import { TrendingUp, MessageCircle, Clock, Star, AlertTriangle } from 'lucide-react'

const MOCK_ENTREGAS = [
  { dia: 'Lun', valor: 2 }, { dia: 'Mar', valor: 4 }, { dia: 'Mié', valor: 3 },
  { dia: 'Jue', valor: 6 }, { dia: 'Vie', valor: 5 }, { dia: 'Sáb', valor: 8 }, { dia: 'Dom', valor: 3 },
]

export default function EstadisticasPage() {
  const { pedidos, chats, valoraciones, reclamos, tiendas, currentUser } = useKrossStore()

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const misPedidos = pedidos.filter(p => p.tiendaId === tienda?.id)
  const misChats = chats.filter(c => c.tiendaId === tienda?.id)

  const entregados = misPedidos.filter(p => p.etapa === 'entregado').length
  const cancelados = misPedidos.filter(p => p.etapa === 'cancelado').length
  const chatsActivos = misChats.filter(c => c.estado === 'activo').length

  const avgValoracion = valoraciones.length
    ? (valoraciones.reduce((s, v) => s + v.estrellas, 0) / valoraciones.length).toFixed(1)
    : '—'

  const maxEntregas = Math.max(...MOCK_ENTREGAS.map(d => d.valor))

  const MetricCard = ({ icon: Icon, label, value, sub, color }: { icon: typeof TrendingUp; label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-1">Estadísticas</h1>
      <p className="text-sm text-gray-400 mb-5">Últimos 7 días</p>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <MetricCard icon={TrendingUp} label="Entregados" value={entregados} sub={`${cancelados} cancelados`} color="bg-green-500" />
        <MetricCard icon={MessageCircle} label="Chats activos" value={chatsActivos} sub={`${misChats.length} total`} color="bg-blue-500" />
        <MetricCard icon={Clock} label="Tiempo promedio" value="4.2h" sub="Pedido → Confirmado" color="bg-purple-500" />
        <MetricCard icon={Star} label="Valoración" value={avgValoracion} sub={`${valoraciones.length} reseñas`} color="bg-amber-500" />
      </div>

      {/* Gráfico entregas */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-bold text-gray-800 mb-4 text-sm">Entregas por día</p>
        <div className="flex items-end gap-2 h-28">
          {MOCK_ENTREGAS.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-gray-600">{d.valor}</span>
              <div
                className="w-full bg-green-500 rounded-t-lg transition-all"
                style={{ height: `${(d.valor / maxEntregas) * 80}px` }}
              />
              <span className="text-[9px] text-gray-400">{d.dia}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tiempo proceso */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-bold text-gray-800 mb-3 text-sm">Tiempo del proceso completo</p>
        <div className="space-y-2">
          {[
            { label: 'Pedido → Confirmado', valor: '4.2h', pct: 40 },
            { label: 'Confirmado → Entregado', valor: '18h', pct: 80 },
            { label: 'Total (nuevo → entregado)', valor: '22h', pct: 100 },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-bold text-gray-800">{item.valor}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reclamos */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={14} className="text-amber-500" />
          <p className="font-bold text-gray-800 text-sm">Reclamos</p>
        </div>
        {reclamos.length === 0 ? (
          <p className="text-xs text-gray-400">Sin reclamos 🎉</p>
        ) : (
          <div className="space-y-2">
            {reclamos.map(r => (
              <div key={r.id} className="flex items-center justify-between">
                <p className="text-xs text-gray-600 flex-1">{r.motivo}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 ${
                  r.estado === 'resuelto' ? 'bg-green-100 text-green-700' :
                  r.estado === 'en_revision' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {r.estado.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
