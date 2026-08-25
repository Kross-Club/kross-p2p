import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OrderMessage } from '../lib/order-api'

type Offer = NonNullable<OrderMessage['offer']>

export default function OfferCard({ offer, role, onAccept }: {
  offer: Offer
  role: 'buyer' | 'seller'
  onAccept?: () => void
}) {
  const [imgs, setImgs] = useState<string[]>(offer.image ? [offer.image] : [])
  const [viewer, setViewer] = useState<number | null>(null)
  const accepted = !!offer.accepted

  useEffect(() => {
    if (!offer.product_id) return
    supabase.from('products').select('images').eq('id', offer.product_id).maybeSingle()
      .then(({ data }) => { const arr = (data?.images as string[]) ?? []; if (arr.length) setImgs(arr) })
  }, [offer.product_id])

  return (
    <>
      <div className={`flex ${role === 'buyer' ? 'justify-start' : 'justify-end'} mb-3`}>
        <div className="max-w-[85%] rounded-2xl overflow-hidden" style={{ border: '0.5px solid var(--warn-border)', background: 'var(--warn-bg-soft)' }}>
          {imgs[0] && (
            <button onClick={() => setViewer(0)} className="block w-full relative">
              <img src={imgs[0]} alt={offer.nombre} className="w-full h-32 object-cover" />
              {imgs.length > 1 && (
                <span className="absolute bottom-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  Ver {imgs.length} fotos
                </span>
              )}
            </button>
          )}
          <div className="p-3">
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--warn-fg)' }}>
              🎁 {role === 'buyer' ? 'Oferta especial para ti' : 'Oferta enviada'}
            </p>
            <p className="font-black text-gray-900 text-sm mt-0.5">{offer.nombre}</p>
            <p className="font-black text-xl" style={{ color: 'var(--ok-fg)' }}>S/ {offer.precio}</p>

            {role === 'buyer' && (
              accepted ? (
                <div className="w-full mt-2 py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}>
                  <Check size={15} /> Oferta aceptada
                </div>
              ) : (
                <button onClick={onAccept} className="w-full mt-2 py-2.5 rounded-xl font-black text-sm text-white" style={{ background: '#16A34A' }}>
                  Aceptar oferta
                </button>
              )
            )}
            {role === 'seller' && accepted && (
              <p className="text-[11px] font-black mt-1.5 flex items-center gap-1" style={{ color: 'var(--ok-fg)' }}><Check size={12} /> Aceptada por el cliente</p>
            )}
          </div>
        </div>
      </div>

      {viewer !== null && imgs.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex justify-end p-4">
            <button onClick={() => setViewer(null)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <X size={20} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory items-center" onClick={e => e.stopPropagation()}>
            {imgs.map((img, i) => (
              <div key={i} className="snap-center flex-shrink-0 w-full h-full flex items-center justify-center px-2"
                ref={el => { if (el && i === viewer) el.scrollIntoView({ inline: 'center' }) }}>
                <img src={img} alt={`Imagen ${i + 1}`} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <p className="text-center text-white/50 text-xs pb-4">Desliza para ver más ‹ ›</p>
        </div>
      )}
    </>
  )
}
