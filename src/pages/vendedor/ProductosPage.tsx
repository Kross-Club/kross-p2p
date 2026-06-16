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
      <h1 className="text-xl font-black text-gray-900 mb-1">Mis productos</h1>
      <p className="text-sm text-gray-400 mb-4">{tienda?.nombre}</p>

      <div className="space-y-3">
        {misProd.map(prod => {
          const landing = landings.find(l => l.id === prod.landingId)
          const pendiente = landing?.estadoAprobacion === 'pendiente_aprobacion'

          return (
            <div key={prod.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-3xl flex-shrink-0">
                  {prod.imagenes[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-900 text-sm leading-tight">{prod.nombre}</p>
                    <button
                      onClick={() => toggleProduct(prod.id)}
                      className={`flex-shrink-0 transition-colors ${prod.estado === 'activo' ? 'text-green-500' : 'text-gray-300'}`}
                    >
                      {prod.estado === 'activo'
                        ? <ToggleRight size={28} />
                        : <ToggleLeft size={28} />
                      }
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{prod.descripcion}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-green-600 font-black text-base">S/{prod.precio}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      prod.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {prod.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Landing status */}
              {landing && (
                <div className={`mt-3 flex items-center justify-between p-2.5 rounded-xl ${
                  pendiente ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-100'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {pendiente
                      ? <AlertCircle size={13} className="text-amber-500" />
                      : <CheckCircle size={13} className="text-green-500" />
                    }
                    <p className="text-[11px] font-medium text-gray-600">
                      {pendiente ? 'Pendiente de aprobación Kross' : 'Landing aprobada por Kross'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/landing/${landing.id}`)}
                    className="flex items-center gap-1 text-[10px] font-bold text-green-600"
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
