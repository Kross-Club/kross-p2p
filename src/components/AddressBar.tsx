import { useState } from 'react'
import { MapPin, Navigation, Copy } from 'lucide-react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Delivery address in the chat.
//  · Buyer: the ONLY one who sets/changes it — one tap captures GPS, reverse-
//    geocodes and saves. When verified, "Verificar GPS" becomes "Cambiar".
//  · Seller: read-only. Can open Google Maps / Waze and copy the coordinates.
export default function AddressBar({ sessionId, address, verified, lat, lng, role, onUpdated }: {
  sessionId: string
  address: string | null
  verified: boolean
  lat?: number | null
  lng?: number | null
  role: 'buyer' | 'seller'
  onUpdated: (address: string, verified: boolean, lat: number | null, lng: number | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [secs, setSecs] = useState(0)
  const [copied, setCopied] = useState(false)

  // Collect GPS readings for a few seconds and keep the most accurate one, so
  // the pin lands on the house (not the first, coarse fix on the road). This is
  // what ride-hailing apps do — let the GPS converge.
  const getBestFix = () => new Promise<GeolocationCoordinates | null>(resolve => {
    if (!navigator.geolocation) return resolve(null)
    let best: GeolocationCoordinates | null = null
    let done = false
    const finish = () => { if (done) return; done = true; try { navigator.geolocation.clearWatch(id) } catch { /* */ } resolve(best) }
    const start = Date.now()
    const id = navigator.geolocation.watchPosition(
      p => {
        if (!best || p.coords.accuracy < best.accuracy) best = p.coords
        // Stop early only if it's very precise AND we've given GPS a moment to settle
        if (best.accuracy <= 8 && Date.now() - start > 3500) finish()
      },
      () => { if (!best) finish() },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    setTimeout(finish, 10000) // let it converge up to ~10s
  })

  const verifyGps = async () => {
    if (busy) return
    setBusy(true)
    setSecs(10)
    const iv = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    try {
      const coords = await getBestFix()
      if (!coords) { alert('Activa tu ubicación GPS para verificar tu dirección de entrega.'); return }
      // Reject imprecise fixes (typically a laptop/WiFi location) so no bad pin is saved
      if (typeof coords.accuracy === 'number' && coords.accuracy > 80) {
        alert(`Tu ubicación es poco precisa (±${Math.round(coords.accuracy)} m). Sal a un lugar más abierto (o párate en tu puerta) y toca Verificar GPS otra vez. Mejor desde tu celular.`)
        return
      }
      const res = await fetch(`${BASE}/update-address`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, address: address ?? '', lat: coords.latitude, lng: coords.longitude, by: 'buyer' }),
      })
      if (!res.ok) throw new Error('failed')
      const r = await res.json()
      onUpdated(r.address, r.address_verified, r.address_lat, r.address_lng)
    } catch {
      alert('No se pudo verificar la ubicación. Intenta de nuevo.')
    } finally {
      clearInterval(iv)
      setBusy(false)
      setSecs(0)
    }
  }

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid #F0F0F0' }}>
      {/* Row 1: icon + title + badge + button, all in one line */}
      <div className="flex items-center gap-2">
        <MapPin size={15} style={{ color: '#EF4444' }} className="flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          Dirección de entrega
          {verified
            ? <span className="ml-1 whitespace-nowrap" style={{ color: '#16A34A' }}>✓ Verificada</span>
            : <span className="ml-1 whitespace-nowrap" style={{ color: '#F59E0B' }}>· Sin verificar</span>}
        </p>
        {role === 'buyer' && (
          <button onClick={verifyGps} disabled={busy}
            className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-xl flex-shrink-0 disabled:opacity-50"
            style={verified ? { background: '#EEF9FF', color: 'var(--brand)' } : { background: '#FFF7ED', color: '#EA580C' }}>
            {busy ? `Ubicando… ${secs}s` : verified ? <><Navigation size={11} /> Cambiar</> : <><Navigation size={11} /> Verificar GPS</>}
          </button>
        )}
      </div>

      {/* Full address — may span several lines */}
      {busy && role === 'buyer' ? (
        <p className="text-xs font-semibold mt-1.5 break-words" style={{ color: 'var(--brand)' }}>
          📍 Buscando tu ubicación exacta… espera unos segundos sin cerrar.
        </p>
      ) : (
        <p className="text-xs font-semibold text-gray-700 mt-1.5 break-words">
          {address || (role === 'buyer' ? 'Toca “Verificar GPS”' : 'El comprador aún no la verifica')}
        </p>
      )}

      {/* Map links + coords (once GPS-located). Seller also gets Waze. */}
      {hasCoords && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed #eee' }}>
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: '#E8F0FE', color: '#1A73E8' }}>
            <Navigation size={11} /> Google Maps
          </a>
          {role === 'seller' && (
            <a href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: '#E7FBFF', color: '#33CCFF' }}>
              <Navigation size={11} /> Waze
            </a>
          )}
          <button onClick={() => { navigator.clipboard?.writeText(`${lat},${lng}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg ml-auto" style={{ background: '#F3F4F6', color: '#555' }}>
            <Copy size={11} /> {copied ? '¡Copiado!' : 'Coordenadas'}
          </button>
        </div>
      )}
    </div>
  )
}
