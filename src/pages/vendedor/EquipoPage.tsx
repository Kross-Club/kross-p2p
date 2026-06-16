import { useState } from 'react'
import { Users, Shield, Eye } from 'lucide-react'
import { useKrossStore } from '../../store'

export default function EquipoPage() {
  const { vendedoras, tiendas, currentUser, updateVendedoraAlcance, usuarios, switchUser } = useKrossStore()
  const [showAdd, setShowAdd] = useState(false)

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const misVendedoras = vendedoras.filter(v => v.tiendaId === tienda?.id)

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">Mi equipo</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-xl"
        >
          + Agregar
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 mb-4">
        <div className="flex items-start gap-2">
          <Eye size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Puedes "entrar" como una vendedora para ver lo que ella ve. Usa el selector de cuenta arriba.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {misVendedoras.map(v => {
          const usuario = usuarios.find(u => u.nombre === v.nombre)
          return (
            <div key={v.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                  {v.nombre[0]}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800">{v.nombre}</p>
                  <p className="text-xs text-gray-400">Vendedora</p>
                </div>
                {usuario && (
                  <button
                    onClick={() => switchUser(usuario.id)}
                    className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 font-bold px-2.5 py-1 rounded-full"
                  >
                    Entrar como ella
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Shield size={11} /> Acceso a chats
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateVendedoraAlcance(v.id, 'todos')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      v.alcance === 'todos'
                        ? 'bg-green-500 text-white border-green-500'
                        : 'border-gray-200 text-gray-500 hover:border-green-300'
                    }`}
                  >
                    Todos los chats
                  </button>
                  <button
                    onClick={() => updateVendedoraAlcance(v.id, 'solo_asignados')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      v.alcance === 'solo_asignados'
                        ? 'bg-amber-400 text-white border-amber-400'
                        : 'border-gray-200 text-gray-500 hover:border-amber-300'
                    }`}
                  >
                    Solo los suyos
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {misVendedoras.length === 0 && (
          <div className="text-center py-12">
            <Users size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Aún no tienes vendedoras en tu equipo.</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">Agregar vendedora</h3>
            <p className="text-sm text-gray-500 mb-4">Funcionalidad de invitación por email — próximamente disponible.</p>
            <button onClick={() => setShowAdd(false)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
