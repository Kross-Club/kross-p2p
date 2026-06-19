import { useNavigate } from 'react-router-dom'
import { ToggleLeft, ToggleRight, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { useKrossStore } from '../../store'

export default function ProductosPage() {
  const navigate = useNavigate()
  const { productos, landings, tiendas, currentUser, toggleProduct } = useKrossStore()

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const misProd = productos.filter(p => p.tiendaId === tienda?.id)

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black mb-0.5" style={{ color: '#111111' }}>Mis productos</h1>
      <p className="text-sm mb-4" style={{ color: '#55C8F5', fontWeight: 700 }}>{tienda?.nombre}</p>

      <div className="space-y-3">
        {misProd.map(prod => {
          const landing = landings.find(l => l.id === prod.landingId)
          const pendiente = landing?.estadoAprobacion === 'pendiente_aprobacion'

          return (
            <div key={prod.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: '1.5px solid #F0F0F0' }}>
              <div className="flex items-start gap-3">
                {/* Miniatura imagen real */}
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100">
                  <img
                    src={prod.imagenes[0]}
                    alt={prod.nombre}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const t = e.target as HTMLImageElement
                      t.style.display = 'none'
                      t.parentElement!.style.background = '#55C8F5'
                      t.parentElement!.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px">${prod.nombre[0]}</div>`
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-sm leading-tight" style={{ color: '#111111' }}>{prod.nombre}</p>
                    <button
                      onClick={() => toggleProduct(prod.id)}
                      className="flex-shrink-0 transition-colors"
                      style={{ color: prod.estado === 'activo' ? '#55C8F5' : '#D1D5DB' }}
                    >
                      {prod.estado === 'activo'
                        ? <ToggleRight size={28} />
                        : <ToggleLeft size={28} />
                      }
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{prod.descripcion}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-black text-base" style={{ color: '#55C8F5' }}>S/{prod.precio}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={prod.estado === 'activo'
                        ? { background: '#FFF8D6', color: '#B8960C' }
                        : { background: '#F3F4F6', color: '#9CA3AF' }
                      }
                    >
                      {prod.estado === 'activo' ? '● Activo' : '○ Inactivo'}
                    </span>
                  </div>
                </div>
              </div>

              {landing && (
                <div
                  className="mt-3 flex items-center justify-between p-2.5 rounded-xl"
                  style={pendiente
                    ? { background: '#FFFBE6', border: '1px solid #FFD400' }
                    : { background: '#EEF9FF', border: '1px solid #55C8F5' }
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {pendiente
                      ? <AlertCircle size={13} style={{ color: '#FFD400' }} />
                      : <CheckCircle size={13} style={{ color: '#55C8F5' }} />
                    }
                    <p className="text-[11px] font-semibold text-gray-600">
                      {pendiente ? 'Pendiente de aprobación Kross' : 'Landing aprobada por Kross'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/landing/${landing.id}`)}
                    className="flex items-center gap-1 text-[10px] font-black"
                    style={{ color: '#55C8F5' }}
                  >
                    Ver <ExternalLink size={10} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
