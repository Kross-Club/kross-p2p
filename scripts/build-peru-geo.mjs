// Genera `src/data/peru-geo.ts` desde el padrón UBIGEO del INEI.
//
// Uso: node scripts/build-peru-geo.mjs
//
// Antes ese archivo se escribía A MANO y tenía 483 de los 1 874 distritos del
// país. No fallaba parejo: Áncash tenía 14 de 166, Cajamarca 11 de 127, y el
// Callao entero no existía. Para el comprador eso no se lee como "falta un
// dato" — su distrito no aparece, así que no puede terminar la compra, y no
// queda rastro en ninguna métrica porque el pedido nunca llega a crearse.
//
// Fuente: github.com/ernestorivero/Ubigeo-Peru (padrón INEI 2016), copiada a
// scripts/sources/ para que el build no dependa de que ese repo siga en pie.
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'scripts/sources'
const OUT = 'src/data/peru-geo.ts'

const read = n => JSON.parse(readFileSync(`${SRC}/ubigeo-${n}.json`, 'utf8'))
const departamentos = read('departamentos')
const provincias = read('provincias')
const distritos = read('distritos')

// El padrón trae nombres con espacios al final ('Lima ', 'Barranca '). Sin
// limpiarlos el selector los muestra así y cualquier comparación exacta falla.
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const depName = new Map(departamentos.map(d => [d.id, clean(d.name)]))
const provName = new Map(provincias.map(p => [p.id, clean(p.name)]))

// department → province → [districts]
const geo = {}
let huerfanos = 0
for (const d of distritos) {
  const dep = depName.get(d.department_id)
  const prov = provName.get(d.province_id)
  if (!dep || !prov) { huerfanos++; continue }
  ;((geo[dep] ??= {})[prov] ??= []).push(clean(d.name))
}

// Orden alfabético en los tres niveles: el selector busca por texto, pero la
// lista sin filtrar se lee de arriba abajo y el orden del padrón es por código.
const collator = new Intl.Collator('es')
const ordered = {}
for (const dep of Object.keys(geo).sort(collator.compare)) {
  ordered[dep] = {}
  for (const prov of Object.keys(geo[dep]).sort(collator.compare)) {
    ordered[dep][prov] = geo[dep][prov].sort(collator.compare)
  }
}

const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const body = Object.entries(ordered).map(([dep, provs]) => {
  const inner = Object.entries(provs).map(([prov, list]) => {
    const items = list.map(q).join(', ')
    return `    ${/^[A-Za-zÁÉÍÓÚÑáéíóúñ_$][\w$]*$/.test(prov) ? prov : q(prov)}: [${items}],`
  }).join('\n')
  return `  ${/^[A-Za-zÁÉÍÓÚÑáéíóúñ_$][\w$]*$/.test(dep) ? dep : q(dep)}: {\n${inner}\n  },`
}).join('\n')

const total = distritos.length - huerfanos
writeFileSync(OUT, `// Departamentos, provincias y distritos del Perú — padrón UBIGEO del INEI.
//
// GENERADO por scripts/build-peru-geo.mjs — NO editar a mano.
// Fuente: scripts/sources/ubigeo-*.json (INEI 2016, vía ernestorivero/Ubigeo-Peru).
//
// ${Object.keys(ordered).length} departamentos · ${Object.values(ordered).reduce((n, p) => n + Object.keys(p).length, 0)} provincias · ${total} distritos.
//
// Antes esta lista se escribía a mano y tenía 483 distritos: el comprador cuyo
// distrito faltaba no podía comprar, y no quedaba rastro de esa venta perdida.
export const GEO_PERU: Record<string, Record<string, string[]>> = {
${body}
}
`)

console.log(`✓ ${OUT}`)
console.log(`  ${Object.keys(ordered).length} departamentos · ${total} distritos${huerfanos ? ` · ${huerfanos} huérfanos descartados` : ''}`)
