import { useState } from 'react'
import { X, Package, AlertTriangle } from 'lucide-react'
import type { OrderSession } from '../lib/order-api'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const STAGE_LABEL: Record<string, string> = {
  nuevo: '📋 Pedido recibido', confirmado: '📞 Confirmado', preparando: '📦 Preparando',
  en_camino: '🚚 En camino', entregado: '✅ Entregado', cancelado: '❌ Cancelado',
}

export default function OrderDetailModal({ session, role, onClose, onCancelled }: {
  session: OrderSession
  role: 'buyer' | 'seller'
  onClose: () => void
  onCancelled: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', session_id: session.id, by: role }),
      })
      if (!res.ok) { alert('No se pudo cancelar. Intenta de nuevo.'); return }
      onCancelled()
      onClose()
    } finally { setBusy(false) }
  }

  const cancelled = session.status === 'cancelado'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900 flex items-center gap-2"><Package size={18} /> Tu pedido</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Product info */}
        <div className="rounded-2xl p-4 mb-3" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
          <p className="font-black text-gray-900 text-base">{session.product_name || 'Producto'}</p>
          {session.pack_name && <p className="text-xs text-gray-500 mt-0.5">{session.pack_name}</p>}
          <p className="font-black text-2xl mt-1" style={{ color: '#16A34A' }}>S/{session.product_price ?? 0}</p>
        </div>

        <div className="space-y-2 mb-4">
          <Row label="Estado" value={STAGE_LABEL[session.stage] ?? session.stage} />
          {session.order_id && <Row label="N° de pedido" value={session.order_id} />}
          {session.seller_name && <Row label="Te atiende" value={`${session.seller_name.split(' ')[0]}${session.seller_role ? ` · ${session.seller_role}` : ''}`} />}
        </div>

        {/* Cancel */}
        {cancelled ? (
          <div className="text-center py-2 text-sm font-bold" style={{ color: '#DC2626' }}>Este pedido está cancelado</div>
        ) : !confirming ? (
          <button onClick={() => setConfirming(true)}
            className="w-full py-3 rounded-2xl font-black text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
            Cancelar pedido
          </button>
        ) : (
          <div className="rounded-2xl p-4" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle size={18} style={{ color: '#DC2626' }} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-semibold">
                {role === 'buyer'
                  ? 'Si cancelas, bajará tu puntuación y perderás beneficios como recibir sin adelanto. ¿Seguro que quieres cancelar?'
                  : '¿Seguro que deseas cancelar este pedido? Esta acción no se puede deshacer.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm bg-white border border-gray-200 text-gray-600">
                No, mantener
              </button>
              <button onClick={cancel} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#DC2626' }}>
                {busy ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
