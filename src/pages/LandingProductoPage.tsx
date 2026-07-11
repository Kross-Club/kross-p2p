import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Pack { nombre: string; descripcion?: string; precio: number }
interface Product {
  id: string
  store_id: string | null
  nombre: string
  precio: number
  images: string[]
  packs: Pack[]
}
interface BuyerAccount {
  id: string; nombre: string; phone: string
  document_type: string; document_number: string
  score: number; puntos: number
}

export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const [buyerAccount, setBuyerAccount] = useState<BuyerAccount | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [packIdx, setPackIdx] = useState(0)
  const [form, setForm] = useState({
    nombre: '', whatsapp: '', document_type: 'DNI' as 'DNI' | 'CE' | 'PASAPORTE', document_number: '',
  })

  useEffect(() => {
    if (!landingId) return
    supabase.from('products').select('id, store_id, nombre, precio, images, packs').eq('id', landingId).maybeSingle()
      .then(({ data }) => { setProduct(data as Product | null); setLoading(false) })
  }, [landingId])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('buyer_session')
      if (!raw) return
      const { buyer } = JSON.parse(raw)
      if (buyer) {
        setBuyerAccount(buyer)
        setForm(f => ({
          ...f,
          nombre: buyer.nombre ?? f.nombre,
          whatsapp: buyer.phone?.replace(/^51/, '') ?? f.whatsapp,
          document_type: (buyer.document_type as any) ?? 'DNI',
          document_number: buyer.document_number ?? f.document_number,
        }))
      }
    } catch { /* ignore */ }
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" /></div>
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-400">Producto no encontrado</div>

  const packs = product.packs ?? []
  const selectedPack = packs[packIdx]
  const precio = selectedPack?.precio || product.precio

  const formValid = form.nombre && form.whatsapp.length >= 9 && form.document_number.length >= 6

  const handleSubmit = async () => {
    if (!formValid || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE}/register-buyer`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: product.store_id,
          product_id: product.id,
          product_name: product.nombre,
          product_price: precio,
          pack_name: selectedPack?.nombre ?? null,
          buyer_name: form.nombre,
          buyer_phone: form.whatsapp,
          document_type: form.document_type,
          document_number: form.document_number,
          address: null, // la fija el comprador con GPS dentro del chat
        }),
      })
      if (res.ok) {
        const { token } = await res.json() as { token: string }
        navigate(`/p/${token}`)
        return
      }
      alert('No se pudo registrar el pedido. Intenta de nuevo.')
    } catch {
      alert('Error de conexión. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full mx-auto pb-24" style={{ maxWidth: 500, background: '#fff' }}>
      {product.images.length === 0 ? (
        <div className="py-24 text-center text-gray-400 text-sm px-6">Este producto aún no tiene imágenes de landing.</div>
      ) : (
        product.images.map((img, i) => (
          <img key={i} src={img} alt={`${product.nombre} ${i + 1}`} className="w-full block align-top" style={{ margin: 0, padding: 0 }} />
        ))
      )}

      {/* Barra fija con CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full z-20 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 shadow-2xl" style={{ maxWidth: 500 }}>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-xs truncate">{product.nombre}</p>
          <p className="text-green-600 font-black text-lg leading-none">S/{precio}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-green-500 text-white font-black px-6 py-3.5 rounded-2xl text-sm shadow-lg shadow-green-200 active:scale-95 transition-transform flex-shrink-0">
          ¡Lo quiero!
        </button>
      </div>

      {/* MODAL FORM */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowModal(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] bg-white rounded-t-3xl z-50 overflow-y-auto max-h-[95vh]">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} className="text-gray-500" /></button>

            <div className="px-5 pb-8 pt-2">
              <h2 className="text-xl font-black text-gray-900 mb-0.5">¡Un paso más! 🎉</h2>
              <p className="text-sm text-gray-500 mb-4">Completa tus datos y coordinamos la entrega por el chat.</p>

              {packs.length > 0 && (
                <div className="mb-4">
                  <label className="text-xs font-black text-gray-700 mb-2 block uppercase tracking-wide">Elige tu pack</label>
                  <div className="space-y-2">
                    {packs.map((p, i) => (
                      <button key={i} onClick={() => setPackIdx(i)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left ${packIdx === i ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                        <div>
                          <p className={`text-sm font-bold ${packIdx === i ? 'text-green-800' : 'text-gray-800'}`}>{p.nombre}</p>
                          {p.descripcion && <p className="text-[10px] text-gray-400">{p.descripcion}</p>}
                        </div>
                        <p className={`text-base font-black ${packIdx === i ? 'text-green-600' : 'text-gray-700'}`}>S/{p.precio}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {buyerAccount && (
                <div className="mb-3 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #060C1A, #0D1F3C)', border: '1.5px solid rgba(125,232,255,0.3)' }}>
                  <span className="text-lg">⚡</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: '#7DE8FF' }}>Comprando como {buyerAccount.nombre.split(' ')[0]}</p>
                    <p className="text-xs" style={{ color: 'rgba(125,232,255,0.5)' }}>{buyerAccount.document_type} {buyerAccount.document_number} · Score {buyerAccount.score}/100</p>
                  </div>
                  <button onClick={() => { setBuyerAccount(null); setForm({ nombre: '', whatsapp: '', document_type: 'DNI', document_number: '' }) }}
                    className="text-xs px-2 py-1 rounded-lg self-start" style={{ color: 'rgba(125,232,255,0.5)', background: 'rgba(255,255,255,0.05)' }}>Cambiar</button>
                </div>
              )}

              {!buyerAccount && (
                <div className="space-y-3">
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo *" className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                  <div className="flex gap-2">
                    <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value as any, document_number: '' }))} className="bg-gray-100 rounded-2xl px-3 py-3 text-sm outline-none font-bold text-gray-700">
                      <option value="DNI">DNI</option><option value="CE">CE</option><option value="PASAPORTE">Pasaporte</option>
                    </select>
                    <input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value.replace(/\D/g, '').slice(0, f.document_type === 'DNI' ? 8 : 12) }))} placeholder="Documento *" className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none font-mono tracking-widest" />
                  </div>
                  <div className="flex gap-2">
                    <div className="bg-gray-100 rounded-2xl px-3 py-3 text-sm text-gray-500 font-bold flex items-center gap-1">🇵🇪 +51</div>
                    <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value.replace(/\D/g, '') }))} placeholder="WhatsApp *" type="tel" maxLength={9} className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 my-4">
                <span className="text-lg">📍</span>
                <p className="text-[11px] text-amber-800">Tu dirección la confirmas por GPS dentro del chat, con tu asesor.</p>
              </div>

              <button onClick={handleSubmit} disabled={!formValid || submitting}
                className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 font-black py-4 rounded-2xl text-base shadow-lg disabled:opacity-40 active:scale-95 transition-transform border-b-4 border-amber-500">
                {submitting ? 'Registrando…' : `¡Confirmar pedido! S/${precio} →`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
