// ─── Generador: CSV de sedes Shalom → JSON de agencias + centroides ──────────
// Fuente: scripts/sources/shalom-sedes.csv
// Salida: src/data/agencies/shalom.json
//         src/data/coverage/district-centroids.json
//
// OJO — el CSV original trae las coordenadas CORRUPTAS: se exportó con locale
// español y el punto decimal quedó leído como separador de miles, así que
// "-6.677954" llegó como "-6.677.954". Afecta a 487 de 488 filas. Este script las
// reconstruye y valida; ver la función recover() para el detalle del algoritmo.
//
// Uso: node scripts/build-agencies.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'scripts/sources/shalom-sedes.csv'
const OUT_AGENCIES = 'src/data/agencies/shalom.json'
const OUT_CENTROIDS = 'src/data/coverage/district-centroids.json'

// Centroide aproximado de cada departamento. Se usa SOLO para desambiguar dónde
// va el punto decimal (ver recover), nunca como coordenada de entrega.
const DEPT_CENTROID = {
  AMAZONAS: [-5.1, -78.0], ANCASH: [-9.4, -77.8], APURIMAC: [-14.0, -72.9],
  AREQUIPA: [-16.0, -72.5], AYACUCHO: [-13.8, -74.0], CAJAMARCA: [-6.8, -78.5],
  CALLAO: [-12.05, -77.12], CUSCO: [-13.4, -72.0], HUANCAVELICA: [-12.8, -74.9],
  HUANUCO: [-9.5, -76.0], ICA: [-14.2, -75.6], JUNIN: [-11.5, -75.0],
  'LA LIBERTAD': [-8.1, -78.6], LAMBAYEQUE: [-6.4, -79.9], LIMA: [-11.9, -76.9],
  LORETO: [-4.5, -74.5], 'MADRE DE DIOS': [-12.0, -70.5], MOQUEGUA: [-17.0, -70.9],
  PASCO: [-10.5, -75.3], PIURA: [-5.2, -80.4], PUNO: [-15.3, -70.2],
  'SAN MARTIN': [-7.0, -76.7], TACNA: [-17.8, -70.3], TUMBES: [-3.8, -80.5],
  UCAYALI: [-9.5, -73.5],
}

// Límites de Perú — cualquier candidato fuera de aquí se descarta de plano.
const LAT_RANGE = [-18.6, -0.02]
const LNG_RANGE = [-81.5, -68.5]

const deaccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// Parser de CSV con comillas: varias direcciones traen comas dentro del campo.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter(r => r.some(f => f.trim()))
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

// Reconstruye una coordenada a la que el export le comió el punto decimal.
// "-6.677.954" → dígitos "6677954" → candidatos -6.677954 y -66.77954. Se filtran
// por los límites de Perú y, si aún quedan dos (pasa en 317 filas: -1.20 y -12.07
// son ambas latitudes válidas), gana la más cercana al centroide del departamento
// que la propia fila declara.
function recover(raw, refDeg, [lo, hi]) {
  const digits = String(raw).replace(/[^0-9]/g, '').replace(/^0+/, '')
  const candidates = []
  for (const cut of [1, 2]) {
    if (digits.length <= cut) continue
    const v = -Number(`${digits.slice(0, cut)}.${digits.slice(cut)}`)
    if (v >= lo && v <= hi) candidates.push(v)
  }
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => Math.abs(a - refDeg) <= Math.abs(b - refDeg) ? a : b)
}

const rows = parseCsv(readFileSync(SRC, 'utf8'))
const branches = []
const rejected = []

for (const r of rows) {
  const dept = norm(r.departamento)
  const ref = DEPT_CENTROID[dept]
  if (!ref) { rejected.push([r.ter_id, `departamento desconocido: ${dept}`]); continue }

  // `nombre` viene como "DEPARTAMENTO / PROVINCIA / DISTRITO / SEDE" y la
  // provincia calza con su columna en las 488 filas, así que el distrito —que es
  // la llave contra la cobertura de Aliclic— se puede extraer de aquí.
  const parts = r.nombre.split('/').map(s => s.trim())
  const district = parts.length >= 4 ? parts[2] : null

  const lat = recover(r.latitud, ref[0], LAT_RANGE)
  const lng = recover(r.longitud, ref[1], LNG_RANGE)
  if (lat === null || lng === null) { rejected.push([r.ter_id, 'coordenada irrecuperable']); continue }

  // Registro de QA del propio Shalom: declarado en Lima con coordenada de Arequipa.
  if (/PRUEBA|TEST|\bQA\b/i.test(r.lugar_over)) { rejected.push([r.ter_id, `registro de prueba: ${r.lugar_over}`]); continue }

  branches.push({
    id: r.ter_id,
    name: r.lugar_over || parts.at(-1) || '',
    district,
    province: r.provincia,
    department: r.departamento,
    address: r.direccion.replace(/\s+/g, ' ').trim(),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  })
}

writeFileSync(OUT_AGENCIES, JSON.stringify({
  _generated: 'node scripts/build-agencies.mjs — NO editar a mano',
  _source: SRC,
  // El teléfono del CSV es el call center (7 valores para 488 sedes), no la sede.
  // Se omite a propósito: mostrarlo como "teléfono de tu agencia" sería mentir.
  branches,
}))

// Centroide por distrito, promediando las sedes que caen en él. No es el centro
// geométrico real del distrito, pero ancla el pin mucho mejor que nada y no
// depende de ninguna fuente externa. Se reemplaza si algún día hay data oficial.
const byDistrict = new Map()
for (const b of branches) {
  if (!b.district) continue
  const key = `${norm(b.department)}|${norm(b.district)}`
  if (!byDistrict.has(key)) byDistrict.set(key, [])
  byDistrict.get(key).push(b)
}
const centroids = {}
for (const [key, list] of byDistrict) {
  centroids[key] = {
    lat: Number((list.reduce((s, b) => s + b.lat, 0) / list.length).toFixed(5)),
    lng: Number((list.reduce((s, b) => s + b.lng, 0) / list.length).toFixed(5)),
    from: list.length, // nº de sedes promediadas — 1 sede = ancla más floja
  }
}
writeFileSync(OUT_CENTROIDS, JSON.stringify({
  _generated: 'node scripts/build-agencies.mjs — NO editar a mano',
  _note: 'Centroide aproximado por distrito, derivado de las sedes Shalom. Solo ancla el mapa.',
  centroids,
}))

console.log(`✓ ${OUT_AGENCIES}`)
console.log(`  ${branches.length} sedes de ${rows.length} filas · ${rejected.length} descartadas`)
for (const [id, why] of rejected) console.log(`    - ter_id=${id}: ${why}`)
console.log(`✓ ${OUT_CENTROIDS}`)
console.log(`  ${Object.keys(centroids).length} distritos con centroide`)
