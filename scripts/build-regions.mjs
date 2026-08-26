// ─── Generador: celdas territoriales para el mapa de pedidos en vivo ─────────
// Fuente:  src/data/coverage/district-centroids.json (provincias y departamentos)
// Salida:  src/data/coverage/region-cells.json
//
// Qué son: la partición de Voronoi de los centroides. A cada provincia le toca
// la zona más cercana a su centroide, y el borde entre dos zonas es la línea
// media entre ellas.
//
// APROXIMADAS, y hay que decirlo: no son los límites oficiales del INEI. Son
// una división que se calcula con lo que ya tenemos —los centroides derivados
// de las 902 sedes de Shalom y Olva— y que en el mapa cumple lo que tiene que
// cumplir: que un pedido caiga en su zona y que el país se lea como territorio
// dividido, no como una nube de puntos. Un shapefile oficial pesa megas y hay
// que licenciarlo; esto son 40 KB y es nuestro.
//
// Cómo: media-plano por media-plano (Sutherland–Hodgman). Para cada centroide
// se parte del rectángulo del país y se recorta contra la mediatriz que lo
// separa de cada otro centroide. O(n²) con n=165 es nada en build.
//
// Corre DESPUÉS de build-centroids. Ver `npm run build:data`.

import { readFileSync, writeFileSync } from 'node:fs'

const IN = 'src/data/coverage/district-centroids.json'
const OUT = 'src/data/coverage/region-cells.json'

// El país, con aire: las sedes llegan de -3.4 a -18.1 de latitud.
const CAJA = { minLng: -81.6, maxLng: -68.5, minLat: -18.6, maxLat: -3.2 }

const rectangulo = () => [
  { x: CAJA.minLng, y: CAJA.minLat },
  { x: CAJA.maxLng, y: CAJA.minLat },
  { x: CAJA.maxLng, y: CAJA.maxLat },
  { x: CAJA.minLng, y: CAJA.maxLat },
]

/** Recorta un polígono contra el semiplano más cercano a `a` que a `b`. */
function recortar(poligono, a, b) {
  // Mediatriz de ab: los puntos p con  (p - m) · d <= 0  quedan del lado de `a`.
  const d = { x: b.x - a.x, y: b.y - a.y }
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dentro = p => (p.x - m.x) * d.x + (p.y - m.y) * d.y <= 0
  const corte = (p, q) => {
    const dp = (p.x - m.x) * d.x + (p.y - m.y) * d.y
    const dq = (q.x - m.x) * d.x + (q.y - m.y) * d.y
    const t = dp / (dp - dq)
    return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }
  }

  const salida = []
  for (let i = 0; i < poligono.length; i++) {
    const p = poligono[i]
    const q = poligono[(i + 1) % poligono.length]
    const pDentro = dentro(p)
    const qDentro = dentro(q)
    if (pDentro) salida.push(p)
    if (pDentro !== qDentro) salida.push(corte(p, q))
  }
  return salida
}

function celdas(centroides) {
  const sitios = Object.entries(centroides).map(([nombre, c]) => ({ nombre, x: c.lng, y: c.lat }))
  return sitios.map(sitio => {
    let poligono = rectangulo()
    for (const otro of sitios) {
      if (otro === sitio || poligono.length === 0) continue
      poligono = recortar(poligono, sitio, otro)
    }
    return {
      id: sitio.nombre,
      // 4 decimales ≈ 11 m: de sobra para un mapa de país, y pesa la mitad.
      puntos: poligono.map(p => [Number(p.x.toFixed(4)), Number(p.y.toFixed(4))]),
    }
  }).filter(c => c.puntos.length >= 3)
}

const fuente = JSON.parse(readFileSync(IN, 'utf8'))
const salida = {
  _generated: 'node scripts/build-regions.mjs — NO editar a mano',
  _note: 'Celdas de Voronoi sobre los centroides. APROXIMADAS: no son los límites oficiales del INEI.',
  caja: CAJA,
  provincias: celdas(fuente.provinces),
  departamentos: celdas(fuente.departments),
}

writeFileSync(OUT, JSON.stringify(salida))
const kb = (JSON.stringify(salida).length / 1024).toFixed(1)
console.log(`${OUT}: ${salida.provincias.length} provincias + ${salida.departamentos.length} departamentos (${kb} KB)`)
