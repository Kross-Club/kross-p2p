// ─── Generador: silueta del Perú para el mapa de pedidos en vivo ─────────────
// Fuente:  Natural Earth 1:50m Admin 0 – Countries (dominio público, sin
//          atribución obligatoria). https://www.naturalearthdata.com
// Salida:  src/data/coverage/peru-outline.json
//
// Uso (el GeoJSON de origen NO vive en el repo, pesa 3 MB):
//   curl -sO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//   node scripts/build-peru-outline.mjs ne_50m_admin_0_countries.geojson
//
// Se simplifica con Douglas–Peucker a ~2 km de tolerancia: en un mapa de país
// entero esa diferencia no se ve, y baja de cientos de KB a decenas.

import { readFileSync, writeFileSync } from 'node:fs'

const ENTRADA = process.argv[2]
const SALIDA = 'src/data/coverage/peru-outline.json'
const TOLERANCIA = 0.02   // grados ≈ 2 km

if (!ENTRADA) {
  console.error('Falta el GeoJSON de Natural Earth. Ver la cabecera de este archivo.')
  process.exit(1)
}

/** Douglas–Peucker: se queda con los vértices que cambian la forma. */
function simplificar(puntos, tol) {
  if (puntos.length < 3) return puntos
  const distancia = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    const c = [a[0] + Math.max(0, Math.min(1, t)) * dx, a[1] + Math.max(0, Math.min(1, t)) * dy]
    return Math.hypot(p[0] - c[0], p[1] - c[1])
  }
  let peor = 0, indice = 0
  for (let i = 1; i < puntos.length - 1; i++) {
    const d = distancia(puntos[i], puntos[0], puntos[puntos.length - 1])
    if (d > peor) { peor = d; indice = i }
  }
  if (peor <= tol) return [puntos[0], puntos[puntos.length - 1]]
  return [
    ...simplificar(puntos.slice(0, indice + 1), tol).slice(0, -1),
    ...simplificar(puntos.slice(indice), tol),
  ]
}

const geo = JSON.parse(readFileSync(ENTRADA, 'utf8'))
const peru = geo.features.find(f => (f.properties.ADM0_A3 ?? f.properties.ISO_A3) === 'PER')
if (!peru) { console.error('No se encontró el Perú en el GeoJSON.'); process.exit(1) }

const bruto = peru.geometry.type === 'Polygon' ? [peru.geometry.coordinates] : peru.geometry.coordinates
const anillos = bruto
  .map(p => p[0])                                    // solo el anillo exterior
  .map(a => simplificar(a, TOLERANCIA).map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]))
  .filter(a => a.length >= 4)
  .sort((a, b) => b.length - a.length)               // el continente primero

const salida = {
  _generated: 'node scripts/build-peru-outline.mjs — NO editar a mano',
  _source: 'Natural Earth 1:50m Admin 0 Countries (dominio público)',
  anillos,
}
writeFileSync(SALIDA, JSON.stringify(salida))
console.log(`${SALIDA}: ${anillos.length} anillos, ${anillos.reduce((n, a) => n + a.length, 0)} puntos (${(JSON.stringify(salida).length / 1024).toFixed(1)} KB)`)
