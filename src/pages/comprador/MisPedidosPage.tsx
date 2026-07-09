import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, ChevronRight, Star, LogOut } from 'lucide-react'

const STAGE_LABEL: Record<string, string> = {
  nuevo:      '📋 Pedido recibido',
  confirmado: '📞 Confirmado',
  preparando: '📦 Preparando',
  en_camino:  '🚚 En camino',
  entregado:  '✅ Entregado',
  cancelado:  '❌ Cancelado',
}

const STAGE_COLOR: Record<string, string> = {
  nuevo:      '#FFD400',
  confirmado: '#55C8F5',
  preparando: '#863bff',
  en_camino:  '#FF8C00',
  entregado:  '#4ADE80',
  cancelado:  '#EF4444',
}

interface BuyerSession {
  buyer: {
    id: string
    nombre: string
    phone: string
    score: number
    puntos: number
    address: string | null
  }
  sessions: Array<{
    id: string
    token: string
    order_id: string
    product_name: string
    product_price: number
    pack_name: string | null
    stage: string
    status: string
    created_at: string
    address: string | null
  }>
}

export default function MisPedidosPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<BuyerSession | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) { navigate('/acceso', { replace: true }); return }
    try { setData(JSON.parse(raw)) } catch { navigate('/acceso', { replace: true }) }
  }, [navigate])

  const logout = () => {
    localStorage.removeItem('buyer_session')
    navigate('/acceso', { replace: true })
  }

  if (!data) return null

  const { buyer, sessions } = data
  const scoreColor = buyer.score >= 80 ? '#4ADE80' : buyer.score >= 50 ? '#FFD400' : '#EF4444'
  const scoreLabel = buyer.score >= 80 ? 'Comprador confiable' : buyer.score >= 50 ? 'Comprador estándar' : 'Nuevo comprador'

  return (
    <div className="min-h-screen" style={{ background: '#FFFDF5' }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-6 text-white"
        style={{ background: 'linear-gradient(135deg, #55C8F5 0%, #863bff 100%)' }}>
        <div className="max-w-[430px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Kross" className="w-8 h-8 rounded-xl" />
              <span className="font-black text-xl tracking-tight">kross</span>
            </div>
            <button onClick={logout} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <LogOut size={16} />
            </button>
          </div>

          <p className="text-white/70 text-sm">Hola,</p>
          <h1 className="font-black text-2xl">{buyer.nombre.split(' ')[0]}</h1>

          {/* Score card */}
          <div className="mt-4 p-4 rounded-2xl flex items-center gap-4"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                  strokeDasharray={`${buyer.score} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-black text-sm text-white">{buyer.score}</span>
              </div>
            </div>
            <div>
              <p className="font-black text-white text-sm">{scoreLabel}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Star size={12} fill="#FFD400" color="#FFD400" />
                <span className="text-xs text-white/80">{buyer.puntos} puntos acumulados</span>
              </div>
              {buyer.score < 80 && (
                <p className="text-xs text-white/60 mt-0.5">
                  Sube tu score para recibir sin adelanto
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Orders list */}
      <div className="max-w-[430px] mx-auto px-4 py-5">
        <h2 className="font-black text-lg mb-3" style={{ color: '#111' }}>
          Mis pedidos ({sessions.length})
        </h2>

        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm" style={{ color: '#888' }}>Aún no tienes pedidos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map(s => {
              const date = new Date(s.created_at).toLocaleDateString('es-PE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })
              const stageColor = STAGE_COLOR[s.stage] ?? '#ccc'
              const stageLabel = STAGE_LABEL[s.stage] ?? s.stage

              return (
                <button key={s.id} onClick={() => navigate(`/p/${s.token}`)}
                  className="w-full text-left p-4 rounded-2xl shadow-sm flex items-center gap-3"
                  style={{ background: '#fff', border: '1.5px solid #f0f0f0' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${stageColor}22` }}>
                    <Package size={20} style={{ color: stageColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate" style={{ color: '#111' }}>
                      {s.product_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#888' }}>
                      S/{s.product_price} · {date}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: `${stageColor}22`, color: stageColor }}>
                      {stageLabel}
                    </span>
                  </div>
                  <ChevronRight size={16} style={{ color: '#ccc' }} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
