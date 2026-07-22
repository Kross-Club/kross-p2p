import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CheckoutQuiz, { type Product, type BuyerAccount } from '../components/checkout/CheckoutQuiz'

// Landing de producto (Sales Engine). La imagen vende; el CTA abre el CheckoutQuiz
// guiado (popup paso-a-paso que consume checkoutReducer). Ver docs/01-SALES-ENGINE.md.
export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [showQuiz, setShowQuiz] = useState(false)
  const [buyerAccount, setBuyerAccount] = useState<BuyerAccount | null>(null)
  const [packIdx, setPackIdx] = useState(0)

  useEffect(() => {
    if (!landingId) return
    supabase.from('products').select('id, store_id, nombre, precio, images, packs').eq('id', landingId).maybeSingle()
      .then(({ data }) => {
        const p = data as Product | null
        setProduct(p)
        // Pre-selecciona el pack de mayor valor (suele ser más unidades / mejor precio).
        if (p?.packs?.length) setPackIdx(p.packs.length - 1)
        setLoading(false)
      })
  }, [landingId])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('buyer_session')
      if (!raw) return
      const { buyer } = JSON.parse(raw)
      if (buyer) setBuyerAccount(buyer)
    } catch { /* ignore */ }
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-400">Producto no encontrado</div>

  // Packs ordenados por precio (menor → mayor) para incentivar llevar más.
  const packs = [...(product.packs ?? [])].sort((a, b) => a.precio - b.precio)
  const precio = packs[packIdx]?.precio || product.precio

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
        <button onClick={() => setShowQuiz(true)}
          className="bg-green-500 text-white font-black px-6 py-3.5 rounded-2xl text-sm shadow-lg shadow-green-200 active:scale-95 transition-transform flex-shrink-0">
          ¡Lo quiero!
        </button>
      </div>

      {showQuiz && (
        <CheckoutQuiz
          product={product}
          packs={packs}
          initialPackIdx={packIdx}
          buyerAccount={buyerAccount}
          onClose={() => setShowQuiz(false)}
        />
      )}
    </div>
  )
}
