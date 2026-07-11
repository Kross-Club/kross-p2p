import { useEffect, useState } from 'react'
import { X, Package, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OrderSession } from '../lib/order-api'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const STAGE_LABEL: Record<string, string> = {
  nuevo: '📋 Pedido creado', confirmado: '📞 Confirmado', preparando: '📦 Preparando',
  en_camino: '🚚 En camino', entregado: '✅ Entregado',
}

const NOTAS: { key: string; label: string; color: string }[] = [
  { key: 'no_contesta', label: 'No contesta', color: '#F59E0B' },
  { key: 'recuperado', label: 'Recuperado', color: '#16A34A' },
  { key: 'cancelado', label: 'Cancelado', color: '#DC2626' },
  { key: 'anulado', label: 'Anulado', color: '#6B7280' },
]

const LOSES = [
  'Comprar sin pagar adelanto',
  'Recibir en la puerta de tu casa',
  'Garantía de satisfacción con reembolso',
  'Promociones y descuentos cada mes',
]

export default function OrderDetailModal({ session, role, onClose, onPatch }: {
  session: OrderSession
  role: 'buyer' | 'seller'
  onClose: () => void
  onPatch: (patch: Partial<OrderSession>) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [viewer, setViewer] = useState<number | null>(null)

  useEffect(() => {
    if (!session.product_id) return
    supabase.from('products').select('images').eq('id', session.product_id).maybeSingle()
      .then(({ data }) => setImages((data?.images as string[]) ?? []))
  }, [session.product_id])

  const post = (payload: Record<string, unknown>) =>
    fetch(`${BASE}/order-manage`, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await post({ action: 'cancel', session_id: session.id, by: role })
      if (!res.ok) { alert('No se pudo cancelar.'); return }
      onPatch({ status: 'cancelado' }); onClose()
    } finally { setBusy(false) }
  }

  const recreate = async () => {
    setBusy(true)
    try {
      const res = await post({ action: 'recreate', session_id: session.id })
      if (!res.ok) { alert('No se pudo reactivar.'); return }
      onPatch({ status: 'active', stage: 'nuevo', nota: 'recuperado' }); onClose()
    } finally { setBusy(false) }
  }

  const setNota = async (nota: string | null) => {
    onPatch({ nota })
    await post({ action: 'set_nota', session_id: session.id, nota })
  }

  const cancelled = session.status === 'cancelado'
  const stageText = cancelled ? '❌ Pedido cancelado' : (STAGE_LABEL[session.stage] ?? session.stage)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
        <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-900 flex items-center gap-2"><Package size={18} /> Tu pedido</h3>
            <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
          </div>

          {/* Carrusel angosto (imágenes verticales, se ve más info) */}
          {images.length > 0 && (
            <div className="-mx-1 mb-3">
              <div className="flex gap-2 overflow-x-auto px-1 pb-1 snap-x">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setViewer(i)}
                    className="snap-start flex-shrink-0 rounded-xl overflow-hidden bg-gray-100"
                    style={{ width: 96 }}>
                    <img src={img} alt={`Imagen ${i + 1}`} className="w-full object-cover" style={{ height: 128 }} />
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-1">Desliza y toca para ver en grande →</p>
            </div>
          )}

          <div className="rounded-2xl p-4 mb-3" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
            <p className="font-black text-gray-900 text-base">{session.product_name || 'Producto'}</p>
            {session.pack_name && <p className="text-xs text-gray-500 mt-0.5">{session.pack_name}</p>}
            <p className="font-black text-2xl mt-1" style={{ color: '#16A34A' }}>S/{session.product_price ?? 0}</p>
          </div>

          <div className="space-y-2 mb-4">
            <Row label="Estado" value={stageText} />
            {session.order_id && <Row label="N° de pedido" value={session.order_id} />}
            {session.seller_name && <Row label="Te atiende" value={`${session.seller_name.split(' ')[0]}${session.seller_role ? ` · ${session.seller_role}` : ''}`} />}
          </div>

          {/* Notas CRM (solo vendedor) */}
          {role === 'seller' && (
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Nota (CRM)</p>
              <div className="flex flex-wrap gap-1.5">
                {NOTAS.map(n => {
                  const on = session.nota === n.key
                  return (
                    <button key={n.key} onClick={() => setNota(on ? null : n.key)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: on ? n.color : `${n.color}18`, color: on ? '#fff' : n.color }}>
                      {n.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Acciones */}
          {cancelled ? (
            role === 'seller' ? (
              <button onClick={recreate} disabled={busy}
                className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                <RefreshCw size={15} /> {busy ? 'Reactivando…' : 'Reactivar pedido (recuperar venta)'}
              </button>
            ) : (
              <div className="text-center py-2 text-sm font-bold" style={{ color: '#DC2626' }}>Este pedido está cancelado</div>
            )
          ) : !confirming ? (
            <button onClick={() => setConfirming(true)}
              className="w-full py-3 rounded-2xl font-black text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
              Cancelar pedido
            </button>
          ) : (
            <div className="rounded-2xl p-4" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={18} style={{ color: '#DC2626' }} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-black">
                  {role === 'buyer' ? 'Si cancelas, bajarás tu puntuación y perderás la posibilidad de:' : '¿Seguro que deseas cancelar este pedido?'}
                </p>
              </div>
              {role === 'buyer' && (
                <>
                  <ul className="space-y-1.5 mb-3 pl-1">
                    {LOSES.map(l => (
                      <li key={l} className="flex items-start gap-2 text-xs text-red-700">
                        <span className="font-black flex-shrink-0" style={{ color: '#DC2626' }}>✕</span><span>{l}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-600 font-black mb-3">¿Seguro que quieres cancelar?</p>
                </>
              )}
              {role === 'seller' && <p className="text-xs text-red-600 mb-3">Esta acción no se puede deshacer.</p>}
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm bg-white border border-gray-200 text-gray-600">No, mantener</button>
                <button onClick={cancel} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#DC2626' }}>{busy ? 'Cancelando…' : 'Sí, cancelar'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewer !== null && images.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex justify-end p-4">
            <button onClick={() => setViewer(null)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <X size={20} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory items-center" onClick={e => e.stopPropagation()}>
            {images.map((img, i) => (
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold text-gray-800">{value}</span>
    </div>
  )
}
