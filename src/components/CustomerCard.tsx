import { MessageCircle, Phone, IdCard } from 'lucide-react'
import type { OrderSession } from '../lib/order-api'

// La ficha del cliente al costado del chat.
//
// El DNI manda: es la identidad del comprador en Kross —un mismo número junta
// sus pedidos aunque cambie de teléfono o escriba el nombre distinto—, así que
// va arriba y copiable, no escondido en un modal.
//
// Lo demás son las dos acciones que el vendedor hace de verdad desde acá:
// escribirle por WhatsApp y llamarlo.
export default function CustomerCard({ session }: { session: OrderSession }) {
  const c = session.buyer_contact
  const nombre = c?.nombre || session.buyer_name || 'Comprador'
  const dni = c?.document_number ?? null
  const tipoDoc = c?.document_type || 'DNI'
  const phone = c?.phone ?? null
  const celular = phone ? phone.slice(-9) : null
  // El distrito vive DENTRO de `address` ("San Borja, Lima"): el primer tramo.
  const distrito = session.address ? session.address.split(',')[0].trim() : null

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-3" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
          {nombre.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>{nombre}</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
            {distrito ?? 'Sin distrito'}
          </p>
        </div>
      </div>

      {dni && (
        <div className="flex items-center gap-1.5 mt-2.5">
          <IdCard size={13} style={{ color: 'var(--text-faint)' }} />
          <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
            {tipoDoc} {dni}
          </p>
        </div>
      )}

      {celular && (
        <div className="flex items-center gap-2 mt-3">
          <a href={`https://wa.me/51${celular}`} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
            <MessageCircle size={13} /> WhatsApp
          </a>
          <a href={`tel:+51${celular}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
            <Phone size={13} /> Llamar
          </a>
        </div>
      )}
    </div>
  )
}
