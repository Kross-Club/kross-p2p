// Vercel serverless function — geo aproximada por IP para el selector de
// distritos. El navegador no puede leer los headers x-vercel-ip-* que Vercel
// inyecta en cada request, así que aquí solo se re-exponen como JSON.
//
// La coordenada es la del hub del proveedor de internet, no la del comprador
// (los datos móviles peruanos salen casi siempre "desde Lima"): por eso el
// front la usa solo para ORDENAR la lista, nunca para filtrar. Ver
// src/lib/checkout/services/GeoHintService.ts.

export default function handler(req, res) {
  const lat = parseFloat(req.headers['x-vercel-ip-latitude'])
  const lng = parseFloat(req.headers['x-vercel-ip-longitude'])
  const country = req.headers['x-vercel-ip-country']
  const city = req.headers['x-vercel-ip-city']

  // La IP puede cambiar de red en red: cache corto y privado.
  res.setHeader('Cache-Control', 'private, max-age=900')

  // Fuera del Perú la cercanía no ordena nada útil (un VPN en Miami pondría
  // Tumbes primero para todo el mundo): mejor null que un prior sin sentido.
  if (country !== 'PE' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(200).json(null)
    return
  }

  // Vercel manda la ciudad URI-encoded ("San%20Isidro").
  res.status(200).json({ lat, lng, city: city ? decodeURIComponent(city) : null })
}
