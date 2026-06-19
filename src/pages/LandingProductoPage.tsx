import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, Shield, Truck, Zap, CheckCircle, ChevronDown, X, Phone, ArrowLeft } from 'lucide-react'
import { useKrossStore } from '../store'
import { DEPARTAMENTOS_PERU } from '../data/seed'
import { GEO_PERU } from '../data/peru-geo'
import ChatView from '../components/ChatView'

type Step = 'landing' | 'modal' | 'chat'

interface FormData {
  nombre: string
  whatsapp: string
  packIdx: number
  departamento: string
  provincia: string
  distrito: string
  direccion: string
}


export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()
  const { landings, productos, tiendas, currentUser, chats, openNewChat } = useKrossStore()

  const landing = landings.find(l => l.id === landingId)
  const producto = landing ? productos.find(p => p.id === landing.productoId) : null
  // tienda no usada en header (reemplazada por Teddy), se mantiene por potencial uso futuro
  void (producto ? tiendas.find(t => t.id === producto.tiendaId) : null)

  const [step, setStep] = useState<Step>('landing')
  const [imgIdx, setImgIdx] = useState(0)
  const [form, setForm] = useState<FormData>({
    nombre: currentUser.tipo === 'comprador' ? currentUser.nombre : '',
    whatsapp: '',
    packIdx: landing?.ofertas.length ? 1 : 0,
    departamento: '',
    provincia: '',
    distrito: '',
    direccion: '',
  })
  const [chatId, setChatId] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  if (!landing || !producto) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Producto no encontrado</p></div>
  }

  const imagenes = producto.imagenes.length > 0 ? producto.imagenes : ['https://placehold.co/800x600/e2e8f0/94a3b8?text=Producto']
  const unidades = 7
  const selectedPack = landing.ofertas[form.packIdx] || landing.ofertas[0]
  const precioBase = selectedPack?.precio || producto.precio

  // Geo cascades
  const provincias = form.departamento ? Object.keys(GEO_PERU[form.departamento] || {}) : []
  const distritos = form.departamento && form.provincia ? (GEO_PERU[form.departamento]?.[form.provincia] || []) : []

  const formValid = form.nombre && form.whatsapp.length >= 9 && form.departamento && form.provincia && form.distrito && form.direccion

  const handleSubmit = () => {
    if (!formValid) return
    const newChatId = openNewChat(
      currentUser.id, producto.tiendaId, producto.id, landing.id,
      form.nombre,
      `${form.direccion}, ${form.distrito}, ${form.provincia}, ${form.departamento}`,
      form.whatsapp
    )
    setChatId(newChatId)
    setStep('chat')
  }

  // ——— CHAT VIEW ———
  if (step === 'chat') {
    const activeChat = chatId ? chats.find(c => c.id === chatId) : null
    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 112px)' }}>
        {/* Header azul con curva inferior */}
        <div className="px-4 pt-3 pb-5 text-white" style={{ background: '#55C8F5', borderRadius: '0 0 32px 32px' }}>
          <div className="flex items-center gap-3">
            {/* Flecha atrás */}
            <button
              onClick={() => setStep('landing')}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.22)' }}
            >
              <ArrowLeft size={18} className="text-white" />
            </button>

            {/* Avatar mascota oso Teddy */}
            <div className="relative flex-shrink-0">
              <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/60">
                <svg viewBox="0 0 64 64" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="32" r="32" fill="#FFF9E0"/>
                  <ellipse cx="32" cy="48" rx="14" ry="11" fill="#D4A05A"/>
                  <circle cx="32" cy="28" r="16" fill="#E8B86D"/>
                  <circle cx="17" cy="16" r="6" fill="#D4A05A"/>
                  <circle cx="47" cy="16" r="6" fill="#D4A05A"/>
                  <circle cx="17" cy="16" r="3.5" fill="#F5C98A"/>
                  <circle cx="47" cy="16" r="3.5" fill="#F5C98A"/>
                  <ellipse cx="32" cy="31" rx="10" ry="8" fill="#F5C98A"/>
                  <circle cx="26" cy="26" r="2.5" fill="#1A1A1A"/>
                  <circle cx="38" cy="26" r="2.5" fill="#1A1A1A"/>
                  <circle cx="26.8" cy="25.2" r="0.9" fill="white"/>
                  <circle cx="38.8" cy="25.2" r="0.9" fill="white"/>
                  <ellipse cx="32" cy="31" rx="2.5" ry="1.8" fill="#1A1A1A"/>
                  <path d="M28.5 33.5 Q32 36.5 35.5 33.5" stroke="#1A1A1A" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
                  <ellipse cx="32" cy="13" rx="13" ry="4" fill="#55C8F5"/>
                  <rect x="19" y="9" width="26" height="8" rx="4" fill="#55C8F5"/>
                  <rect x="23" y="6" width="18" height="7" rx="3.5" fill="#2BB5EE"/>
                  <circle cx="32" cy="6" r="2.5" fill="#FFD400"/>
                </svg>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{ background: '#4ADE80' }} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-base leading-tight">Teddy</p>
              <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>En línea ahora</p>
            </div>

            {/* Llamada — blanco con borde negro como referencia */}
            <button className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white" style={{ border: '2px solid #111111' }}>
              <Phone size={17} style={{ color: '#111111' }} />
            </button>
          </div>

          {/* Info pedido dentro del header */}
          <div className="mt-3 rounded-2xl px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <div>
              <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Tu pedido</p>
              <p className="text-sm font-black text-white truncate max-w-[200px]">{selectedPack?.nombre || producto.nombre}</p>
            </div>
            <p className="font-black text-lg text-white">S/{precioBase}</p>
          </div>
        </div>

        {/* Chat */}
        {activeChat && (
          <div className="flex-1 overflow-hidden">
            <ChatView chat={activeChat} lockedUntilChat />
          </div>
        )}
      </div>
    )
  }

  // ——— LANDING VIEW ———
  return (
    <div className="pb-24">

      {/* ① HERO con galería de fotos */}
      <div className="relative bg-gray-900 overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: 320 }}>
        {/* Imagen principal */}
        <img
          src={imagenes[imgIdx]}
          alt={producto.nombre}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/800x600/16a34a/ffffff?text=' + encodeURIComponent(producto.nombre) }}
        />
        {/* Gradiente oscuro abajo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Badge urgencia */}
        <div className="absolute top-3 left-3 bg-red-500 text-white text-[11px] font-black px-3 py-1.5 rounded-full animate-pulse shadow-lg">
          🔥 ¡SOLO QUEDAN {unidades} UNIDADES!
        </div>

        {/* Miniaturas de fotos */}
        {imagenes.length > 1 && (
          <div className="absolute top-3 right-3 flex flex-col gap-1.5">
            {imagenes.map((img, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${imgIdx === i ? 'border-white scale-110' : 'border-white/30'}`}
              >
                <img src={img} alt="" className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x80/16a34a/ffffff?text=' + (i+1) }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Título sobre la imagen */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <h1 className="text-white font-black text-xl leading-tight drop-shadow-lg">{landing.titulo || producto.nombre}</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex">
              {[1,2,3,4,5].map(i => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
            </div>
            <p className="text-white/90 text-xs font-semibold">+{(landing.recomendaciones.length * 612 + 1847).toLocaleString()} compradores</p>
          </div>
        </div>
      </div>

      {/* ② PRECIO + BADGES */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div>
            <p className="text-gray-400 text-xs line-through">S/{Math.round(producto.precio * 1.45)}</p>
            <p className="text-3xl font-black text-green-600">S/{producto.precio}</p>
          </div>
          <div className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-xl">
            -{Math.round(28)}% OFF
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">Contraentrega</p>
            <p className="text-xs font-bold text-green-600">✓ Disponible</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Shield, label: 'Garantía 30 días', color: 'text-green-600' },
            { icon: Truck, label: 'Delivery rápido', color: 'text-blue-600' },
            { icon: Zap, label: 'Yape / Plin', color: 'text-amber-500' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 bg-gray-50 rounded-xl py-2">
              <Icon size={16} className={color} />
              <p className="text-[9px] font-semibold text-gray-500 text-center leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ③ PROBLEMA / SOLUCIÓN */}
      <div className="px-4 py-5">
        <h2 className="font-black text-gray-900 text-lg mb-3">¿Te pasa esto? 😤</h2>
        <div className="space-y-2 mb-5">
          {[
            'Gastas en productos que no te duran ni 3 meses',
            'Pagas precios de tienda sin saber dónde comprar barato',
            'No confías en las compras por internet porque te han fallado antes',
          ].map((pain, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <span className="text-red-400 font-bold text-sm flex-shrink-0">✗</span>
              <p className="text-sm text-gray-700">{pain}</p>
            </div>
          ))}
        </div>
        <h2 className="font-black text-gray-900 text-lg mb-3">Con nosotros, eso se acabó 🎯</h2>
        <div className="space-y-2">
          {[
            'Calidad importada directa — sin intermediarios ni sobreprecio',
            'Pago cuando recibes: contraentrega disponible en todo el Perú',
            '30 días de garantía real — si falla, te lo cambiamos sin excusas',
          ].map((sol, i) => (
            <div key={i} className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
              <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">{sol}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ④ FOTOS DE PERSONAS USANDO EL PRODUCTO */}
      {imagenes.length > 1 && (
        <div className="px-4 pb-5">
          <h2 className="font-black text-gray-900 text-lg mb-3">Míralo en acción 📸</h2>
          <div className="grid grid-cols-2 gap-2">
            {imagenes.slice(1).map((img, i) => (
              <div key={i} className="rounded-2xl overflow-hidden aspect-square bg-gray-100">
                <img
                  src={img}
                  alt={`${producto.nombre} en uso ${i + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/e2e8f0/94a3b8?text=Foto+' + (i+2) }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⑤ DESCRIPCIÓN */}
      {landing.descripcionLarga && (
        <div className="px-4 pb-5 bg-gray-50 border-y border-gray-100 py-5">
          <h2 className="font-black text-gray-900 text-lg mb-2">¿Por qué este producto? ⭐</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{landing.descripcionLarga}</p>
        </div>
      )}

      {/* ⑥ TESTIMONIOS */}
      {landing.recomendaciones.length > 0 && (
        <div className="px-4 py-5">
          <h2 className="font-black text-gray-900 text-lg mb-1">Lo dicen clientes reales 🇵🇪</h2>
          <p className="text-xs text-gray-400 mb-4">Opiniones verificadas de compradores en Perú</p>
          <div className="space-y-3">
            {landing.recomendaciones.map(rec => (
              <div key={rec.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm">
                    {rec.nombre[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">{rec.nombre}</p>
                    <div className="flex gap-0.5">
                      {Array.from({ length: rec.estrellas }).map((_, i) => <Star key={i} size={11} className="fill-amber-400 text-amber-400" />)}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{rec.fecha}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed italic">"{rec.texto}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⑦ PACKS */}
      <div className="px-4 py-5 bg-gradient-to-br from-green-50 to-emerald-50 border-t border-green-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-red-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full">PRECIO ESPECIAL HOY</span>
        </div>
        <h2 className="font-black text-gray-900 text-lg mb-4">Elige tu pack</h2>
        <div className="space-y-3">
          {landing.ofertas.slice(0, 3).map((of, i) => {
            const precioOrig = Math.round(of.precio * 1.35)
            const isMasVendido = of.nombre.toLowerCase().includes('más vendido') || i === 1
            return (
              <div key={i} className={`bg-white rounded-2xl p-4 border-2 relative transition-all ${isMasVendido ? 'border-green-500 shadow-md' : 'border-gray-200'}`}>
                {isMasVendido && (
                  <div className="absolute -top-2.5 left-4 bg-green-500 text-white text-[10px] font-black px-3 py-0.5 rounded-full">⭐ MÁS VENDIDO</div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">{of.nombre.replace(' ⭐ Más vendido', '')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{of.descripcion}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400 line-through">S/{precioOrig}</p>
                    <p className="text-xl font-black text-green-600">S/{of.precio}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 bg-white rounded-2xl px-4 py-3 border border-gray-100">
          <Shield size={18} className="text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-800">Garantía 30 días sin preguntas</p>
            <p className="text-xs text-gray-400">Si no te gusta, te devolvemos el dinero completo.</p>
          </div>
        </div>
      </div>

      {/* ⑧ FAQ */}
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
                  <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <div className="px-4 pb-3"><p className="text-sm text-gray-600">{f.respuesta}</p></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⑨ FINAL CTA */}
      <div className="mx-4 mb-6 bg-gradient-to-br from-green-600 to-green-700 rounded-3xl px-5 py-6 text-center">
        <p className="text-white font-black text-xl mb-1">¿Listo para pedirlo?</p>
        <p className="text-green-100 text-sm mb-4">🔥 Pocas unidades • Pago al recibir • Envío rápido</p>
        <button onClick={() => setStep('modal')} className="w-full bg-white text-green-700 font-black py-4 rounded-2xl text-base shadow-lg active:scale-95 transition-transform">
          ¡QUIERO EL MÍO AHORA! →
        </button>
      </div>

      {/* STICKY BOTTOM — siempre visible */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 shadow-2xl">
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          <img src={imagenes[0]} alt="" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x80/16a34a/ffffff?text=K' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-xs truncate">{producto.nombre}</p>
          <p className="text-green-600 font-black text-lg leading-none">S/{producto.precio}</p>
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
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 overflow-y-auto max-h-[95vh]">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <button onClick={() => setStep('landing')} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-5 pb-8 pt-2">
              <h2 className="text-xl font-black text-gray-900 mb-0.5">¡Un paso más! 🎉</h2>
              <p className="text-sm text-gray-500 mb-4">Completa tus datos y te contactamos de inmediato.</p>

              {/* 1. ELIGE TU PACK */}
              <div className="mb-5">
                <label className="text-xs font-black text-gray-700 mb-2 block uppercase tracking-wide">1. Elige tu pack</label>
                <div className="space-y-2">
                  {landing.ofertas.slice(0, 3).map((of, i) => {
                    const isMasVendido = of.nombre.toLowerCase().includes('más vendido') || i === 1
                    return (
                      <button
                        key={i}
                        onClick={() => setForm(f => ({ ...f, packIdx: i }))}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left transition-all ${form.packIdx === i ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${form.packIdx === i ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                            {form.packIdx === i && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className={`text-sm font-bold ${form.packIdx === i ? 'text-green-800' : 'text-gray-800'}`}>{of.nombre.replace(' ⭐ Más vendido', '')}</p>
                            <p className="text-[10px] text-gray-400">{of.descripcion}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          {isMasVendido && <span className="text-[9px] bg-green-500 text-white font-bold px-1.5 py-0.5 rounded-full block mb-0.5">⭐ TOP</span>}
                          <p className={`text-base font-black ${form.packIdx === i ? 'text-green-600' : 'text-gray-700'}`}>S/{of.precio}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 mb-4" />
              <label className="text-xs font-black text-gray-700 mb-3 block uppercase tracking-wide">2. Tus datos</label>

              <div className="space-y-3">
                {/* Nombre */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre completo *</label>
                  <input
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: María López Quispe"
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">WhatsApp *</label>
                  <div className="flex gap-2">
                    <div className="bg-gray-100 rounded-2xl px-3 py-3 text-sm text-gray-500 font-bold flex-shrink-0 flex items-center gap-1">🇵🇪 +51</div>
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
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Departamento *</label>
                  <select
                    value={form.departamento}
                    onChange={e => setForm(f => ({ ...f, departamento: e.target.value, provincia: '', distrito: '' }))}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">Selecciona tu departamento</option>
                    {DEPARTAMENTOS_PERU.map((d: string) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Provincia */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Provincia *</label>
                  <select
                    value={form.provincia}
                    onChange={e => setForm(f => ({ ...f, provincia: e.target.value, distrito: '' }))}
                    disabled={!form.departamento}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-40"
                  >
                    <option value="">{form.departamento ? 'Selecciona tu provincia' : 'Primero elige departamento'}</option>
                    {provincias.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Distrito */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Distrito *</label>
                  <select
                    value={form.distrito}
                    onChange={e => setForm(f => ({ ...f, distrito: e.target.value }))}
                    disabled={!form.provincia}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-40"
                  >
                    <option value="">{form.provincia ? 'Selecciona tu distrito' : 'Primero elige provincia'}</option>
                    {distritos.map((d: string) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Dirección */}
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Dirección exacta *</label>
                  <textarea
                    value={form.direccion}
                    onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="Ej: Jr. Los Rosales 234, Urb. San Felipe (referencia: frente al parque)"
                    rows={2}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 resize-none"
                  />
                </div>
              </div>

              {/* Kross Club seal */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 my-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center shadow-sm border-2 border-amber-300">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 4l2.4 7.4H30l-6.2 4.5 2.4 7.4L20 19l-6.2 4.3 2.4-7.4L10 11.4h7.6L20 4z" fill="white"/>
                    <circle cx="20" cy="26" r="8" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5"/>
                    <path d="M16 26l2.5 2.5L24 23" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-black text-amber-800 uppercase tracking-wide">Garantía Kross Club</p>
                  <p className="text-[10px] text-amber-700 leading-tight">30 días de protección total. Si no estás satisfecho, te devolvemos tu dinero.</p>
                </div>
              </div>

              {/* Mascota + Botón */}
              <div className="flex items-end gap-3">
                {/* Mascota Kross (zorro) */}
                <div className="flex-shrink-0 mb-1">
                  <svg viewBox="0 0 64 72" width="56" height="64" xmlns="http://www.w3.org/2000/svg">
                    {/* Cuerpo */}
                    <ellipse cx="32" cy="52" rx="16" ry="14" fill="#FFB300"/>
                    {/* Cabeza */}
                    <ellipse cx="32" cy="32" rx="18" ry="17" fill="#FFB300"/>
                    {/* Orejas */}
                    <polygon points="16,18 10,4 22,14" fill="#FF6B35"/>
                    <polygon points="48,18 54,4 42,14" fill="#FF6B35"/>
                    {/* Oreja interior */}
                    <polygon points="16,17 12,7 21,14" fill="#FFE0CC"/>
                    <polygon points="48,17 52,7 43,14" fill="#FFE0CC"/>
                    {/* Cara blanca */}
                    <ellipse cx="32" cy="35" rx="11" ry="10" fill="#FFF3E0"/>
                    {/* Ojos */}
                    <circle cx="26" cy="29" r="3" fill="#1A1A2E"/>
                    <circle cx="38" cy="29" r="3" fill="#1A1A2E"/>
                    <circle cx="27" cy="28" r="1" fill="white"/>
                    <circle cx="39" cy="28" r="1" fill="white"/>
                    {/* Nariz */}
                    <ellipse cx="32" cy="35" rx="2.5" ry="1.5" fill="#1A1A2E"/>
                    {/* Boca sonrisa */}
                    <path d="M29 37.5 Q32 40 35 37.5" stroke="#1A1A2E" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                    {/* Manoplas */}
                    <ellipse cx="18" cy="60" rx="6" ry="5" fill="#FF6B35"/>
                    <ellipse cx="46" cy="60" rx="6" ry="5" fill="#FF6B35"/>
                    {/* Estrella */}
                    <text x="27" y="56" fontSize="10" fill="white" fontWeight="bold">★</text>
                  </svg>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!formValid}
                  className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 font-black py-4 rounded-2xl text-base shadow-lg shadow-amber-200 disabled:opacity-40 active:scale-95 transition-transform border-b-4 border-amber-500"
                >
                  ¡Confirmar pedido! S/{precioBase} →
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
