import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Star, Shield, Truck, Zap, CheckCircle, ChevronDown, X, Play, Pause, MessageCircle, List } from 'lucide-react'
import { useKrossStore } from '../store'
import { DEPARTAMENTOS_PERU } from '../data/seed'
import ChatView from '../components/ChatView'

type Step = 'landing' | 'modal' | 'post-registro' | 'chat'

interface FormData {
  nombre: string
  whatsapp: string
  departamento: string
  provincia: string
  distrito: string
  direccion: string
}

// Mini audio placeholder component
function AudioMini({ duracion }: { duracion: string }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="flex items-center gap-3 bg-green-50 rounded-2xl px-4 py-3 w-full max-w-xs">
      <button
        onClick={() => setPlaying(!playing)}
        className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0 shadow-sm"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className="flex items-end gap-0.5 h-5">
          {Array.from({ length: 22 }).map((_, i) => (
            <div
              key={i}
              className={`w-0.5 rounded-full ${playing ? 'bg-green-500' : 'bg-green-300'}`}
              style={{ height: `${[4,8,12,7,14,10,6,16,9,5,13,8,11,15,7,10,4,12,8,6,14,9][i] || 8}px` }}
            />
          ))}
        </div>
        <p className="text-[11px] text-green-600 mt-0.5 font-medium">{duracion}</p>
      </div>
    </div>
  )
}

