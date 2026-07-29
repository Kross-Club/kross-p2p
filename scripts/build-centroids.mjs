// ─── Generador: centroides geográficos por distrito/provincia/departamento ───
// Fuentes: src/data/agencies/shalom.json + olva.json (ya generados).
// Salida:  src/data/coverage/district-centroids.json
//
// Para qué sirve: ordenar las agencias por cercanía sin pedirle al comprador su
// ubicación. Se toma el punto medio de las sedes conocidas en ese lugar.
//
// Por qué tres niveles: derivando solo del distrito, un comprador en un distrito
// sin sedes (Poroy, en Cusco) quedaba sin punto de referencia y el listado le
// mostraba sedes de Amazonas. Ahora degrada distrito → provincia → departamento,
// que siempre da algo razonablemente cerca.
//
// IMPORTANTE: corre DESPUÉS de build-agencies y build-olva. Ver `npm run build:data`.

import { readFileSync, writeFileSync } from 'node:fs'

const SOURCES = ['src/data/agencies/shalom.json', 'src/data/agencies/olva.json']
const OUT = 'src/data/coverage/district-centroids.json'

const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = s => deaccent(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

const branches = SOURCES.flatMap(src => {
  const { branches } = JSON.parse(readFileSync(src, 'utf8'))
  return branches
})

/** Promedia los puntos de cada grupo. No es el centro geométrico real del área,
 *  pero ubica mucho mejor que nada y no depende de ninguna fuente externa. */
function centroidsBy(keyOf) {
  const groups = new Map()
  for (const b of branches) {
    if (b.lat === null || b.lng === null) continue
    const key = keyOf(b)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(b)
  }
  const out = {}
  for (const [key, list] of groups) {
    out[key] = {
      lat: Number((list.reduce((s, b) => s + b.lat, 0) / list.length).toFixed(5)),
      lng: Number((list.reduce((s, b) => s + b.lng, 0) / list.length).toFixed(5)),
      // Nº de sedes promediadas: 1 sola es un ancla más floja que 20.
      from: list.length,
    }
  }
  return out
}

const districts = centroidsBy(b => (b.district ? `${norm(b.department)}|${norm(b.district)}` : null))
const provinces = centroidsBy(b => `${norm(b.department)}|${norm(b.province)}`)
const departments = centroidsBy(b => norm(b.department))

writeFileSync(OUT, JSON.stringify({
  _generated: 'node scripts/build-centroids.mjs — NO editar a mano',
  _note: 'Centroides aproximados derivados de las sedes de Shalom y Olva. Solo ordenan agencias por cercanía.',
  districts,
  provinces,
  departments,
}))

console.log(`✓ ${OUT}`)
console.log(`  desde ${branches.length} sedes de ${SOURCES.length} agencias`)
console.log(`  ${Object.keys(districts).length} distritos · ${Object.keys(provinces).length} provincias · ${Object.keys(departments).length} departamentos`)
