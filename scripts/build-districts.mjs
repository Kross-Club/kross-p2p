// ─── Generador: cobertura Aliclic por DISTRITO ───────────────────────────────
// Fuente: scripts/sources/aliclic-cobertura-distritos.csv (export de la hoja
//         "COBERTURA OFICIAL" de "COBERTURA ALIDRIVER - ALICLIK", del courier).
// Salida:  src/data/coverage/aliclic-districts.json
//
// Esta es la fuente que DECIDE la cobertura en el checkout. Los polígonos
// (build-coverage.mjs) siguen existiendo, pero solo para enriquecer el pedido
// cuando hay coordenada — no para decidir la venta. Ver docs/02-SMART-LOGISTICS.
//
// Uso: node scripts/build-districts.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'scripts/sources/aliclic-cobertura-distritos.csv'
const OUT = 'src/data/coverage/aliclic-districts.json'
const OUT_INDEX = 'src/data/coverage/peru-districts.json'
const GEO_SRC = 'src/data/peru-geo.ts'

const deaccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

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
  return rows
}

// El tarifario nombra algunas agencias por su PROVINCIA y el mapa de polígonos
// por su CIUDAD. Para que ambas fuentes se crucen, se normaliza al nombre de
// ciudad — que además es el que el comprador reconoce.
const CITY_ALIAS = {
  HUAMANGA: 'AYACUCHO',
  SANTA: 'CHIMBOTE',
  TAMBOPATA: 'PUERTO MALDONADO',
}

// "A001 - HUARAZ" → "HUARAZ". El código de agencia no le sirve al comprador.
// "A026 - PISCO - PISCO" → "PISCO"; "4024 - TACNA" es un typo del courier por
// "A024" y se normaliza igual.
function cityOf(raw) {
  const withoutCode = norm(raw).replace(/^[A4]\d{3}\s*-\s*/, '')
  const city = withoutCode.split(' - ')[0].trim()
  return CITY_ALIAS[city] ?? city
}

