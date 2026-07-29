import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CheckoutQuiz, { type Product, type BuyerAccount } from '../components/checkout/CheckoutQuiz'
import CheckoutModal from '../components/checkout/CheckoutModal'
import { buildPackSelection } from '../lib/checkout/product-packs'
import type { CheckoutState } from '../lib/checkout/types'

// Landing de producto (Sales Engine). La imagen vende; el CTA abre el checkout.
//
// Hay DOS checkouts conviviendo a propósito:
//   · por defecto → CheckoutQuiz, el actual, que sí cierra pedidos.
//   · ?checkout=v2 → el refactor multi-paso (Fase 2). Su paso 3 todavía no
//     registra el pedido, así que va detrás de una bandera para poder revisarlo
//     con producto y tienda reales sin tocar el flujo que hoy vende.
// El viejo se borra cuando el nuevo cierre pedidos. Ver docs/01-SALES-ENGINE.md.
export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()
  const [searchParams] = useSearchParams()
  const useNewCheckout = searchParams.get('checkout') === 'v2'

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

  const packSelection = useMemo(
    () => buildPackSelection(product?.packs, product?.precio ?? 0, product?.images ?? []),
    [product],
  )

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

      {showQuiz && (useNewCheckout ? (
        <CheckoutModal
          packs={packSelection.packs}
          unitPrice={packSelection.unitPrice}
          bestPackId={packSelection.defaultPackId}
          initialPack={packSelection.defaultPackId}
          onClose={() => setShowQuiz(false)}
          onPartialLead={state => saveCheckoutDraft(state, product)}
        />
      ) : (
        <CheckoutQuiz
          product={product}
          packs={packs}
          initialPackIdx={packIdx}
          buyerAccount={buyerAccount}
          onClose={() => setShowQuiz(false)}
        />
      ))}
    </div>
  )
}

// ─── Lead parcial ────────────────────────────────────────────────────────────
// Se dispara apenas el WhatsApp es válido, aunque el comprador abandone después.
// No bloquea nada: si falla, el checkout sigue igual.
async function saveCheckoutDraft(state: CheckoutState, product: Product) {
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-checkout-draft`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: state.orderId,
        store_id: product.store_id,
        whatsapp: state.customerInfo.whatsapp,
        receiver_name: state.customerInfo.receiverName,
        dni: state.customerInfo.dni,
        product_id: product.id,
        location_type: state.locationType,
        district: state.limaAddress?.district ?? state.provinciaConfig?.district ?? null,
        step: state.step,
      }),
    })
  } catch {
    // Recuperar abandonos es un extra: nunca puede costar el pedido en curso.
  }
}
