import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, ChevronRight, AlertCircle } from 'lucide-react'
import { useKrossStore } from '../store'
import ChatView from '../components/ChatView'

export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()
  const { landings, productos, currentUser, chats, openNewChat } = useKrossStore()

  const landing = landings.find(l => l.id === landingId)
  const producto = landing ? productos.find(p => p.id === landing.productoId) : null

  const [step, setStep] = useState<'landing' | 'form' | 'chat'>('landing')
  const [nombre, setNombre] = useState(currentUser.tipo === 'comprador' ? currentUser.nombre : '')
  const [direccion, setDireccion] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)

  if (!landing || !producto) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Producto no encontrado</p>
      </div>
    )
  }

  const chat = chatId ? chats.find(c => c.id === chatId) : null

  const handleSolicitarInfo = () => {
    if (step === 'landing') { setStep('form'); return }
    if (!nombre.trim() || !direccion.trim()) return
    const newChatId = openNewChat(currentUser.id, producto.tiendaId, producto.id, landing.id, nombre, direccion)
    setChatId(newChatId)
    setStep('chat')
  }

  if (step === 'chat' && chat) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
        <div className="px-4 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{producto.imagenes[0]}</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{producto.nombre}</p>
              <p className="text-xs text-green-600">Chat abierto ✓</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatView chat={chat} />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 px-6 py-8 text-center">
        <div className="text-6xl mb-4">{producto.imagenes[0]}</div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">{producto.nombre}</h1>
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-black text-green-600">S/{producto.precio}</span>
          {producto.estado === 'inactivo' && (
            <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-full">No disponible</span>
          )}
        </div>
      </div>

      {landing.estadoAprobacion === 'pendiente_aprobacion' && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Esta página está pendiente de aprobación por Kross.</p>
        </div>
      )}

      {/* Descripción */}
      <div className="px-4 py-4">
        <p className="text-gray-600 text-sm leading-relaxed">{landing.descripcionLarga || producto.descripcion}</p>
      </div>

      {/* Ofertas */}
      {landing.ofertas.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="font-bold text-gray-800 mb-3">Opciones</h2>
          <div className="space-y-2">
            {landing.ofertas.map((of, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{of.nombre}</p>
                  <p className="text-xs text-gray-400">{of.descripcion}</p>
                </div>
                <span className="font-black text-green-600">S/{of.precio}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendaciones */}
      {landing.recomendaciones.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="font-bold text-gray-800 mb-3">Lo que dicen nuestros clientes</h2>
          <div className="space-y-3">
            {landing.recomendaciones.map(rec => (
              <div key={rec.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-gray-800 text-sm">{rec.nombre}</p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: rec.estrellas }).map((_, i) => (
                      <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{rec.texto}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      {landing.faq.length > 0 && (
        <div className="px-4 pb-6">
          <h2 className="font-bold text-gray-800 mb-3">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {landing.faq.map((f, i) => (
              <details key={i} className="bg-gray-50 rounded-2xl overflow-hidden">
                <summary className="px-4 py-3 font-medium text-sm text-gray-800 cursor-pointer flex items-center justify-between list-none">
                  {f.pregunta}
                  <ChevronRight size={14} className="text-gray-400" />
                </summary>
                <div className="px-4 pb-3 text-sm text-gray-600">{f.respuesta}</div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 px-4 py-4 z-10">
        {step === 'form' ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Tus datos para continuar</p>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-200"
            />
            <input
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
              placeholder="Tu dirección (ej: Av. Larco 123, Miraflores)"
              className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-200"
            />
            <button
              onClick={handleSolicitarInfo}
              disabled={!nombre.trim() || !direccion.trim()}
              className="w-full bg-green-500 text-white font-bold py-3.5 rounded-2xl text-base shadow-lg shadow-green-200 disabled:opacity-50"
            >
              Abrir chat ahora 💬
            </button>
          </div>
        ) : (
          <button
            onClick={handleSolicitarInfo}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-green-200 active:scale-95 transition-transform"
          >
            Solicitar info y chatear 💬
          </button>
        )}
      </div>
    </div>
  )
}
