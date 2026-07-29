// ─── Generador: sedes de Olva → JSON de agencias ─────────────────────────────
// Fuente: scripts/sources/olva-stores.json — respuesta cruda del endpoint que
//         usa el buscador de Olva (`admin-ajax.php?action=get_olva_stores`),
//         capturada desde la pestaña Network del navegador.
// Salida: src/data/agencies/olva.json
//
// ⚠️ Esta data NO viene de un acuerdo con Olva sino de su propio buscador, así
// que puede cambiar de forma sin aviso. Si un día este script falla, lo más
// probable es que hayan rediseñado el sitio: revisar la estructura antes de
// parchear. Lo sólido a mediano plazo es pedirles el listado oficial.
//
// Uso: node scripts/build-olva.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'scripts/sources/olva-stores.json'
const OUT = 'src/data/agencies/olva.json'

// Límites de Perú. Sirven para validar y —sobre todo— para detectar los
// registros donde lat y lng vienen intercambiados.
const okLat = v => Number.isFinite(v) && v >= -18.6 && v <= -0.02
const okLng = v => Number.isFinite(v) && v >= -81.5 && v <= -68.5

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()

const raw = JSON.parse(readFileSync(SRC, 'utf8'))
// El endpoint envuelve el listado dos veces: { success, data: { data: [...] } }.
const rows = raw?.data?.data
if (!Array.isArray(rows)) {
  throw new Error(`Estructura inesperada en ${SRC}: se esperaba data.data como arreglo`)
}

const branches = []
let swapped = 0
const noCoords = []

for (const r of rows) {
  const a = parseFloat(r.lat)
  const b = parseFloat(r.lng)

  let lat = null
  let lng = null
  if (okLat(a) && okLng(b)) {
    lat = a; lng = b
  } else if (okLat(b) && okLng(a)) {
    // Vienen invertidas: la "latitud" cae en el rango de longitudes y viceversa.
    // Son 5 sedes (Ayacucho, San Sebastián, Pangoa…) y el intercambio es
    // inequívoco porque los dos rangos de Perú no se solapan.
    lat = b; lng = a
    swapped++
  }

  // Sin coordenadas NO se descarta la sede: sigue apareciendo en el listado
  // buscable para que alguien de ese distrito pueda elegirla. Lo único que no
  // puede es ordenarse por cercanía.
  if (lat === null) noCoords.push(clean(r.nombres))

  branches.push({
    id: String(r.office_id),
    name: clean(r.nombres),
    district: clean(r.district) || null,
    province: clean(r.province),
    department: clean(r.department),
    address: clean(r.direccion),
    lat,
    lng,
  })
}

writeFileSync(OUT, JSON.stringify({
  _generated: 'node scripts/build-olva.mjs — NO editar a mano',
  _source: SRC,
  // El horario por día viene en la fuente (`horario`) y no se emite todavía:
  // sería útil mostrarlo al elegir dónde recoger. Pendiente.
  branches,
}))

const withCoords = branches.filter(b => b.lat !== null).length
console.log(`✓ ${OUT}`)
console.log(`  ${branches.length} sedes · ${withCoords} con coordenadas · ${swapped} con lat/lng invertidas, corregidas`)
if (noCoords.length) {
  console.log(`  ${noCoords.length} sin coordenadas (solo buscables, no ordenables por cercanía):`)
  for (const n of noCoords) console.log(`    - ${n}`)
}
