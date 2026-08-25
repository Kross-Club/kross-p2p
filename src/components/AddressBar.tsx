import { useEffect, useState } from 'react'
import { MapPin, Navigation, Copy } from 'lucide-react'
import { isPickupDispatch } from '../lib/session'
import { AgencyService } from '../lib/checkout/services/AgencyService'
import type { AgencyBranch, AgencyName } from '../lib/checkout/types'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Delivery address in the chat.
//  · Buyer: the ONLY one who sets/changes it — one tap captures GPS, reverse-
//    geocodes and saves. When verified, "Verificar GPS" becomes "Cambiar".
//  · Seller: read-only. Can open Google Maps / Waze and copy the coordinates.
export default function AddressBar({ sessionId, address, verified, lat, lng, role, dispatchType, agencyName, agencyBranchId, onUpdated }: {
  sessionId: string
  address: string | null
  verified: boolean
  lat?: number | null
  lng?: number | null
  role: 'buyer' | 'seller'
  /** Cómo se entrega. Sin esto el componente pedía GPS también en los recojos
   *  en agencia — ver el comentario de `isPickup`. */
  dispatchType?: string | null
  agencyName?: string | null
  /** Sede de recojo elegida en el checkout. Con ella el chat dice A DÓNDE va el
   *  paquete; sin ella cae al texto del pedido, que es el distrito del
   *  comprador — otra cosa, y ya visible en su ficha. */
  agencyBranchId?: string | null
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

  // Recojo en agencia: el paquete va a un mostrador, no a una puerta. Pedirle
  // GPS al comprador aquí no solo no sirve —le estampa la coordenada de SU CASA
  // a un pedido que nunca va a ir ahí, y Logística termina viendo un domicilio
  // con botones de Maps y Waze para una entrega que es de counter. Ya pasó: un
  // pedido a Shalom quedó con `address_verified` y un pin de vivienda.
  //
  // La máquina del checkout ya decide esto mismo (`needsLocationConfirmation`
  // es false en agencia); lo que faltaba era que el chat se enterara.
  // Por helper y no por igualdad: desde que Lima puede recoger en agencia hay
  // dos valores de recojo, y comparar contra uno solo le pedía el pin de su casa
  // a quien va a pasar por el mostrador.
  const isPickup = isPickupDispatch(dispatchType)
  const hasCoords = !isPickup && typeof lat === 'number' && typeof lng === 'number'

  // La sede, resuelta contra el MISMO catálogo que usó el comprador al elegirla
  // (y el generador de guías al despachar): un solo listado para las dos puntas
  // del envío. Es async porque el JSON de sedes se carga aparte del bundle.
  const [branch, setBranch] = useState<AgencyBranch | null>(null)
  useEffect(() => {
    let vivo = true
    const sede = isPickup && agencyBranchId && agencyName
      ? AgencyService.getBranch(agencyName as AgencyName, agencyBranchId)
      : Promise.resolve(null)
    sede.then(b => { if (vivo) setBranch(b) })
    return () => { vivo = false }
  }, [isPickup, agencyBranchId, agencyName])

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid var(--border)' }}>
      {/* Row 1: icon + title + badge + button, all in one line */}
      <div className="flex items-center gap-2">
        <MapPin size={15} style={{ color: '#EF4444' }} className="flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          {isPickup ? `Recojo en agencia${agencyName ? ` · ${agencyName}` : ''}` : 'Dirección de entrega'}
          {/* En agencia no hay nada que verificar, así que tampoco hay por qué
              alarmar con un "sin verificar" naranja: el pedido está completo. */}
          {isPickup ? null : verified
            ? <span className="ml-1 whitespace-nowrap" style={{ color: 'var(--ok-fg)' }}>✓ Verificada</span>
            : <span className="ml-1 whitespace-nowrap" style={{ color: '#F59E0B' }}>· Sin verificar</span>}
        </p>
        {role === 'buyer' && !isPickup && (
          <button onClick={verifyGps} disabled={busy}
            className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-xl flex-shrink-0 disabled:opacity-50"
            style={verified ? { background: 'var(--brand-tint)', color: 'var(--brand)' } : { background: 'var(--warn-bg-soft)', color: 'var(--warn-fg)' }}>
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
          {/* En agencia, lo que importa es a QUÉ mostrador va el paquete. El
              `address` del pedido es el distrito del comprador —que ya se ve en
              su ficha— y mandaba a Logística a la ciudad equivocada: un pedido
              de Chaclacayo que se recoge en Huaycán se leía como "Chaclacayo". */}
          {isPickup && branch ? (
            <>
              <span className="font-black">{branch.name}</span>
              <span className="block font-semibold text-gray-500">{branch.address}</span>
              <span className="block text-[11px] text-gray-400">{branch.district} · {branch.province}</span>
            </>
          ) : (
            address || (isPickup
              ? 'Agencia por confirmar'
              : role === 'buyer' ? 'Toca “Verificar GPS”' : 'El comprador aún no la verifica')
          )}
        </p>
      )}

      {/* Map links + coords (once GPS-located). Seller also gets Waze. */}
      {hasCoords && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed #eee' }}>
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}>
            <Navigation size={11} /> Google Maps
          </a>
          {role === 'seller' && (
            <a href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--brand-tint)', color: '#33CCFF' }}>
              <Navigation size={11} /> Waze
            </a>
          )}
          <button onClick={() => { navigator.clipboard?.writeText(`${lat},${lng}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg ml-auto" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
            <Copy size={11} /> {copied ? '¡Copiado!' : 'Coordenadas'}
          </button>
        </div>
      )}
    </div>
  )
}
