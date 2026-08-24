// ─── Pista de ubicación por geo-IP ───────────────────────────────────────────
// De dónde parece abrir el comprador, según los headers de geo-IP que Vercel
// inyecta y `api/geo.js` re-expone. Se usa para UNA sola cosa: ordenar el
// selector de distritos por cercanía antes de que teclee.
//
// Nunca filtra, nunca preselecciona, nunca pide permiso. El prompt de GPS del
// navegador en pleno checkout mata conversión, y la geo-IP en Perú miente
// sistemáticamente: los datos móviles salen por CGNAT del operador y
// geolocalizan a Lima esté donde esté el comprador. Como prior de orden un
// fallo cuesta cero; como filtro costaría la venta.
//
// Fail-soft total: sin red, sin header (dev local, país ≠ PE) o lenta (tope de
// 1.5 s), devuelve null y el selector usa su orden por defecto.

import type { LatLng } from '../../geo/haversine'

let cache: Promise<LatLng | null> | null = null

export function getGeoHint(): Promise<LatLng | null> {
  cache ??= fetch('/api/geo', {
    // En dev no existe /api y Vite devuelve el index.html: el .json() revienta
    // y cae al catch. El timeout evita que una función fría demore el selector.
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(1500) : undefined,
  })
    .then(r => (r.ok ? r.json() : null))
    .then((d: { lat?: unknown; lng?: unknown } | null) =>
      d && typeof d.lat === 'number' && typeof d.lng === 'number'
        ? { lat: d.lat, lng: d.lng }
        : null)
    .catch(() => null)
  return cache
}
