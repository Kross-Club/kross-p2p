import { useState } from 'react'
import { PackageCheck, Pencil } from 'lucide-react'
import { isPickupDispatch } from '../lib/session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Tracking del envío por agencia en el chat del pedido (contrato `shipment`).
//  · Vendedor (Logística): registra la guía del comprobante (numero + codigo,
//    misma regla que la API real de Shalom) y ve la fase reflejada.
//  · Comprador: ve la guía y la fase; los avisos de transición le llegan como
//    mensajes del sistema (los escribe `shalom-tracking-sync`).
// Solo SHALOM por ahora: la capa de consulta de Olva existe, su reflejo 🔮.

const PHASES = [
  { key: 'EN_ORIGEN', label: 'Registrado' },
  { key: 'EN_TRANSITO', label: 'En camino' },
  { key: 'EN_DESTINO', label: 'En agencia' },
  { key: 'ENTREGADO', label: 'Entregado' },
] as const

export interface TrackingFields {
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_codigo?: string | null
  tracking_ose_id?: string | null
  tracking_phase?: string | null
  tracking_demora_at?: string | null
}

export default function TrackingBar({ sessionId, role, dispatchType, agencyName, tracking, onUpdated }: {
  sessionId: string
  role: 'buyer' | 'seller'
  dispatchType?: string | null
  agencyName?: string | null
  tracking: TrackingFields
  onUpdated: (t: TrackingFields) => void
}) {
  const [editing, setEditing] = useState(false)
  const [numero, setNumero] = useState('')
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registered = !!tracking.tracking_courier
  const courier = tracking.tracking_courier ?? agencyName ?? null

  // Solo pedidos de recojo en agencia, y solo SHALOM tiene reflejo construido.
  if (!isPickupDispatch(dispatchType)) return null
  if (!registered && (role !== 'seller' || courier !== 'SHALOM')) return null

  const numeroOk = /^\d{8,10}$/.test(numero.replace(/\D/g, ''))
  const codigoOk = /^[A-Za-z0-9]{4}$/.test(codigo.trim())

  const save = async () => {
    if (busy || !numeroOk || !codigoOk) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_tracking', session_id: sessionId,
          tracking: { courier: 'SHALOM', numero: numero.replace(/\D/g, ''), codigo: codigo.trim().toUpperCase() },
        }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok || !r.ok) throw new Error('failed')
      onUpdated(r.tracking as TrackingFields)
      setEditing(false)
      setNumero(''); setCodigo('')
    } catch {
      setError('No se pudo registrar la guía. Revisa los datos e intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const phaseIdx = PHASES.findIndex(p => p.key === tracking.tracking_phase)
  const showForm = role === 'seller' && (!registered || editing)

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid #F0F0F0' }}>
      <div className="flex items-center gap-2">
        <PackageCheck size={15} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          {registered ? `Envío ${courier}` : `Registrar envío · ${courier}`}
          {tracking.tracking_demora_at && (
            <span className="ml-1 whitespace-nowrap" style={{ color: '#F59E0B' }}>· Demora reportada</span>
          )}
        </p>
        {role === 'seller' && registered && !editing && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: '#F3F4F6', color: '#555' }}>
            <Pencil size={10} /> Corregir
          </button>
        )}
      </div>

      {registered && !editing && (
        <>
          <p className="text-xs font-semibold text-gray-700 mt-1.5 break-words">
            {tracking.tracking_numero
              ? <>Guía <span className="font-black">{tracking.tracking_numero}</span> · Código <span className="font-black">{tracking.tracking_codigo}</span></>
              : <>Orden de servicio <span className="font-black">{tracking.tracking_ose_id}</span></>}
          </p>
          {/* Línea de fases: la actual y las ya pasadas en marca; el resto gris */}
          <div className="flex items-center gap-1 mt-2">
            {PHASES.map((p, i) => (
              <div key={p.key} className="flex-1 text-center">
                <div className="h-1 rounded-full mb-1"
                  style={{ background: i <= phaseIdx ? 'var(--brand)' : '#E5E7EB' }} />
                <p className="text-[8px] font-black uppercase leading-tight"
                  style={{ color: i === phaseIdx ? 'var(--brand)' : i < phaseIdx ? '#9CA3AF' : '#D1D5DB' }}>
                  {p.label}
                </p>
              </div>
            ))}
          </div>
          {phaseIdx < 0 && (
            <p className="text-[10px] font-semibold text-gray-400 mt-1">
              Esperando el primer estado del courier…
            </p>
          )}
        </>
      )}

      {showForm && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input value={numero} onChange={e => setNumero(e.target.value)} inputMode="numeric"
              placeholder="Guía (8–10 dígitos)" maxLength={10}
              className="flex-1 min-w-0 text-xs font-semibold px-2.5 py-2 rounded-xl outline-none"
              style={{ border: '1.5px solid #E5E7EB' }} />
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
              placeholder="Código" maxLength={4}
              className="w-20 text-xs font-semibold px-2.5 py-2 rounded-xl outline-none uppercase"
              style={{ border: '1.5px solid #E5E7EB' }} />
            <button onClick={save} disabled={busy || !numeroOk || !codigoOk}
              className="text-[11px] font-black px-3 py-2 rounded-xl flex-shrink-0 disabled:opacity-40"
              style={{ background: 'var(--brand)', color: '#fff' }}>
              {busy ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
          <p className="text-[10px] font-semibold text-gray-400 mt-1.5">
            Los dos vienen impresos en el comprobante de {courier}. La guía le llega al comprador por el chat.
          </p>
          {error && <p className="text-[10px] font-bold mt-1" style={{ color: '#DC2626' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
