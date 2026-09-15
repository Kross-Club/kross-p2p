import { useState } from 'react'
import { ExternalLink, FileText, RefreshCw } from 'lucide-react'
import type { OrderSession } from '../lib/order-api'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── La boleta del pedido, en el panel del vendedor (§58) ────────────────────
//
// Una línea: qué boleta tiene el pedido y en qué está. La emisión es
// automática al quedar pagado; el botón es para cuando no salió —Nubefact
// caído, la marca configuró la facturación después— y para el pedido que se
// pagó antes de que existiera esto. Es idempotente en el servidor: tocarlo
// dos veces no emite dos boletas.
//
// Sin la facturación configurada el servidor contesta `sin_configurar` y acá
// se dice a dónde ir. En la tienda de ejemplo no se factura: se dice.

const ESTADO: Record<string, { texto: string; color: string }> = {
  ACEPTADA: { texto: 'Aceptada por SUNAT', color: 'var(--ok-fg)' },
  EMITIDA: { texto: 'Emitida · SUNAT pendiente', color: 'var(--warn-fg)' },
  PENDIENTE: { texto: 'Emitiendo…', color: 'var(--text-muted)' },
  ERROR: { texto: 'No se pudo emitir', color: '#B91C1C' },
  RECHAZADA: { texto: 'Rechazada por SUNAT', color: '#B91C1C' },
}

const MOTIVO: Record<string, string> = {
  sin_configurar: 'Esta marca no tiene la facturación configurada. Ve a Marca → Facturación electrónica.',
  sin_pagar: 'La boleta sale cuando el pedido está pagado completo.',
  en_curso: 'La boleta ya se está emitiendo. Recarga en unos segundos.',
  no_encontrado: 'No se encontró el pedido.',
}

export default function BoletaDelPedido({ session, demo, onUpdated }: {
  session: Pick<OrderSession, 'id' | 'boleta_serie' | 'boleta_numero' | 'boleta_estado' | 'boleta_url' | 'boleta_error' | 'payment_verification'>
  demo?: boolean
  onUpdated?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const estado = session.boleta_estado ? ESTADO[session.boleta_estado] : null
  const ref = session.boleta_serie && session.boleta_numero ? `${session.boleta_serie}-${session.boleta_numero}` : null
  // Solo con el adelanto cruzado tiene sentido ofrecerla: antes, ni el botón.
  if (session.payment_verification !== 'MATCHED' && !session.boleta_estado) return null

  const emitir = async () => {
    if (busy) return
    setBusy(true); setAviso(null)
    try {
      if (demo) { setAviso('En la tienda de ejemplo no se factura: la boleta sale con Nubefact en una marca real.'); return }
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'emitir_boleta', session_id: session.id }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok || !r.ok) {
        setAviso(MOTIVO[r.error] ?? r.detalle ?? 'No se pudo emitir la boleta. Intenta de nuevo.')
        onUpdated?.()
        return
      }
      onUpdated?.()
    } catch {
      setAviso('El servidor no respondió. Revisa tu conexión e intenta de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-2.5 flex items-center gap-3"
      style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
      <FileText size={16} className="flex-shrink-0" style={{ color: estado?.color ?? 'var(--text-faint)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black" style={{ color: 'var(--text)' }}>
          Boleta electrónica{ref ? ` ${ref}` : ''}
        </p>
        <p className="text-[10px] leading-snug" style={{ color: estado?.color ?? 'var(--text-muted)' }}>
          {estado?.texto ?? 'Sin emitir'}
          {session.boleta_estado === 'ERROR' && session.boleta_error ? ` · ${session.boleta_error}` : ''}
        </p>
        {aviso && <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--warn-fg)' }}>{aviso}</p>}
      </div>
      {session.boleta_url ? (
        <a href={session.boleta_url} target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-lg"
          style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
          Ver <ExternalLink size={11} />
        </a>
      ) : (
        <button type="button" onClick={emitir} disabled={busy || session.boleta_estado === 'PENDIENTE'}
          className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
          <RefreshCw size={11} /> {busy ? 'Emitiendo…' : session.boleta_estado === 'ERROR' ? 'Reintentar' : 'Emitir boleta'}
        </button>
      )}
    </div>
  )
}
