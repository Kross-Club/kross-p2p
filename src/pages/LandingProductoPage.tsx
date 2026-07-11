import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X, ShieldCheck, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const COUNTRIES = [
  { code: '51', flag: '🇵🇪', name: 'Perú', len: 9 },
  { code: '52', flag: '🇲🇽', name: 'México', len: 10 },
  { code: '57', flag: '🇨🇴', name: 'Colombia', len: 10 },
  { code: '56', flag: '🇨🇱', name: 'Chile', len: 9 },
  { code: '593', flag: '🇪🇨', name: 'Ecuador', len: 9 },
  { code: '54', flag: '🇦🇷', name: 'Argentina', len: 10 },
  { code: '591', flag: '🇧🇴', name: 'Bolivia', len: 8 },
  { code: '1', flag: '🇺🇸', name: 'USA', len: 10 },
]

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
  const [country, setCountry] = useState(COUNTRIES[0])
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState({ whatsapp: '', document_number: '' })

  // Autocomplete + validate the name from the DNI (RENIEC via Decolecta)
  useEffect(() => {
    setResolvedName(null); setNotFound(false)
    if (form.document_number.length !== 8) return
    let alive = true
    setLooking(true)
    fetch(`${BASE}/dni-lookup`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_number: form.document_number }),
    })
      .then(r => r.json())
      .then(d => { if (alive) { setResolvedName(d?.nombre ?? null); setNotFound(!d?.nombre) } })
      .catch(() => { if (alive) setNotFound(true) })
      .finally(() => { if (alive) setLooking(false) })
    return () => { alive = false }
  }, [form.document_number])

  useEffect(() => {
    if (!landingId) return
    supabase.from('products').select('id, store_id, nombre, precio, images, packs').eq('id', landingId).maybeSingle()
      .then(({ data }) => {
        const p = data as Product | null
        setProduct(p)
        // pre-select the pack that gives the best value (usually the biggest)
        if (p?.packs?.length) setPackIdx(p.packs.length - 1)
        setLoading(false)
      })
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
          whatsapp: buyer.phone?.replace(/^51/, '') ?? f.whatsapp,
          document_number: buyer.document_number ?? f.document_number,
        }))
      }
    } catch { /* ignore */ }
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" /></div>
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-400">Producto no encontrado</div>

  // Packs ordenados por precio (menor → mayor) para incentivar llevar más
  const packs = [...(product.packs ?? [])].sort((a, b) => a.precio - b.precio)
  const selectedPack = packs[packIdx]
  const precio = selectedPack?.precio || product.precio
  const bestIdx = packs.length - 1 // el de mayor precio suele ser más unidades / mejor valor

  // Only a DNI validated against RENIEC (with a resolved name) can order
  const phoneValid = form.whatsapp.length === country.len
  const formValid = !!buyerAccount || (!!resolvedName && phoneValid)

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
          buyer_name: buyerAccount?.nombre ?? resolvedName ?? '',
          buyer_phone: buyerAccount ? buyerAccount.phone : `${country.code}${form.whatsapp}`,
          document_type: 'DNI',
          document_number: form.document_number,
          address: null,
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

      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowModal(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] bg-white rounded-t-3xl z-50 overflow-y-auto max-h-[95vh]">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} className="text-gray-500" /></button>

            <div className="px-5 pb-8 pt-2">
              <h2 className="text-xl font-black text-gray-900 mb-0.5">¡Un paso más! 🎉</h2>
              <p className="text-sm text-gray-500 mb-4">Completa tus datos y coordinamos la entrega por el chat.</p>

              {/* Packs */}
              {packs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={14} className="text-green-600" />
                    <label className="text-xs font-black text-gray-800 uppercase tracking-wide">Elige tu pack · mientras más llevas, más ahorras</label>
                  </div>
                  <div className="space-y-2">
                    {packs.map((p, i) => {
                      const active = packIdx === i
                      const isBest = i === bestIdx && packs.length > 1
                      return (
                        <button key={i} onClick={() => setPackIdx(i)}
                          className={`relative w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left transition-all ${active ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                          {isBest && (
                            <span className="absolute -top-2 left-4 text-[9px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#16A34A' }}>⭐ MÁS ELEGIDO · MEJOR PRECIO</span>
                          )}
                          <div>
                            <p className={`text-sm font-black ${active ? 'text-green-800' : 'text-gray-800'}`}>{p.nombre}</p>
                            <p className="text-[10px] text-gray-400">{p.descripcion || (i > 0 ? '¡Aprovecha y ahorra!' : 'Opción básica')}</p>
                          </div>
                          <p className={`text-lg font-black ${active ? 'text-green-600' : 'text-gray-700'}`}>S/{p.precio}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {buyerAccount ? (
                <div className="mb-3 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #060C1A, #0D1F3C)', border: '1.5px solid rgba(125,232,255,0.3)' }}>
                  <span className="text-lg">⚡</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: '#7DE8FF' }}>Comprando como {buyerAccount.nombre?.split(' ')[0] || 'ti'}</p>
                    <p className="text-xs" style={{ color: 'rgba(125,232,255,0.5)' }}>{buyerAccount.document_type} {buyerAccount.document_number} · Score {buyerAccount.score}/100</p>
                  </div>
                  <button onClick={() => { setBuyerAccount(null); setForm({ whatsapp: '', document_type: 'DNI', document_number: '' }) }}
                    className="text-xs px-2 py-1 rounded-lg self-start" style={{ color: 'rgba(125,232,255,0.5)', background: 'rgba(255,255,255,0.05)' }}>Cambiar</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* DNI */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Tu DNI *</label>
                    <input value={form.document_number}
                      onChange={e => setForm(f => ({ ...f, document_number: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                      placeholder="Tus 8 dígitos" type="tel" inputMode="numeric"
                      className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none font-mono tracking-widest" />
                    {looking && <p className="text-[11px] text-gray-400 mt-1.5">Validando tu DNI…</p>}
                    {resolvedName && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                        <ShieldCheck size={14} className="text-green-600 flex-shrink-0" />
                        <p className="text-xs font-black text-green-800 truncate">{resolvedName}</p>
                      </div>
                    )}
                    {notFound && !looking && (
                      <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#DC2626' }}>No pudimos validar ese DNI. Revisa los 8 dígitos.</p>
                    )}
                    {!resolvedName && !looking && !notFound && (
                      <p className="text-[11px] text-gray-400 mt-1.5 flex items-start gap-1">
                        <ShieldCheck size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                        Con tu DNI validamos tu identidad y guardamos tu historial de pedidos. Es seguro y no lo compartimos.
                      </p>
                    )}
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Tu WhatsApp *</label>
                    <div className="flex gap-2">
                      <select value={country.code}
                        onChange={e => { const c = COUNTRIES.find(x => x.code === e.target.value)!; setCountry(c); setForm(f => ({ ...f, whatsapp: f.whatsapp.slice(0, c.len) })) }}
                        className="bg-gray-100 rounded-2xl px-2 py-3 text-sm outline-none font-bold text-gray-700 flex-shrink-0">
                        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
                      </select>
                      <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value.replace(/\D/g, '').slice(0, country.len) }))}
                        placeholder={`${country.len} dígitos`} type="tel" inputMode="numeric"
                        className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                    </div>
                    {form.whatsapp.length > 0 && !phoneValid && (
                      <p className="text-[11px] text-amber-600 mt-1">Ingresa los {country.len} dígitos de tu número en {country.name}.</p>
                    )}
                  </div>
                </div>
              )}

              <button onClick={handleSubmit} disabled={!formValid || submitting}
                className="w-full mt-4 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 font-black py-4 rounded-2xl text-base shadow-lg disabled:opacity-40 active:scale-95 transition-transform border-b-4 border-amber-500">
                {submitting ? 'Registrando…' : `¡Confirmar pedido! S/${precio} →`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
