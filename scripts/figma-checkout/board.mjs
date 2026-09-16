// Arma el tablero del flujo (SVG importable en Figma): cada vista como imagen
// embebida, agrupada por paso, con flechas y la condición de cada rama.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const PAQUETE = path.resolve(DIR, '../../docs/figma/checkout-flow')
const OUT = process.env.OUT || path.join(PAQUETE, 'vistas')
const DEST = process.env.DEST || path.join(PAQUETE, 'flujo-checkout.svg')
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'))
const byId = Object.fromEntries(manifest.map(m => [m.id, m]))

import { COLUMNAS, FLECHAS } from './spec.mjs'

// ─── Geometría ───────────────────────────────────────────────────────────────
const W = 390, GUTTER = 420, GAP = 70, MARGIN = 80
const FONT = 'Inter, Nunito, Helvetica, Arial, sans-serif'
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function wrap(text, max) {
  const out = []; let line = ''
  for (const w of String(text).split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w } else line = (line + ' ' + w).trim()
  }
  if (line) out.push(line)
  return out
}

const nodos = {}
const busForward = [], busBack = []
for (const f of FLECHAS) {
  const [a, b] = f
  if (!byId[a] || !byId[b]) throw new Error(`Falta la vista de la flecha ${a} → ${b}`)
}
const colOf = {}
COLUMNAS.forEach((c, i) => c.ids.forEach(id => { colOf[id] = i; if (!byId[id]) throw new Error('Falta ' + id) }))

// Cuántas flechas van por el «bus» de arriba (columnas no adyacentes, o hacia atrás).
FLECHAS.forEach(([a, b, , tipo]) => {
  const ca = colOf[a], cb = colOf[b]
  if (cb === ca + 1 || cb === ca) return
  if (cb > ca + 1) busForward.push([a, b]); else busBack.push([a, b])
})
const BUS_LANES = busForward.length + busBack.length
const HEADER_H = 150
const BUS_H = BUS_LANES * 22 + 40
const TOP = HEADER_H + BUS_H + 60

let maxBottom = 0
COLUMNAS.forEach((c, ci) => {
  const x = MARGIN + ci * (W + GUTTER)
  let y = TOP
  c.ids.forEach(id => {
    const m = byId[id]
    const lineas = wrap(m.condicion, 62)
    const capH = 30 + lineas.length * 15 + 16
    nodos[id] = { ...m, col: ci, x, y, capH, imageTop: y + capH, lineas, entradas: 0, salidas: 0 }
    y += capH + m.h + GAP
  })
  maxBottom = Math.max(maxBottom, y)
})
const TOTAL_W = MARGIN * 2 + COLUMNAS.length * W + (COLUMNAS.length - 1) * GUTTER
const TOTAL_H = maxBottom + MARGIN

// ─── Dibujo ──────────────────────────────────────────────────────────────────
const parts = []
parts.push(`<rect width="${TOTAL_W}" height="${TOTAL_H}" fill="#F3F4F6"/>`)
parts.push(`<g id="Título">
  <text x="${MARGIN}" y="70" font-family="${FONT}" font-size="34" font-weight="700" fill="#111827">Kross · Checkout del comprador · Flujo de pasos y condicionales</text>
  <text x="${MARGIN}" y="100" font-family="${FONT}" font-size="15" fill="#4B5563">Capturas de la app real (390 × 844 @2x, celular) · ${manifest.length} vistas · generado el ${new Date().toISOString().slice(0, 10)} · cada vista lleva la condición que la produce; las flechas dicen con qué se llega a cada pantalla.</text>
  <g id="Leyenda">
    <line x1="${MARGIN}" y1="124" x2="${MARGIN + 60}" y2="124" stroke="#111827" stroke-width="2"/><text x="${MARGIN + 70}" y="128" font-family="${FONT}" font-size="12" fill="#374151">avanza</text>
    <line x1="${MARGIN + 160}" y1="124" x2="${MARGIN + 220}" y2="124" stroke="#6B7280" stroke-width="2" stroke-dasharray="8 5"/><text x="${MARGIN + 230}" y="128" font-family="${FONT}" font-size="12" fill="#374151">vuelve / atrás</text>
    <line x1="${MARGIN + 360}" y1="124" x2="${MARGIN + 420}" y2="124" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="2 4"/><text x="${MARGIN + 430}" y="128" font-family="${FONT}" font-size="12" fill="#374151">variante de la misma pantalla</text>
  </g>
</g>`)

// Columnas
COLUMNAS.forEach((c, ci) => {
  const x = MARGIN + ci * (W + GUTTER)
  parts.push(`<g id="Columna · ${esc(c.nombre)}">
    <rect x="${x - 24}" y="${TOP - 50}" width="${W + 48}" height="${maxBottom - TOP + 50}" rx="28" fill="#E5E7EB" fill-opacity="0.55"/>
    <text x="${x}" y="${TOP - 18}" font-family="${FONT}" font-size="20" font-weight="700" fill="#111827">${esc(c.nombre)}</text>
  </g>`)
})

