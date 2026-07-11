import { useState } from 'react'
import { MapPin, Check, Pencil, X, Navigation, Copy } from 'lucide-react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Delivery address in the chat.
//  · Buyer: validates directly with GPS (no manual typing) — one tap captures
//    the location, reverse-geocodes it and saves. When verified, "Verificar GPS"
//    becomes "Cambiar".
//  · Seller: edits the text manually (that invalidates the GPS validation).
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

  // Buyer: capture GPS → save (no editing screen)
  const verifyGps = async () => {
    if (busy) return
    setBusy(true)
    try {
      const coords = await new Promise<GeolocationCoordinates | null>(resolve => {
        if (!navigator.geolocation) return resolve(null)
        navigator.geolocation.getCurrentPosition(p => resolve(p.coords), () => resolve(null), { enableHighAccuracy: true, timeout: 10000 })
      })
      if (!coords) { alert('Activa tu ubicación GPS para verificar tu dirección de entrega.'); return }
      const r = await post({ session_id: sessionId, address: address ?? '', lat: coords.latitude, lng: coords.longitude, by: 'buyer' })
      onUpdated(r.address, r.address_verified, r.address_lat, r.address_lng)
    } catch {
      alert('No se pudo verificar la ubicación. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  // Seller: save typed address
  const saveText = async () => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      const r = await post({ session_id: sessionId, address: v, by: 'seller' })
      onUpdated(r.address, r.address_verified, r.address_lat, r.address_lng)
      setEditing(false)
    } catch {
      alert('No se pudo actualizar la dirección.')
    } finally {
      setBusy(false)
    }
  }

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid #F0F0F0' }}>
      {!editing && (
        <div className="flex items-center gap-2">
          <MapPin size={15} style={{ color: '#EF4444' }} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 flex items-center gap-1">
              Dirección de entrega
              {verified
                ? <span className="flex items-center gap-0.5" style={{ color: '#16A34A' }}><Check size={10} /> Ubicación verificada</span>
                : <span style={{ color: '#F59E0B' }}>· sin verificar</span>}
            </p>
            <p className="text-xs font-semibold text-gray-700 truncate">{address || 'Sin dirección'}</p>
          </div>

          {role === 'buyer' ? (
            <button onClick={verifyGps} disabled={busy}
              className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-xl flex-shrink-0 disabled:opacity-50"
              style={verified ? { background: '#EEF9FF', color: '#55C8F5' } : { background: '#FFF7ED', color: '#EA580C' }}>
              {busy ? 'Ubicando…' : verified ? <><Navigation size={11} /> Cambiar</> : <><Navigation size={11} /> Verificar GPS</>}
            </button>
          ) : (
            <button onClick={() => { setValue(address ?? ''); setEditing(true) }}
              className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-xl flex-shrink-0"
              style={{ background: '#EEF9FF', color: '#55C8F5' }}>
              <Pencil size={11} /> Editar
            </button>
          )}
        </div>
      )}

      {/* Map link + coords for the courier (once GPS-located) */}
      {!editing && hasCoords && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed #eee' }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: '#E8F0FE', color: '#1A73E8' }}>
            <Navigation size={11} /> Google Maps
          </a>
          <button onClick={() => { navigator.clipboard?.writeText(`${lat},${lng}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg ml-auto" style={{ background: '#F3F4F6', color: '#555' }}>
            <Copy size={11} /> {copied ? '¡Copiado!' : 'Coordenadas'}
          </button>
        </div>
      )}

      {/* Seller-only manual edit */}
      {editing && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Dirección de entrega</p>
            <button onClick={() => setEditing(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <textarea value={value} onChange={e => setValue(e.target.value)} rows={2} placeholder="Calle, número, distrito, referencia…"
            className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none resize-none" />
          <button onClick={saveText} disabled={busy || !value.trim()}
            className="w-full mt-2 py-2 rounded-xl font-black text-xs disabled:opacity-50" style={{ background: '#55C8F5', color: '#fff' }}>
            {busy ? 'Guardando…' : 'Guardar dirección'}
          </button>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Al cambiarla, el comprador deberá verificarla otra vez con GPS.</p>
        </div>
      )}
    </div>
  )
}