/** "15.5 - 20.5" → 15.5 (el piso). "-" o vacío → null. */
function baseTariff(raw) {
  const m = String(raw ?? '').match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

/** ¿La tarifa es un rango? Señal de que el distrito tiene zonas de distinto costo. */
const isRange = raw => /\d\s*-\s*\d/.test(String(raw ?? ''))

const rows = parseCsv(readFileSync(SRC, 'utf8'))
const headerIdx = rows.findIndex(r => norm(r[0]) === 'CIUDAD' && norm(r[1]) === 'DEPARTAMENTO')
if (headerIdx === -1) throw new Error('No se encontró la fila de cabecera en el CSV')

const districts = {}
const cities = {}
let currentCity = null
let skipped = 0

for (const r of rows.slice(headerIdx + 1)) {
  const [rawCity, dept, prov, dist, tiempo, tarifa] = r.map(c => (c ?? '').trim())

  // La columna CIUDAD viene con celdas combinadas: solo la primera fila de cada
  // grupo la trae. Se arrastra hacia abajo.
  if (rawCity) currentCity = cityOf(rawCity)
  if (!dept || !prov || !dist) { skipped++; continue }
  if (!currentCity) throw new Error(`Fila sin ciudad asignada: ${r.join(',')}`)

  const key = `${norm(dept)}|${norm(prov)}|${norm(dist)}`
  if (districts[key]) { skipped++; continue } // duplicado en la hoja

  districts[key] = {
    city: currentCity,
    department: dept,
    province: prov,
    district: dist,
    // Días/horas de entrega tal como los declara el courier.
    eta: tiempo || null,
    // Tarifa base del courier (costo de la marca, NO del comprador).
    tariff: baseTariff(tarifa),
    // Tarifa en rango = el distrito tiene zonas de distinto costo. Es la señal
    // de que el polígono aporta precisión que el distrito no da.
    zoned: isRange(tarifa),
    // El courier solo pasa una vez por semana → prometer domicilio es frágil.
    weekly: /1\s*VEZ\s*(A|POR)\s*(LA\s*)?SEMANA/.test(norm(tiempo)),
    // Entrega restringida a días hábiles.
    weekdaysOnly: /LUNES-VIERNES|LUNES A VIERNES/.test(norm(tiempo)),
  }

  cities[currentCity] ??= { name: currentCity, districts: 0, zoned: 0, weekly: 0 }
  cities[currentCity].districts++
  if (districts[key].zoned) cities[currentCity].zoned++
  if (districts[key].weekly) cities[currentCity].weekly++
}

// ─── Índice de distritos para el selector ────────────────────────────────────
// El selector NO puede salir solo del tarifario (dejaría sin poder comprar a
// todo Perú) ni solo de peru-geo.ts (le faltan 53 de los 178 distritos que el
// courier sí cubre, y esos compradores irían a agencia sin necesidad).
// Se emite la UNIÓN de ambos, con la marca de cobertura ya resuelta.
const geoSrc = readFileSync(GEO_SRC, 'utf8')
// El literal de peru-geo.ts es JS válido pero no JSON (claves sin comillas,
// comillas simples, comas colgantes). Se evalúa como expresión en vez de
// convertirlo con regex, que sería frágil. La fuente es un archivo del repo.
const geoBody = geoSrc.slice(geoSrc.indexOf('{'), geoSrc.lastIndexOf('}') + 1)
const GEO = new Function(`return ${geoBody}`)()

// ─── Equivalencias courier → padrón INEI ─────────────────────────────────────
// El tarifario nombra los distritos como los conoce su operación; el INEI usa
// el nombre oficial. Sin cruzarlos, el MISMO distrito entra dos veces al
// selector: una con cobertura (nombre del courier) y otra sin ella (nombre
// oficial). El comprador ve "Ventanilla" repetido, elige el equivocado y
// termina yendo a agencia cuando tenía entrega a domicilio disponible.
//
// La clave es el nombre del courier YA NORMALIZADO —sin tildes y en mayúsculas,
// tal como lo deja `norm()`—; el valor, el del padrón. Escribir 'PIÑIPAMPA' en
// vez de 'PINIPAMPA' hace que el alias no calce nunca y en silencio.
// Cuando el courier agrupa varios distritos en una fila ("Oropesa - Tipón")
// se mapea al principal: la cobertura es la misma y el tarifario no distingue.
const DISTRICT_ALIAS = {
  // El Callao es su propio departamento en el padrón; el courier lo trata como
  // provincia de Lima. Son 6 distritos que salían duplicados.
  'LIMA|CALLAO|BELLAVISTA': ['Callao', 'Prov. Const. del Callao', 'Bellavista'],
  'LIMA|CALLAO|CALLAO': ['Callao', 'Prov. Const. del Callao', 'Callao'],
  'LIMA|CALLAO|CARMEN DE LA LEGUA REYNOSO': ['Callao', 'Prov. Const. del Callao', 'Carmen de la Legua Reynoso'],
  'LIMA|CALLAO|LA PERLA': ['Callao', 'Prov. Const. del Callao', 'La Perla'],
  'LIMA|CALLAO|LA PUNTA': ['Callao', 'Prov. Const. del Callao', 'La Punta'],
  'LIMA|CALLAO|VENTANILLA': ['Callao', 'Prov. Const. del Callao', 'Ventanilla'],

  'LIMA|LIMA|CERCADO DE LIMA': ['Lima', 'Lima', 'Lima'],
  'LIMA|LIMA|LURIGANCHO - CHOSICA': ['Lima', 'Lima', 'Lurigancho'],
  'UCAYALI|CORONEL PORTILLO|PUCALLPA': ['Ucayali', 'Coronel Portillo', 'Calleria'],
  'ICA|CHINCHA|CHINCHA': ['Ica', 'Chincha', 'Chincha Alta'],
  'PIURA|PIURA|26 DE OCTUBRE': ['Piura', 'Piura', 'Veintiseis de Octubre'],
  'TACNA|TACNA|COR GREGORIO ALBARRACIN': ['Tacna', 'Tacna', 'Coronel Gregorio Albarracín Lanchipa'],
  'HUANUCO|HUANUCO|PILLCOMARCA': ['Huánuco', 'Huánuco', 'Pillco Marca'],

  'CUSCO|CUSCO|SAN SEBASTIAN - CORAO': ['Cusco', 'Cusco', 'San Sebastian'],
  'CUSCO|QUISPICANCHIS|ANDAHUAYLILLAS-HUACARPAY-PINIPAMPA': ['Cusco', 'Quispicanchi', 'Andahuaylillas'],
  'CUSCO|QUISPICANCHIS|HUARO': ['Cusco', 'Quispicanchi', 'Huaro'],
  'CUSCO|QUISPICANCHIS|LUCRE': ['Cusco', 'Quispicanchi', 'Lucre'],
  'CUSCO|QUISPICANCHIS|OROPESA - TIPON': ['Cusco', 'Quispicanchi', 'Oropesa'],
  'CUSCO|QUISPICANCHIS|URCOS': ['Cusco', 'Quispicanchi', 'Urcos'],
  'CUSCO|URUBAMBA|MARAS - MORAY': ['Cusco', 'Urubamba', 'Maras'],

  // Dos filas del courier caen en el mismo distrito oficial; la segunda se
  // descarta sola porque `push` ya ignora claves repetidas.
  'LAMBAYEQUE|LAMBAYEQUE|CALETA SAN JOSE': ['Lambayeque', 'Lambayeque', 'San José'],
  'LAMBAYEQUE|LAMBAYEQUE|SAN JOSE - CIUDAD DE DIOS': ['Lambayeque', 'Lambayeque', 'San José'],
}

/** Nombre del courier → nombre oficial, si hay equivalencia registrada. */
const canonical = (department, province, district) =>
  DISTRICT_ALIAS[`${norm(department)}|${norm(province)}|${norm(district)}`]
  ?? [department, province, district]

// Índice inverso: nombre oficial → clave del tarifario. Hace falta porque el
// recorrido principal viene del padrón (nombres oficiales) y la cobertura está
// guardada bajo los nombres del courier. Sin esto, los 21 distritos con alias
// —el Callao entero, Cercado de Lima, Pucallpa…— salían SIN cobertura pese a
// que el courier sí llega: el comprador iría a agencia teniendo entrega a casa.
const COURIER_KEY = {}
for (const [courierKey, [d, p, dist]] of Object.entries(DISTRICT_ALIAS)) {
  COURIER_KEY[`${norm(d)}|${norm(p)}|${norm(dist)}`] ??= courierKey
}

const index = []
const seen = new Set()
const push = (rawDept, rawProv, rawDist) => {
  const [department, province, district] = canonical(rawDept, rawProv, rawDist)
  const key = `${norm(department)}|${norm(province)}|${norm(district)}`
  if (seen.has(key)) return
  seen.add(key)
  // La cobertura se busca por el nombre OFICIAL y, si no está, por el que usa
  // el courier: el tarifario está indexado con sus propios nombres.
  const c = districts[key]
    ?? districts[COURIER_KEY[key] ?? '']
    ?? districts[`${norm(rawDept)}|${norm(rawProv)}|${norm(rawDist)}`]
  index.push({
    department, province, district,
    covered: Boolean(c),
    city: c?.city ?? null,
    weekly: c?.weekly ?? false,
    eta: c?.eta ?? null,
  })
}

for (const [department, provinces] of Object.entries(GEO)) {
  for (const [province, list] of Object.entries(provinces)) {
    for (const district of list) push(department, province, district)
  }
}
// Los que el courier cubre pero peru-geo.ts no lista.
for (const d of Object.values(districts)) push(d.department, d.province, d.district)

index.sort((a, b) =>
  a.department.localeCompare(b.department, 'es') ||
  a.province.localeCompare(b.province, 'es') ||
  a.district.localeCompare(b.district, 'es'))

writeFileSync(OUT_INDEX, JSON.stringify({
  _generated: 'node scripts/build-districts.mjs — NO editar a mano',
  _note: 'Unión de src/data/peru-geo.ts y la cobertura del courier. Alimenta el selector de distrito.',
  districts: index,
}))

writeFileSync(OUT, JSON.stringify({
  _generated: 'node scripts/build-districts.mjs — NO editar a mano',
  _source: SRC,
  cities,
  districts,
}))

const total = Object.keys(districts).length
const zoned = Object.values(districts).filter(d => d.zoned).length
const weekly = Object.values(districts).filter(d => d.weekly).length
console.log(`✓ ${OUT}`)
console.log(`  ${total} distritos · ${Object.keys(cities).length} ciudades · ${skipped} filas descartadas`)
console.log(`  ${zoned} con tarifa en rango (zonas de distinto costo) · ${weekly} de visita semanal`)
console.log(`  ${(Buffer.byteLength(JSON.stringify({ cities, districts })) / 1024).toFixed(1)} KB sin comprimir`)
console.log(`✓ ${OUT_INDEX}`)
console.log(`  ${index.length} distritos seleccionables (${index.filter(d => d.covered).length} con cobertura a domicilio)`)