// Flechas (debajo de las vistas para que no las tapen, pero encima del fondo)
const flechasSvg = []
const etiquetasSvg = []
let laneF = 0, laneB = 0
const laneSame = {}
function entradaY(n) { const y = n.imageTop + 34 + n.entradas * 62; n.entradas += 1; return Math.min(y, n.imageTop + n.h - 30) }
function salidaY(n) { const y = n.imageTop + 60 + n.salidas * 50; n.salidas += 1; return Math.min(y, n.imageTop + n.h - 30) }
const STYLE = {
  avanza: 'stroke="#111827" stroke-width="2"',
  vuelve: 'stroke="#6B7280" stroke-width="2" stroke-dasharray="9 6"',
  variante: 'stroke="#9CA3AF" stroke-width="2" stroke-dasharray="2 5"',
}
const COLOR = { avanza: '#111827', vuelve: '#6B7280', variante: '#9CA3AF' }

FLECHAS.forEach(([a, b, texto, tipo = 'avanza']) => {
  const A = nodos[a], B = nodos[b]
  const ey = entradaY(B)
  const xin = B.x
  let d
  if (B.col === A.col + 1) {
    const sy = salidaY(A)
    const mid = B.x - GUTTER + 40 + (A.salidas + B.entradas) * 14
    d = `M ${A.x + W} ${sy} H ${mid} V ${ey} H ${xin}`
  } else if (B.col === A.col) {
    const sy = salidaY(A)
    laneSame[A.col] = (laneSame[A.col] ?? 0) + 1
    const lx = A.x - 24 - laneSame[A.col] * 14
    d = `M ${A.x} ${sy} H ${lx} V ${ey} H ${xin}`
  } else if (B.col > A.col + 1) {
    const sy = salidaY(A)
    const lane = laneF++
    const by = HEADER_H + 20 + lane * 22
    const x1 = A.x + W + 30 + lane * 14
    const x2 = B.x - GUTTER + 30 + lane * 14
    d = `M ${A.x + W} ${sy} H ${x1} V ${by} H ${x2} V ${ey} H ${xin}`
  } else {
    // hacia atrás: sale por la izquierda, sube al bus y baja a la columna destino
    const sy = salidaY(A)
    const lane = laneB++
    const by = HEADER_H + 20 + (busForward.length + lane) * 22
    const x1 = A.x - 30 - lane * 14
    const x2 = B.x - GUTTER + 200 + lane * 14
    d = `M ${A.x} ${sy} H ${x1} V ${by} H ${x2} V ${ey} H ${xin}`
  }
  flechasSvg.push(`<g id="→ ${esc(b)}"><path d="${d}" fill="none" ${STYLE[tipo]} stroke-linejoin="round"/>
    <polygon points="${xin - 12},${ey - 6} ${xin},${ey} ${xin - 12},${ey + 6}" fill="${COLOR[tipo]}"/></g>`)
  const lineas = wrap(texto, 40)
  const bw = 236, bh = lineas.length * 14 + 14
  const bx = xin - 14 - bw, byy = ey - bh / 2
  etiquetasSvg.push(`<g id="Condición · ${esc(b)}">
    <rect x="${bx}" y="${byy}" width="${bw}" height="${bh}" rx="8" fill="#FFFFFF" stroke="${COLOR[tipo]}" stroke-width="1.5"/>
    <text x="${bx + 10}" y="${byy + 17}" font-family="${FONT}" font-size="11" font-weight="500" fill="#111827">${lineas.map((l, i) => `<tspan x="${bx + 10}" dy="${i === 0 ? 0 : 14}">${esc(l)}</tspan>`).join('')}</text>
  </g>`)
})
parts.push(`<g id="Flechas">${flechasSvg.join('\n')}</g>`)

// Vistas
const vistas = []
for (const id of Object.keys(nodos)) {
  const n = nodos[id]
  const png = fs.readFileSync(path.join(OUT, n.file)).toString('base64')
  vistas.push(`<g id="${esc(id)}">
    <rect x="${n.x - 12}" y="${n.y - 12}" width="${W + 24}" height="${n.capH + n.h + 24}" rx="20" fill="#FFFFFF" stroke="#D1D5DB"/>
    <text x="${n.x}" y="${n.y + 18}" font-family="${FONT}" font-size="15" font-weight="700" fill="#111827">${esc(n.titulo)}</text>
    <text x="${n.x}" y="${n.y + 40}" font-family="${FONT}" font-size="11" fill="#4B5563">${n.lineas.map((l, i) => `<tspan x="${n.x}" dy="${i === 0 ? 0 : 15}">${esc(l)}</tspan>`).join('')}</text>
    <g id="${esc(id)} · pantalla">
      <rect x="${n.x}" y="${n.imageTop}" width="${W}" height="${n.h}" rx="18" fill="#FFFFFF"/>
      <image x="${n.x}" y="${n.imageTop}" width="${W}" height="${n.h}" xlink:href="data:image/png;base64,${png}"/>
      <rect x="${n.x + 0.5}" y="${n.imageTop + 0.5}" width="${W - 1}" height="${n.h - 1}" rx="18" fill="none" stroke="#111827" stroke-opacity="0.15"/>
    </g>
  </g>`)
}
parts.push(`<g id="Vistas">${vistas.join('\n')}</g>`)
parts.push(`<g id="Condiciones">${etiquetasSvg.join('\n')}</g>`)

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${TOTAL_W}" height="${TOTAL_H}" viewBox="0 0 ${TOTAL_W} ${TOTAL_H}">
${parts.join('\n')}
</svg>`
fs.writeFileSync(DEST, svg)
console.log('tablero:', DEST, `${TOTAL_W}×${TOTAL_H}`, (svg.length / 1024 / 1024).toFixed(1) + ' MB', 'bus lanes', BUS_LANES)
