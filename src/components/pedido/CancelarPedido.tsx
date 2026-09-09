import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Cancelar, desde el lado del comprador ───────────────────────────────────
// Vivía en `OrderDetailModal`, que el comprador abría desde «Ver pedido». Su
// detalle ahora es la hoja del ticket (`DetalleDelPedido`), y cancelar sigue
// siendo lo único que puede hacer con el pedido entero: se le enseña lo que
// pierde antes de preguntar, como siempre.

const PIERDE = [
  'Comprar sin pagar adelanto',
  'Recibir en la puerta de tu casa',
  'Garantía de satisfacción con reembolso',
  'Promociones y descuentos cada mes',
]

export default function CancelarPedido({ sessionId, onCancelado }: {
  sessionId: string
  onCancelado: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const cancelar = async () => {
    setOcupado(true)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', session_id: sessionId, by: 'buyer' }),
      })
      if (!res.ok) { alert('No se pudo cancelar.'); return }
      onCancelado()
    } finally { setOcupado(false) }
  }

  if (!confirmando) {
    return (
      <div className="flex justify-center py-5">
        <button type="button" onClick={() => setConfirmando(true)}
          className="h-11 px-4 text-[13px] font-bold rounded-xl" style={{ color: '#DC2626' }}>
          Cancelar pedido
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: '#FEF2F2', border: '0.5px solid #FECACA' }}>
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={18} style={{ color: '#DC2626' }} className="flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700 font-black">Si cancelas, bajarás tu puntuación y perderás la posibilidad de:</p>
      </div>
      <ul className="space-y-1.5 mb-3 pl-1">
        {PIERDE.map(l => (
          <li key={l} className="flex items-start gap-2 text-xs text-red-700">
            <span className="font-black flex-shrink-0" style={{ color: '#DC2626' }}>✕</span><span>{l}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-red-600 font-black mb-3">¿Seguro que quieres cancelar?</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirmando(false)} disabled={ocupado}
          className="flex-1 py-2.5 rounded-xl font-black text-sm bg-white border border-gray-200 text-gray-600">No, mantener</button>
        <button type="button" onClick={cancelar} disabled={ocupado}
          className="flex-1 py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#DC2626' }}>
          {ocupado ? 'Cancelando…' : 'Sí, cancelar'}
        </button>
      </div>
    </div>
  )
}
