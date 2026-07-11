import { useState } from 'react'
import { MapPin, Check, Pencil, X, Navigation, Copy } from 'lucide-react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Delivery address shown in the chat. Both buyer and seller can edit it, but a
// buyer edit must be confirmed with the phone's GPS (that's what "verified" means).
export default function AddressBar({ sessionId, address, verified, lat, lng, role, onUpdated }: {
  sessionId: string
  address: string | null
  verified: boolean
  lat?: number | null
  lng?: number | null
  role: 'buyer' | 'seller'
  onUpdated: (address: string, verified: boolean, lat: number | null, lng: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(address ?? '')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/update-address`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('update_failed')
    return res.json() as Promise<{ address: string; address_verified: boolean; address_lat: number | null; address_lng: number | null }>
  }

  const save = async () => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      if (role === 'buyer') {
        const coords = await new Promise<GeolocationCoordinates | null>(resolve => {
          if (!navigator.geolocation) return resolve(null)
          navigator.geolocation.getCurrentPosition(
            p => resolve(p.coords), () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        })
        if (!coords) {
          alert('Activa tu ubicación GPS para validar tu dirección de entrega.')
          setBusy(false)
          return
        }
        const r = await post({ session_id: sessionId, address: v, lat: coords.latitude, lng: coords.longitude, by: 'buyer' })
        onUpdated(r.address, r.address_verified, r.address_lat, r.address_lng)
      } else {
        const r = await post({ session_id: sessionId, address: v, by: 'seller' })
        onUpdated(r.address, r.address_verified, r.address_lat, r.address_lng)
      }
      setEditing(false)
    } catch {
      alert('No se pudo actualizar la dirección. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid #F0F0F0' }}>
      {!editing ? (
        <div className="flex items-center gap-2">
          <MapPin size={15} style={{ color: '#EF4444' }} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 flex items-center gap-1">
              Entrega
              {verified
                ? <span className="flex items-center gap-0.5" style={{ color: '#16A34A' }}><Check size={10} /> GPS ✓</span>
                : <span style={{ color: '#F59E0B' }}>· sin validar GPS</span>}
            </p>
            <p className="text-xs font-semibold text-gray-700 truncate">{address || 'Sin dirección'}</p>
          </div>
          {(() => {
            // Buyer: "Validar" until GPS-confirmed, then "Editar". Seller: always "Editar".
            const needsValidate = role === 'buyer' && !verified
            return (
              <button onClick={() => { setValue(address ?? ''); setEditing(true) }}
                className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-xl flex-shrink-0"
                style={needsValidate ? { background: '#FFF7ED', color: '#EA580C' } : { background: '#EEF9FF', color: '#55C8F5' }}>
                {needsValidate ? <><Navigation size={11} /> Validar</> : <><Pencil size={11} /> Editar</>}
              </button>
            )
          })()}
        </div>
      ) : null}

      {/* Map links for the courier (when validated by GPS) */}
      {!editing && typeof lat === 'number' && typeof lng === 'number' && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed #eee' }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg"
            style={{ background: '#E8F0FE', color: '#1A73E8' }}>
            <Navigation size={11} /> Google Maps
          </a>
          <a href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg"
            style={{ background: '#E7FBFF', color: '#33CCFF' }}>
            <Navigation size={11} /> Waze
          </a>
          <button onClick={() => { navigator.clipboard?.writeText(`${lat},${lng}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg ml-auto"
            style={{ background: '#F3F4F6', color: '#555' }}>
            <Copy size={11} /> {copied ? '¡Copiado!' : 'Coords'}
          </button>
        </div>
      )}

      {editing && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Dirección de entrega</p>
            <button onClick={() => setEditing(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={2}
            placeholder="Calle, número, distrito, referencia…"
            className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none resize-none"
          />
          <button onClick={save} disabled={busy || !value.trim()}
            className="w-full mt-2 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: '#55C8F5', color: '#fff' }}>
            {role === 'buyer' ? <><Navigation size={12} /> {busy ? 'Validando con GPS…' : 'Guardar y validar con GPS'}</> : (busy ? 'Guardando…' : 'Guardar dirección')}
          </button>
          {role === 'buyer' && (
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">Necesitamos tu ubicación para confirmar la entrega 📍</p>
          )}
        </div>
      )}
    </div>
  )
}
