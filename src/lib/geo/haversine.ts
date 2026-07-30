// ─── SMART LOGISTICS · Distancia geodésica ───────────────────────────────────
// Función pura, sin dependencias. La usa AgencyService para ordenar las sedes
// Shalom por cercanía al pin del comprador. Ver docs/02-SMART-LOGISTICS.md.

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371.0088 // radio medio (IUGG)
const toRad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Distancia en kilómetros entre dos puntos sobre la superficie terrestre.
 * Error < 0.5 % frente a la elipsoide — de sobra para "¿qué agencia me queda
 * más cerca?", que es el único uso.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Formatea una distancia para mostrarla al comprador: "850 m" / "3.4 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
