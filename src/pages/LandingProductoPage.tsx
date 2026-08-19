import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CheckoutModal, { type StoreYape } from '../components/checkout/CheckoutModal'
import { buildPackSelection } from '../lib/checkout/product-packs'
import { loadLastOrder, type LastOrder } from '../lib/checkout/persistence'
import type { CheckoutState } from '../lib/checkout/types'

// Landing de producto (Sales Engine). La imagen vende; el CTA abre el checkout.
//
// Un solo checkout: `CheckoutModal`. El viejo (`CheckoutQuiz`) se eliminó —no
// cobraba adelanto, y ahora TODO pedido lo lleva, también en Lima. Dejarlo como
// escotilla significaba que el botón de emergencia era "cobrar S/0", que es
// peor que la emergencia.
//
// Lo que se mide ahora son dos VERSIONES del mismo checkout (A y B), sorteadas
// en `lib/checkout/variant.ts`. Ver docs/01-SALES-ENGINE.md.
/** Producto de la landing. Vivía dentro del checkout viejo; al eliminarlo se
 *  trae aquí, que es el único sitio que lo usa. */
export interface Pack { nombre: string; descripcion?: string; precio: number; image?: string }
export interface Product {
  id: string; store_id: string | null; nombre: string
  precio: number; images: string[]; packs: Pack[]
}

export default function LandingProductoPage() {
  const { landingId } = useParams<{ landingId: string }>()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  /** La consulta falló (red caída). Distinto de "no existe": uno se reintenta. */
  const [failed, setFailed] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  // Pedido reciente de este navegador, si lo hay. Ver `saveLastOrder`.
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null)
  const [packIdx, setPackIdx] = useState(0)
  // Datos de cobro de la MARCA. Cada tienda yapea a su propio número, así que
  // salen de `stores`, nunca de config.
  const [yape, setYape] = useState<StoreYape | null>(null)
  // `true` mientras no se sepa: la marca que sí reparte a domicilio no debe
  // perder la opción por un instante de carga. Si no reparte, el switch llega
  // en el mismo fetch que el Yape y la opción desaparece antes del paso 2.
  const [homeDelivery, setHomeDelivery] = useState(true)

  // El `setLoading(false)` vivía DENTRO del `.then`, sin `catch`: una caída de
  // red —el escenario normal del comprador en 4G— dejaba la landing girando
  // para siempre, sin mensaje ni forma de reintentar. Un spinner eterno en la
  // página que vende es una venta perdida sin rastro. Ahora el apagado del
  // spinner es incondicional y el fallo tiene su propia pantalla.
  useEffect(() => {
    if (!landingId) { setLoading(false); return }
    let alive = true
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('products').select('id, store_id, nombre, precio, images, packs')
          .eq('id', landingId).maybeSingle()
        if (!alive) return
        // Un `error` del servidor (p. ej. un id mal escrito en el link) NO es
        // una caída de red: la petición llegó y respondió. Cae en "no
        // encontrado", que es la verdad, y no en "revisa tu conexión".
        if (error) { setProduct(null); return }
        const p = data as Product | null
        setProduct(p)
        // Pre-selecciona el pack de mayor valor (suele ser más unidades / mejor precio).
        if (p?.packs?.length) setPackIdx(p.packs.length - 1)
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [landingId])

  useEffect(() => {
    const storeId = product?.store_id
    if (!storeId) return
    supabase.from('stores')
      .select('yape_number, yape_holder, yape_qr_url, home_delivery_enabled')
      .eq('id', storeId).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setYape({ number: data.yape_number, holder: data.yape_holder, qrUrl: data.yape_qr_url })
        // `?? true` y no `!!`: una tienda de antes de la columna llega con el
        // campo ausente, y apagarle el domicilio por eso rompería su operación.
        setHomeDelivery(data.home_delivery_enabled ?? true)
      })
  }, [product?.store_id])

  useEffect(() => { setLastOrder(loadLastOrder()) }, [])

  const packSelection = useMemo(
    () => buildPackSelection(product?.packs, product?.precio ?? 0, product?.images ?? []),
    [product],
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>
  // Un fallo de red NO se disfraza de "no existe": al comprador que sí tiene el
  // link correcto hay que darle un botón, no un callejón sin salida.
  if (failed) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ background: '#FFFDF5' }}>
      <p className="text-sm text-gray-500">No pudimos cargar el producto. Revisa tu conexión.</p>
      <button onClick={() => window.location.reload()}
        className="px-5 py-3 rounded-2xl font-black text-sm text-white" style={{ background: 'var(--brand)' }}>
        Reintentar
      </button>
    </div>
  )
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
        {/* Con un pedido reciente, la barra ofrece las DOS cosas: comprar otra vez
            y volver al pedido que ya hizo. Al cerrar la ventana de confirmación
            el comprador se quedaba sin ninguna vía de vuelta al chat —feedback
            real— y el chat es lo que sostiene la tasa de entrega.
            "Ver mi pedido" va en secundario: la landing sigue siendo para
            vender, no para dar seguimiento. */}
        {lastOrder && (
          <a href={`/p/${lastOrder.token}`}
            className="font-black px-4 py-3.5 rounded-2xl text-sm flex-shrink-0 border-2 border-green-500 text-green-700 bg-white active:scale-95 transition-transform">
            Ver mi pedido
          </a>
        )}
        <button onClick={() => setShowQuiz(true)}
          className="bg-green-500 text-white font-black px-6 py-3.5 rounded-2xl text-sm shadow-lg shadow-green-200 active:scale-95 transition-transform flex-shrink-0">
          ¡Lo quiero!
        </button>
      </div>

      {showQuiz && (
        <CheckoutModal
          packs={packSelection.packs}
          unitPrice={packSelection.unitPrice}
          bestPackId={packSelection.defaultPackId}
          initialPack={packSelection.defaultPackId}
          onClose={() => { setShowQuiz(false); setLastOrder(loadLastOrder()) }}
          onPartialLead={state => saveCheckoutDraft(state, product)}
          yape={yape}
          homeDeliveryEnabled={homeDelivery}
          submitContext={{
            storeId: product.store_id ?? '',
            productId: product.id,
            productName: product.nombre,
          }}
        />
      )}
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
