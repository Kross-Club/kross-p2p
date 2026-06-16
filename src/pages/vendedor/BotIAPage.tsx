import { useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { useKrossStore } from '../../store'

export default function BotIAPage() {
  const { bots, configsIA, tiendas, currentUser, updateBotPaso, updateConfigIA } = useKrossStore()
  const [tab, setTab] = useState<'bot' | 'ia'>('bot')

  const tienda = tiendas.find(t => t.dueno_id === currentUser.id || currentUser.tiendaId === t.id)
  const bot = bots.find(b => b.tiendaId === tienda?.id)
  const ia = configsIA.find(c => c.tiendaId === tienda?.id)

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-4">Automatización</h1>

      <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
        <button
          onClick={() => setTab('bot')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'bot' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
        >
          <Bot size={16} /> Bot de respuestas
        </button>
        <button
          onClick={() => setTab('ia')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'ia' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
        >
          <Sparkles size={16} /> IA Kross
        </button>
      </div>

      {tab === 'bot' && bot && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <p className="font-bold text-gray-800 mb-1">{bot.nombre}</p>
            <p className="text-xs text-gray-500">Este bot responde automáticamente cuando un cliente abre el chat.</p>
          </div>

          {bot.pasos.map((paso, i) => (
            <div key={paso.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Paso {i + 1}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Pregunta al cliente</label>
                  <input
                    value={paso.pregunta}
                    onChange={e => updateBotPaso(bot.id, i, 'pregunta', e.target.value)}
                    className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-2 block">Opciones de respuesta</label>
                  {paso.opciones.map((op, j) => (
                    <div key={j} className="mb-2">
                      <input
                        value={op}
                        onChange={e => {
                          const newOps = [...paso.opciones]
                          newOps[j] = e.target.value
                          updateBotPaso(bot.id, i, 'opciones', newOps)
                        }}
                        placeholder={`Opción ${j + 1}`}
                        className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200 mb-1"
                      />
                      <textarea
                        value={paso.respuestas[op] || ''}
                        onChange={e => {
                          const newResp = { ...paso.respuestas, [op]: e.target.value }
                          updateBotPaso(bot.id, i, 'respuestas', newResp)
                        }}
                        placeholder="Respuesta automática..."
                        rows={2}
                        className="w-full bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs outline-none resize-none focus:ring-2 focus:ring-green-200"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ia' && ia && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-500" />
                <p className="font-bold text-gray-800">IA Kross</p>
              </div>
              <button
                onClick={() => updateConfigIA(ia.id, { estado: ia.estado === 'activo' ? 'inactivo' : 'activo' })}
                className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${ia.estado === 'activo' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {ia.estado === 'activo' ? 'Activa' : 'Inactiva'}
              </button>
            </div>
            <p className="text-xs text-gray-500">La IA aprende sobre tu tienda y puede responder a clientes de forma natural.</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-black text-gray-600 uppercase tracking-wider mb-2 block">
              Instrucciones para la IA
            </label>
            <textarea
              value={ia.instrucciones}
              onChange={e => updateConfigIA(ia.id, { instrucciones: e.target.value })}
              rows={5}
              placeholder="Ej: Eres la asistente de mi tienda. Vendemos bebidas naturales en Lima..."
              className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none resize-none focus:ring-2 focus:ring-purple-200"
            />
            <p className="text-[10px] text-gray-400 mt-1">Cuéntale a la IA quién eres, qué vendes y cómo debes responder.</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <span className="text-lg">💌</span> Recontacto inteligente
            </p>
            <p className="text-xs text-gray-400 mb-3">Reactiva clientes que no han respondido con un mensaje creativo.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Intención creativa</label>
                <input
                  value={ia.recontacto.intencion}
                  onChange={e => updateConfigIA(ia.id, { recontacto: { ...ia.recontacto, intencion: e.target.value } })}
                  className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Mensaje abridor</label>
                <textarea
                  value={ia.recontacto.mensajeAbridor}
                  onChange={e => updateConfigIA(ia.id, { recontacto: { ...ia.recontacto, mensajeAbridor: e.target.value } })}
                  rows={3}
                  className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-purple-200"
                />
                <p className="text-[10px] text-gray-400 mt-1">Usa [nombre] para insertar el nombre del cliente.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
