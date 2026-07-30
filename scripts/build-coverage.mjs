// ─── Generador: KML de cobertura Aliclic → GeoJSON por ciudad ────────────────
// Fuente: scripts/sources/aliclic-cobertura.kml (export "Todo el mapa" de Google
// My Maps, casilla "Exportar como KML" marcada y NetworkLink DESmarcado).
// Salida:  src/data/coverage/aliclic-zones.json
//
// Los polígonos NO son binarios: cada zona lleva un RECARGO (`ADICIONAL N` = +S/N
// sobre la tarifa base del courier). Ese recargo es costo de la marca, no del
// comprador — se guarda en el pedido para medir margen por zona. Ver docs/02.
//
// Uso: node scripts/build-coverage.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'scripts/sources/aliclic-cobertura.kml'
const OUT = 'src/data/coverage/aliclic-zones.json'
const PRECISION = 5 // ~1.1 m — suficiente para punto-en-polígono, ahorra bytes

// Quita tildes y normaliza espacios para comparar nombres de capa.
const deaccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => deaccent(s).replace(/\s+/g, ' ').trim().toUpperCase()

// El nombre de la capa mezcla ciudad + variante ("TRUJILLO ADICIONAL 5"). Nos
// quedamos con la ciudad y corregimos los typos observados en el mapa original.
function cityOf(layerName) {
  let n = norm(layerName)
  n = n.replace(/\bADICIONAL\s*[\d-]*/g, '')
  n = n.replace(/\b(PRUEBA|EXTENSION|EXPANSION)\b/g, '')
  n = n.replace(/\bTUMBRES\b/g, 'TUMBES').replace(/\bTALATA\b/g, 'TALARA')
  return n.replace(/\s+/g, ' ').trim()
}

// Recargo en soles: viene en el nombre ("ADICIONAL 5") o en la descripción
// ("adicional 3 soles"). Tres resultados posibles:
//   0    → tarifa base, la capa no menciona recargo
//   n    → recargo explícito de S/n
//   null → la capa dice "ADICIONAL" pero sin monto (p. ej. Cusco, o Lima con
//          "ENTRE 3 Y 5"). Hay recargo pero se desconoce cuánto: NO es 0, y
//          tratarlo como 0 subestimaría el costo real del envío.
function surchargeOf(name, desc) {
  const both = `${norm(name)} ${norm(desc)}`
  const m = both.match(/ADICIONAL\s*(\d+)/)
  if (m) return Number(m[1])
  // "zona SIN adicionales" (Tacna) es tarifa base, no recargo desconocido.
  if (/SIN\s+ADICIONAL/.test(both)) return 0
  return /ADICIONAL/.test(both) ? null : 0
}

// Zonas que el courier solo visita una vez por semana. Prometer entrega a puerta
// ahí genera el reclamo — la UI las degrada a BORDERLINE (ofrece agencia).
const isWeekly = desc => /1\s*VEZ\s*(A|POR)\s*(LA\s*)?SEMANA/.test(norm(desc))

const xml = readFileSync(SRC, 'utf8')

// El KML de My Maps es generado por máquina y su estructura es estable, así que
// un parseo por bloques es suficiente (y evita una dependencia de XML).
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? m[1].trim() : ''
}
const unescape = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/<br\s*\/?>/gi, ' ').trim()

const round = n => Number(n.toFixed(PRECISION))

const cities = {}
let pilotZones = 0, totalRings = 0, totalPoints = 0, totalHoles = 0

// Cada <Folder> es una capa del mapa: PROVINCIAS, LIMA, y una capa vacía sin título.
for (const folderBlock of xml.split('<Folder>').slice(1)) {
  const folderName = norm(tag(folderBlock, 'name'))
  if (folderName !== 'PROVINCIAS' && folderName !== 'LIMA') continue

  for (const pmBlock of folderBlock.split('<Placemark>').slice(1)) {
    const rawName = unescape(tag(pmBlock, 'name'))
    const desc = unescape(tag(pmBlock, 'description'))

    // OJO: las capas con "PRUEBA" en el nombre NO son basura. Se verificó que en
    // Ilo, Moquegua, Talara, Puerto Maldonado y Chincha son la ÚNICA zona base de
    // esa ciudad y caen sobre su centro (0.4–2 km). Son ciudades piloto del
    // courier. Descartarlas dejaba sin cobertura el centro de esas 5 ciudades.
    const pilot = /\bPRUEBA\b/.test(norm(rawName))
    if (pilot) pilotZones++

    // Un <Polygon> tiene un anillo exterior y N interiores (agujeros). El mapa
    // trae 9 agujeros: son zonas EXCLUIDAS dentro de un área cubierta. Aplanarlos
    // junto al exterior haría que un hueco cuente como cubierto.
    const polygons = []
    for (const polyMatch of pmBlock.matchAll(/<Polygon>([\s\S]*?)<\/Polygon>/g)) {
      const poly = polyMatch[1]
      const ringsOf = boundary => [...poly.matchAll(
        new RegExp(`<${boundary}>([\\s\\S]*?)</${boundary}>`, 'g'),
      )].flatMap(b => [...b[1].matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(c =>
        c[1].trim().split(/\s+/).filter(Boolean).map(triple => {
          const [lng, lat] = triple.split(',')
          return [round(Number(lng)), round(Number(lat))]
        }),
      )).filter(r => r.length >= 4) // un anillo válido es al menos un triángulo cerrado

      const [outer] = ringsOf('outerBoundaryIs')
      if (!outer) continue
      polygons.push({ outer, holes: ringsOf('innerBoundaryIs') })
    }
    if (polygons.length === 0) continue

    const key = folderName === 'LIMA' ? 'LIMA' : cityOf(rawName)
    if (!key) continue

    cities[key] ??= { name: key, zones: [] }
    cities[key].zones.push({
      label: rawName,
      surcharge: surchargeOf(rawName, desc),
      weekly: isWeekly(desc),
      pilot,
      note: desc || null,
      polygons,
    })
    totalRings += polygons.reduce((n, p) => n + 1 + p.holes.length, 0)
    totalHoles += polygons.reduce((n, p) => n + p.holes.length, 0)
    totalPoints += polygons.reduce((n, p) => n + p.outer.length + p.holes.reduce((h, r) => h + r.length, 0), 0)
  }
}

// Centroide de la ciudad = centro de su bounding box. Ancla el pin cuando no hay
// GPS ni IP: el usuario nunca ve el mapa en blanco.
for (const c of Object.values(cities)) {
  const pts = c.zones.flatMap(z => z.polygons.flatMap(p => p.outer))
  const lngs = pts.map(p => p[0]), lats = pts.map(p => p[1])
  c.center = [round((Math.min(...lngs) + Math.max(...lngs)) / 2), round((Math.min(...lats) + Math.max(...lats)) / 2)]
  c.bbox = [round(Math.min(...lngs)), round(Math.min(...lats)), round(Math.max(...lngs)), round(Math.max(...lats))]
}

const out = {
  _generated: 'node scripts/build-coverage.mjs — NO editar a mano',
  _source: SRC,
  cities,
}
writeFileSync(OUT, JSON.stringify(out))

const n = Object.keys(cities).length
console.log(`✓ ${OUT}`)
console.log(`  ${n} ciudades · ${totalRings} anillos (${totalHoles} agujeros) · ${totalPoints} vértices · ${pilotZones} zonas piloto`)
console.log(`  ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1)} KB sin comprimir`)
