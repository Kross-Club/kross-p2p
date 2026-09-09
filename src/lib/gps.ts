// ─── La dirección del comprador, capturada por GPS ───────────────────────────
//
// Vivía dentro de `AddressBar`, y la tarjeta del pedido del comprador
// (`TarjetaDelPedido`) la necesita igual: verificar la dirección es LA acción
// de un pedido a domicilio mientras no esté verificada, y la barra de
// dirección ya no se pinta en su chat. Lo que decide y lo que guarda es lo
// mismo venga de donde venga: se recogen lecturas unos segundos y se queda la
// más precisa —lo que hacen las apps de taxi, dejar que el GPS converja—, se
// rechaza una lectura imprecisa (típicamente una laptop por WiFi) para no
// guardar un pin malo, y se manda a `update-address` como comprador.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Peor precisión que se acepta, en metros. Más que esto no es la puerta. */
export const PRECISION_MAXIMA_M = 80

export type ResultadoGps =
  | { ok: true; address: string; address_verified: boolean; address_lat: number | null; address_lng: number | null }
  | { ok: false; motivo: 'sin_gps' | 'imprecisa' | 'fallo'; precision?: number }

/** Recoge lecturas hasta ~10 s y devuelve la más precisa; `null` sin GPS. */
export function mejorLectura(): Promise<GeolocationCoordinates | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    let best: GeolocationCoordinates | null = null
    let done = false
    const finish = () => { if (done) return; done = true; try { navigator.geolocation.clearWatch(id) } catch { /* */ } resolve(best) }
    const start = Date.now()
    const id = navigator.geolocation.watchPosition(
      p => {
        if (!best || p.coords.accuracy < best.accuracy) best = p.coords
        // Se corta antes solo si es muy precisa Y el GPS tuvo un momento para asentarse
        if (best.accuracy <= 8 && Date.now() - start > 3500) finish()
      },
      () => { if (!best) finish() },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    setTimeout(finish, 10000)
  })
}

/** Captura el GPS y lo guarda en el pedido, como comprador. */
export async function verificarDireccionPorGps(sessionId: string, address: string | null): Promise<ResultadoGps> {
  const coords = await mejorLectura()
  if (!coords) return { ok: false, motivo: 'sin_gps' }
  if (typeof coords.accuracy === 'number' && coords.accuracy > PRECISION_MAXIMA_M) {
    return { ok: false, motivo: 'imprecisa', precision: Math.round(coords.accuracy) }
  }
  try {
    const res = await fetch(`${BASE}/update-address`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, address: address ?? '', lat: coords.latitude, lng: coords.longitude, by: 'buyer' }),
    })
    if (!res.ok) return { ok: false, motivo: 'fallo' }
    const r = await res.json()
    return { ok: true, address: r.address, address_verified: r.address_verified, address_lat: r.address_lat, address_lng: r.address_lng }
  } catch {
    return { ok: false, motivo: 'fallo' }
  }
}

/** Qué se le dice cuando no se pudo. Un solo sitio para la barra y la tarjeta. */
export function mensajeDeGps(r: Extract<ResultadoGps, { ok: false }>): string {
  switch (r.motivo) {
    case 'sin_gps': return 'Activa tu ubicación GPS para verificar tu dirección de entrega.'
    case 'imprecisa': return `Tu ubicación es poco precisa (±${r.precision ?? '?'} m). Sal a un lugar más abierto (o párate en tu puerta) y vuelve a intentarlo. Mejor desde tu celular.`
    default: return 'No se pudo verificar la ubicación. Intenta de nuevo.'
  }
}
