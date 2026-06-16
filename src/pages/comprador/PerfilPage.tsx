import { useKrossStore } from '../../store'
import { BENEFICIOS } from '../../data/seed'
import { Lock, CheckCircle, Award, Zap } from 'lucide-react'

export default function PerfilPage() {
  const { currentUser, clientes } = useKrossStore()
  const cliente = clientes.find(c => c.usuarioId === currentUser.id)

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
        <Award size={48} className="text-green-200 mb-4" />
        <p className="text-gray-500 text-sm">Aún no tienes un perfil de comprador. Solicita info de un producto para empezar.</p>
      </div>
    )
  }

  const score = cliente.score
  const getBeneficioStatus = (scoreRequerido: number) => score >= scoreRequerido ? 'desbloqueado' : 'bloqueado'

  const scoreColor = score >= 75 ? 'text-green-600' : score >= 50 ? 'text-amber-500' : 'text-red-400'
  const barColor = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'

  const nextBenefit = BENEFICIOS.find(b => score < b.scoreRequerido)
  const puntosParaSiguiente = nextBenefit ? nextBenefit.scoreRequerido - score : 0

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-3xl font-black text-white mx-auto mb-3 shadow-lg shadow-green-200">
          {cliente.nombre[0]}
        </div>
        <h1 className="text-xl font-black text-gray-900">{cliente.nombre}</h1>
        <p className="text-sm text-gray-400">{cliente.direccion}</p>
      </div>

      {/* Score card */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tu score Kross</p>
            <p className={`text-4xl font-black ${scoreColor}`}>{score}<span className="text-lg font-bold text-gray-300">/100</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Puntos totales</p>
            <p className="text-2xl font-black text-green-600">{cliente.puntos}</p>
          </div>
        </div>

        <div className="bg-white/60 rounded-2xl h-3 overflow-hidden mb-2">
          <div
            className={`h-full rounded-2xl transition-all duration-700 ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>

        {nextBenefit ? (
          <p className="text-xs text-gray-500">
            Te faltan <span className="font-bold text-green-600">{puntosParaSiguiente} puntos</span> para desbloquear{' '}
            <span className="font-semibold">"{nextBenefit.nombre}"</span>
          </p>
        ) : (
          <p className="text-xs text-green-600 font-semibold">🎉 ¡Desbloqueaste todos los beneficios!</p>
        )}
      </div>

      {/* Cómo subir el score */}
      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-green-500" />
          <p className="font-bold text-gray-800 text-sm">¿Cómo subir tu score?</p>
        </div>
        <div className="space-y-2">
          {[
            { accion: 'Confirmar que recibiste tu pedido', puntos: '+100 pts' },
            { accion: 'Completar pedido sin cancelar', puntos: '+50 pts' },
            { accion: 'Dejar una valoración', puntos: '+20 pts' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{item.accion}</p>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{item.puntos}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Beneficios */}
      <div>
        <h2 className="font-black text-gray-900 mb-3">Tus beneficios</h2>
        <div className="space-y-3">
          {BENEFICIOS.map(beneficio => {
            const status = getBeneficioStatus(beneficio.scoreRequerido)
            return (
              <div
                key={beneficio.id}
                className={`rounded-2xl p-4 border transition-all ${
                  status === 'desbloqueado'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    status === 'desbloqueado' ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {status === 'desbloqueado'
                      ? <CheckCircle size={16} className="text-white" />
                      : <Lock size={14} className="text-white" />
                    }
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${status === 'desbloqueado' ? 'text-green-800' : 'text-gray-500'}`}>
                      {beneficio.nombre}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{beneficio.descripcion}</p>
                    {status === 'bloqueado' && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Score mínimo: <span className="font-bold">{beneficio.scoreRequerido}</span>
                      </p>
                    )}
                  </div>
                  {status === 'desbloqueado' && (
                    <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full">ACTIVO</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