export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()
  const { landings, productos, tiendas, currentUser, chats, openNewChat } = useKrossStore()

  const landing = landings.find(l => l.id === landingId)
  const producto = landing ? productos.find(p => p.id === landing.productoId) : null
  const tienda = producto ? tiendas.find(t => t.id === producto.tiendaId) : null

  const [step, setStep] = useState<Step>('landing')
  const [form, setForm] = useState<FormData>({
    nombre: currentUser.tipo === 'comprador' ? currentUser.nombre : '',
    whatsapp: '',
    departamento: '',
    provincia: '',
    distrito: '',
    direccion: '',
  })
  const [chatId, setChatId] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const landingRef = useRef<HTMLDivElement>(null)

  if (!landing || !producto) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Producto no encontrado</p>
      </div>
    )
  }

  const chat = chatId ? chats.find(c => c.id === chatId) : null

  const handleSubmit = () => {
    if (!form.nombre || !form.whatsapp || !form.departamento || !form.provincia || !form.distrito || !form.direccion) return
    const newChatId = openNewChat(
      currentUser.id, producto.tiendaId, producto.id, landing.id,
      form.nombre, `${form.direccion}, ${form.distrito}, ${form.provincia}, ${form.departamento}`,
      form.whatsapp
    )
    setChatId(newChatId)
    setStep('post-registro')
  }

  const handleAbrirChat = () => {
    setStep('chat')
  }

  const unidades = Math.floor(Math.random() * 8) + 3

  // ——— POST-REGISTRO VIEW ———
  if (step === 'post-registro' || step === 'chat') {
    const postChat = chatId ? chats.find(c => c.id === chatId) : null
    return (
      <div className="flex flex-col pb-4">
        {/* Header confirmación */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 px-4 py-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
              {tienda?.logo}
            </div>
            <div>
              <p className="font-black text-lg">¡Hola {form.nombre.split(' ')[0]}! 👋</p>
              <p className="text-green-100 text-sm">Tu solicitud fue recibida</p>
            </div>
          </div>
          <div className="bg-white/20 rounded-2xl px-3 py-2 mt-2 flex items-center gap-2">
            <CheckCircle size={16} className="text-green-200" />
            <p className="text-sm text-white font-medium truncate">{producto.nombre}</p>
          </div>
        </div>

        {/* Bot messages */}
        <div className="px-4 py-4 space-y-4">
          {/* Bot header */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-sm">🤖</span>
            </div>
            <p className="text-xs font-semibold text-gray-500">Kross Bot</p>
          </div>

          {/* Texto de bienvenida */}
          <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
            <p className="text-sm text-gray-800">
              Recibimos tu solicitud para <strong>{producto.nombre}</strong> 📦 Aquí tienes más información antes de confirmar:
            </p>
          </div>

          {/* Audio */}
          <AudioMini duracion="0:48" />

          {/* Info card */}
          <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
            <p className="text-sm text-gray-800 font-semibold mb-1">💬 Te explicamos cómo funciona:</p>
            <ul className="space-y-1">
              <li className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span>
                Pago contraentrega disponible — pagas cuando recibes
              </li>
              <li className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span>
                Delivery a {form.departamento || 'todo el Perú'} en 1-3 días hábiles
              </li>
              <li className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span>
                30 días de garantía por defecto de fábrica
              </li>
            </ul>
          </div>

          {/* Precio */}
          <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 max-w-[90%]">
            <p className="text-xs text-gray-500 mb-1">Precio</p>
            {landing.ofertas.length > 0 ? landing.ofertas.map((of, i) => (
              <div key={i} className={`flex justify-between items-center ${i > 0 ? 'mt-1 pt-1 border-t border-green-100' : ''}`}>
                <span className="text-sm text-gray-700">{of.nombre}</span>
                <span className="font-black text-green-600">S/{of.precio}</span>
              </div>
            )) : (
              <p className="font-black text-green-600 text-lg">S/{producto.precio}</p>
            )}
          </div>

          <p className="text-xs text-gray-500 font-medium">¿Qué quieres hacer?</p>
        </div>

        {/* Action buttons */}
        {step === 'post-registro' && (
          <div className="px-4 space-y-3">
            <button
              onClick={handleAbrirChat}
              className="w-full bg-green-500 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-green-200 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <MessageCircle size={20} />
              Chat — Confirmar mi pedido
            </button>
            <button
              onClick={() => setStep('landing')}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2"
            >
              <List size={16} />
              Ver más detalles del producto
            </button>
          </div>
        )}

        {/* Full chat opens here */}
        {step === 'chat' && postChat && (
          <div className="mt-2 border-t border-gray-100" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500">Chat con {tienda?.nombre}</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatView chat={postChat} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ——— LANDING VIEW ———
  return (
    <div ref={landingRef} className="pb-28">

      {/* 1. HERO */}
      <div className="relative bg-gradient-to-br from-green-600 via-green-500 to-emerald-400 px-5 pt-6 pb-8 text-white overflow-hidden">
        {/* bg decoration */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/10" />

        <div className="relative">
          {/* Badge urgencia */}
          <div className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-full mb-3 animate-pulse">
            🔥 ¡SOLO QUEDAN {unidades} UNIDADES!
          </div>

          {/* Emoji grande */}
          <div className="text-7xl mb-3 drop-shadow-lg">{producto.imagenes[0]}</div>

          {/* Headline */}
          <h1 className="text-2xl font-black leading-tight mb-2">
            {landing.titulo || producto.nombre}
          </h1>
          <p className="text-green-100 text-sm leading-relaxed mb-4">
            {producto.descripcion}
          </p>

          {/* Precio hero */}
          <div className="flex items-center gap-3 mb-4">
            <div>
              <p className="text-green-200 text-xs line-through">S/{Math.round(producto.precio * 1.4)}</p>
              <p className="text-4xl font-black">S/{producto.precio}</p>
            </div>
            <div className="bg-red-500 text-white text-xs font-black px-2 py-1 rounded-xl">
              -{Math.round(((producto.precio * 1.4 - producto.precio) / (producto.precio * 1.4)) * 100)}% OFF
            </div>
          </div>

          {/* Social proof bar */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <div className="flex">
              {[1,2,3,4,5].map(i => <Star key={i} size={14} className="fill-amber-400 text-amber-400" />)}
            </div>
            <p className="text-sm font-bold">
              +{(landing.recomendaciones.length * 847 + 2193).toLocaleString()} clientes felices
            </p>
          </div>
        </div>
      </div>

      {/* 2. TRUST BADGES */}
      <div className="grid grid-cols-3 gap-2 px-4 py-4 bg-white border-b border-gray-100">
        {[
          { icon: Shield, label: 'Garantía 30 días', color: 'text-green-600' },
          { icon: Truck, label: 'Delivery rápido', color: 'text-blue-600' },
          { icon: Zap, label: 'Pago contraentrega', color: 'text-amber-500' },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-1 p-2">
            <Icon size={20} className={color} />
            <p className="text-[10px] font-semibold text-gray-600 text-center leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* 3. PROBLEMA / SOLUCIÓN */}
      <div className="px-4 py-5">
        <h2 className="font-black text-gray-900 text-lg mb-4">¿Te pasa esto? 😤</h2>
        <div className="space-y-2 mb-5">
          {[
            'Gastas en cosas que no te duran nada',
            'Pagas demasiado por productos de baja calidad',
            'No encuentras donde comprarlo a buen precio en Perú',
          ].map((pain, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-50 rounded-xl px-3 py-2.5">
              <span className="text-red-500 text-sm">✗</span>
              <p className="text-sm text-gray-700">{pain}</p>
            </div>
          ))}
        </div>
        <h2 className="font-black text-gray-900 text-lg mb-3">Con este producto, eso se acaba: 🎯</h2>
        <div className="space-y-2">
          {[
            'Calidad importada directamente, sin intermediarios',
            'Garantía real de 30 días — si falla, te lo cambiamos',
            'Delivery a todo el Perú, pago contraentrega disponible',
          ].map((sol, i) => (
            <div key={i} className="flex items-start gap-2 bg-green-50 rounded-xl px-3 py-2.5">
              <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">{sol}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. CARACTERÍSTICAS */}
      {landing.descripcionLarga && (
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
          <h2 className="font-black text-gray-900 text-lg mb-3">¿Por qué elegirlo? ⭐</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{landing.descripcionLarga}</p>
        </div>
      )}

      {/* 5. TESTIMONIOS */}
      {landing.recomendaciones.length > 0 && (
        <div className="px-4 py-5">
          <h2 className="font-black text-gray-900 text-lg mb-1">Lo que dicen nuestros clientes</h2>
          <p className="text-xs text-gray-400 mb-4">Opiniones verificadas de compradores reales 🇵🇪</p>
          <div className="space-y-3">
            {landing.recomendaciones.map(rec => (
              <div key={rec.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                    {rec.nombre[0]}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{rec.nombre}</p>
                    <div className="flex gap-0.5">
                      {Array.from({ length: rec.estrellas }).map((_, i) => (
                        <Star key={i} size={11} className="fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <span className="ml-auto text-[10px] text-gray-400">{rec.fecha}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">"{rec.texto}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. PRECIOS / OFERTA */}
      {landing.ofertas.length > 0 && (
        <div className="px-4 py-5 bg-gradient-to-br from-green-50 to-emerald-50 border-t border-green-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-red-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full">PRECIO DE LANZAMIENTO</span>
          </div>
          <h2 className="font-black text-gray-900 text-lg mb-4">Elige tu pack</h2>
          <div className="space-y-3">
            {landing.ofertas.map((of, i) => {
              const precioOriginal = Math.round(of.precio * 1.3)
              const isMasVendido = of.nombre.toLowerCase().includes('más vendido') || of.nombre.toLowerCase().includes('pack') || i === 1
              return (
                <div key={i} className={`bg-white rounded-2xl p-4 border-2 relative ${isMasVendido ? 'border-green-500' : 'border-gray-200'}`}>
                  {isMasVendido && (
                    <div className="absolute -top-2.5 left-4 bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-full">
                      ⭐ MÁS VENDIDO
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{of.nombre}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{of.descripcion}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400 line-through">S/{precioOriginal}</p>
                      <p className="text-xl font-black text-green-600">S/{of.precio}</p>
                      <p className="text-[10px] text-red-500 font-bold">Ahorra S/{precioOriginal - of.precio}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Garantía badge */}
          <div className="mt-4 flex items-center gap-2 bg-white rounded-2xl px-4 py-3 border border-gray-100">
            <Shield size={18} className="text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-800">Garantía de satisfacción 30 días</p>
              <p className="text-xs text-gray-400">Si no te gusta, te devolvemos tu dinero. Sin preguntas.</p>
            </div>
          </div>
        </div>
      )}

      {/* 7. FAQ */}
      {landing.faq.length > 0 && (
        <div className="px-4 py-5">
          <h2 className="font-black text-gray-900 text-lg mb-4">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {landing.faq.map((f, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <p className="font-semibold text-gray-800 text-sm pr-3">{f.pregunta}</p>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-gray-600">{f.respuesta}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. FINAL CTA */}
      <div className="px-4 py-6 bg-gradient-to-br from-green-600 to-green-700 mx-4 rounded-3xl mb-4">
        <p className="text-white font-black text-xl text-center mb-1">¿Listo para pedirlo?</p>
        <p className="text-green-100 text-sm text-center mb-4">🔥 Quedan pocas unidades • Envío rápido • Pago al recibir</p>
        <button
          onClick={() => setStep('modal')}
          className="w-full bg-white text-green-700 font-black py-4 rounded-2xl text-base shadow-lg active:scale-95 transition-transform"
        >
          ¡QUIERO EL MÍO AHORA! →
        </button>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 px-4 py-3 z-20 flex items-center gap-3">
        <div className="text-3xl">{producto.imagenes[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{producto.nombre}</p>
          <p className="text-green-600 font-black text-base leading-none">S/{producto.precio}</p>
        </div>
        <button
          onClick={() => setStep('modal')}
          className="bg-green-500 text-white font-black px-5 py-3 rounded-2xl text-sm shadow-lg shadow-green-200 active:scale-95 transition-transform flex-shrink-0"
        >
          ¡Lo quiero!
        </button>
      </div>

      {/* MODAL POPUP */}
      {step === 'modal' && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setStep('landing')} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 overflow-y-auto max-h-[92vh]">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Close button */}
            <button
              onClick={() => setStep('landing')}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-5 pb-8 pt-2">
              <h2 className="text-xl font-black text-gray-900 mb-1">¡Un paso más! 🎉</h2>
              <p className="text-sm text-gray-500 mb-5">Déjanos tus datos y te contactamos enseguida.</p>

              {/* Product summary */}
              <div className="flex items-center gap-3 bg-green-50 rounded-2xl px-3 py-2.5 mb-5">
                <span className="text-2xl">{producto.imagenes[0]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{producto.nombre}</p>
                  <p className="text-sm font-black text-green-600">S/{producto.precio}</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Nombre */}
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Nombre completo *</label>
                  <input
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: María López Quispe"
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">WhatsApp *</label>
                  <div className="flex gap-2">
                    <div className="bg-gray-100 rounded-2xl px-3 py-3 text-sm text-gray-400 font-medium flex-shrink-0">+51</div>
                    <input
                      value={form.whatsapp}
                      onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value.replace(/\D/g, '') }))}
                      placeholder="987 654 321"
                      type="tel"
                      maxLength={9}
                      className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                </div>

                {/* Departamento */}
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Departamento *</label>
                  <select
                    value={form.departamento}
                    onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 appearance-none"
                  >
                    <option value="">Selecciona tu departamento</option>
                    {DEPARTAMENTOS_PERU.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Provincia + Distrito */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Provincia *</label>
                    <input
                      value={form.provincia}
                      onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}
                      placeholder="Ej: Lima"
                      className="w-full bg-gray-100 rounded-2xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Distrito *</label>
                    <input
                      value={form.distrito}
                      onChange={e => setForm(f => ({ ...f, distrito: e.target.value }))}
                      placeholder="Ej: Surco"
                      className="w-full bg-gray-100 rounded-2xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Dirección de entrega *</label>
                  <textarea
                    value={form.direccion}
                    onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="Ej: Jr. Los Rosales 234, Urb. San Felipe"
                    rows={2}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 resize-none"
                  />
                </div>
              </div>

              {/* Trust row */}
              <div className="flex items-center justify-center gap-4 my-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><Shield size={11} className="text-green-500" /> Datos seguros</span>
                <span className="flex items-center gap-1"><Zap size={11} className="text-amber-500" /> Respuesta inmediata</span>
                <span className="flex items-center gap-1"><Truck size={11} className="text-blue-500" /> Contraentrega</span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!form.nombre || !form.whatsapp || !form.departamento || !form.provincia || !form.distrito || !form.direccion}
                className="w-full bg-green-500 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-green-200 disabled:opacity-50 active:scale-95 transition-transform"
              >
                Confirmar mi pedido →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
