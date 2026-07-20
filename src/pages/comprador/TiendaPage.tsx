import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShoppingBag, Star, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store-context'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Pack { nombre: string; descripcion?: string; precio: number }
interface Product { id: string; nombre: string; precio: number; images: string[]; packs: Pack[] }

export default function TiendaPage() {
  const navigate = useNavigate()
  const { store } = useStore()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [rate, setRate] = useState(0)
  const [buyer, setBuyer] = useState<{ id: string; nombre: string; phone: string; document_number?: string; puntos: number } | null>(null)
  const [open, setOpen] = useState<Product | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) { navigate('/acceso', { replace: true }); return }
    try { setBuyer(JSON.parse(raw).buyer) } catch { navigate('/acceso', { replace: true }); return }
  }, [navigate])

  useEffect(() => {
    if (!store.id) return
    supabase.from('products').select('id, nombre, precio, images, packs').eq('store_id', store.id).eq('active', true).order('created_at', { ascending: false })
      .then(({ data }) => { setProducts((data as Product[]) ?? []); setLoading(false) })
    supabase.from('stores').select('points_rate').eq('id', store.id).maybeSingle()
      .then(({ data }) => setRate(Number(data?.points_rate ?? 0)))
  }, [store.id])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  return (
    <div className="min-h-screen" style={{ background: '#FFFDF5' }}>
      <div className="px-4 pt-10 pb-5 text-white" style={{ background: `linear-gradient(135deg, ${store.color_primary} 0%, #863bff 100%)` }}>
        <div className="max-w-[430px] mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/mis-pedidos')} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.25)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="font-black text-xl">Tienda {store.nombre}</p>
            {buyer && rate > 0 && buyer.puntos > 0 && (
              <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
                <Star size={12} fill="#FFD400" color="#FFD400" /> {buyer.puntos} pts = S/{(buyer.puntos * rate).toFixed(0)} para descuento
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[430px] mx-auto px-4 py-5">
        {products.length === 0 ? (
          <div className="text-center py-14"><ShoppingBag size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm text-gray-400">Esta tienda aún no tiene productos.</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(p => (
              <button key={p.id} onClick={() => setOpen(p)} className="bg-white rounded-2xl overflow-hidden shadow-sm text-left border border-gray-100">
                <div className="aspect-square bg-gray-100">
                  {p.images[0] ? <img src={p.images[0]} alt={p.nombre} className="w-full h-full object-cover" /> : <ShoppingBag size={28} className="m-auto mt-10 text-gray-300" />}
                </div>
                <div className="p-2.5">
                  <p className="font-black text-xs text-gray-900 truncate">{p.nombre}</p>
                  <p className="text-sm font-black" style={{ color: 'var(--brand)' }}>S/{p.packs?.[0]?.precio ?? p.precio}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && buyer && <OrderSheet product={open} buyer={buyer} storeId={store.id!} rate={rate} onClose={() => setOpen(null)}
        onOrdered={(token) => navigate(`/p/${token}`)} />}
    </div>
  )
}

function OrderSheet({ product, buyer, storeId, rate, onClose, onOrdered }: {
  product: Product; buyer: { id: string; nombre: string; phone: string; document_number?: string; puntos: number }
  storeId: string; rate: number; onClose: () => void; onOrdered: (token: string) => void
}) {
  const packs = [...(product.packs ?? [])].sort((a, b) => a.precio - b.precio)
  const [packIdx, setPackIdx] = useState(packs.length ? packs.length - 1 : -1)
  const [redeem, setRedeem] = useState(false)
  const [busy, setBusy] = useState(false)

  const pack = packIdx >= 0 ? packs[packIdx] : null
  const basePrice = pack?.precio ?? product.precio
  const maxDiscount = rate > 0 ? Math.min(buyer.puntos * rate, basePrice) : 0
  const discount = redeem ? maxDiscount : 0
  const finalPrice = basePrice - discount

  const order = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${BASE}/register-buyer`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId, product_id: product.id, product_name: product.nombre, product_price: basePrice,
          pack_name: pack?.nombre ?? null, buyer_name: buyer.nombre, buyer_phone: buyer.phone,
          document_type: 'DNI', document_number: buyer.document_number,
          redeem_points: redeem ? buyer.puntos : 0,
        }),
      })
      if (res.ok) { const { token } = await res.json(); onOrdered(token) }
      else alert('No se pudo crear el pedido. Intenta de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-gray-900">{product.nombre}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {product.images[0] && <img src={product.images[0]} alt="" className="w-full h-40 object-cover rounded-2xl mb-3" />}

        {packs.length > 0 && (
          <div className="space-y-2 mb-3">
            {packs.map((p, i) => (
              <button key={i} onClick={() => setPackIdx(i)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left ${packIdx === i ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                <span className="text-sm font-black text-gray-800">{p.nombre}</span>
                <span className="text-lg font-black text-green-600">S/{p.precio}</span>
              </button>
            ))}
          </div>
        )}

        {rate > 0 && buyer.puntos > 0 && maxDiscount > 0 && (
          <button onClick={() => setRedeem(r => !r)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 mb-3"
            style={{ background: redeem ? '#DCFCE7' : '#F3F4F6' }}>
            <span className="text-xs font-black flex items-center gap-1.5" style={{ color: redeem ? '#16A34A' : '#666' }}>
              <Star size={13} fill="#FFD400" color="#FFD400" /> Usar mis puntos (−S/{maxDiscount.toFixed(0)})
            </span>
            <span className="text-[10px] font-black px-2 py-1 rounded-full" style={{ background: redeem ? '#16A34A' : '#e5e7eb', color: redeem ? '#fff' : '#888' }}>
              {redeem ? 'SÍ' : 'NO'}
            </span>
          </button>
        )}

        <button onClick={order} disabled={busy}
          className="w-full py-4 rounded-2xl font-black text-base text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {busy ? 'Creando…' : `Pedir ahora · S/${finalPrice.toFixed(0)}`}
        </button>
      </div>
    </div>
  )
}
