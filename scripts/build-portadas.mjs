// ─── Generador: portadas del catálogo público ────────────────────────────────
// Salida: public/catalogo/*.svg — las seis portadas de `src/config/catalogo.ts`.
//
// Están generadas y no dibujadas a mano por una razón: son la aplicación del
// manual de marca v2.0 a una superficie de venta, y las reglas que las gobiernan
// (§4 paleta, §4.2 reserva del lima, §6 sistema modular) tienen que poder
// cambiarse en un solo sitio. Si mañana cambia el lima, se edita la constante y
// se vuelven a emitir las seis.
//
// Reglas que este archivo hace cumplir:
//   · Fondo ink, módulos en hueso, sin degradados y sin texto (no dependen de
//     ninguna fuente: la tarjeta ya trae el nombre debajo).
//   · UNA aparición de lima por portada. La única excepción es la ruta de
//     Smart Logistics, que usa el par recorrido/pendiente que autoriza el §6.2.
//   · Nada de esquinas redondeadas en los módulos del símbolo (§3.7).
//
// Uso: node scripts/build-portadas.mjs

import { writeFileSync } from 'node:fs'

const INK = '#0F1115', S1 = '#171A1F', S2 = '#23262B'
const BONE = '#F2F2F0', T2 = '#C7CDD4', T3 = '#9BA1A9', STRUCT = '#3D444C'
const LIME = '#D4FF4F', ON_LIME = '#2C3A00', LIME_DIM = '#5C6B33'
const BORDE = 'rgba(255,255,255,0.09)'
const OUT = 'public/catalogo'

/** Un módulo del sistema. `rx` solo para lo que imita interfaz, nunca el símbolo. */
const r = (x, y, w, h, fill, rx = 0, extra = '') =>
  `  <rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"${extra}/>\n`

const rango = (desde, hasta, paso) => {
  const out = []
  for (let v = desde; v < hasta; v += paso) out.push(v)
  return out
}

function marco(titulo, cuerpo, grilla = true) {
  const g = grilla
    ? '  <g stroke="rgba(255,255,255,0.05)" stroke-width="1">\n'
      + rango(50, 800, 50).map(x => `    <path d="M${x} 0V600"/>\n`).join('')
      + rango(50, 600, 50).map(y => `    <path d="M0 ${y}H800"/>\n`).join('')
      + '  </g>\n'
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" `
    + `viewBox="0 0 800 600" role="img" aria-label="${titulo}">\n`
    + `  <rect width="800" height="600" fill="${INK}"/>\n${g}${cuerpo}</svg>\n`
}

const portadas = {}

// ── Plan Inicia — la app de la marca, con el adelanto ya cobrado ────────────
{
  let c = r(290, 80, 220, 440, S1, 18, ` stroke="${BORDE}"`)
  c += r(350, 96, 100, 10, S2, 5)
  c += r(310, 126, 180, 40, S2, 8)
  c += `  <circle cx="332" cy="146" r="10" fill="${BONE}"/>\n`
  c += r(348, 141, 70, 10, T3, 5)
  c += r(310, 180, 180, 150, S2, 8)
  c += r(322, 192, 156, 84, STRUCT, 4)
  c += r(322, 288, 110, 10, T2, 5) + r(322, 306, 70, 10, T3, 5)
  c += r(310, 344, 180, 40, BONE, 8)          // botón comprar
  c += r(310, 400, 132, 30, LIME, 15)         // adelanto cobrado ← el único lima
  c += r(324, 411, 104, 8, ON_LIME, 4)
  c += r(310, 446, 180, 12, S2, 6) + r(310, 470, 120, 12, S2, 6)
  c += r(120, 250, 90, 90, S1, 16, ` stroke="${BORDE}"`)
  c += r(140, 270, 22, 50, BONE) + r(172, 270, 18, 18, BONE) + r(172, 302, 18, 18, BONE)
  c += r(590, 250, 90, 90, S1, 16, ` stroke="${BORDE}"`)
  c += r(610, 270, 50, 12, S2, 6) + r(610, 292, 34, 12, S2, 6) + r(610, 314, 44, 12, S2, 6)
  portadas['plan-inicia'] = marco('Plan Inicia — tu app instalable cobrando el adelanto', c)
}

// ── Plan Vende — el checkout de tres pasos, cobrando en el tercero ──────────
{
  let c = r(180, 100, 440, 400, S1, 14, ` stroke="${BORDE}"`)
  c += r(210, 132, 120, 8, BONE, 4) + r(346, 132, 120, 8, BONE, 4) + r(482, 132, 108, 8, LIME, 4)
  c += r(210, 172, 380, 52, S2, 8) + r(226, 192, 130, 12, T3, 6)
  c += r(210, 240, 380, 52, S2, 8) + r(226, 260, 190, 12, T3, 6)
  c += r(210, 308, 182, 52, S2, 8) + r(226, 328, 90, 12, T3, 6)
  c += r(408, 308, 182, 52, S2, 8) + r(424, 328, 110, 12, T3, 6)
  c += r(210, 376, 380, 64, S2, 8) + r(226, 396, 120, 12, T3, 6) + r(226, 416, 76, 10, T2, 5)
  c += r(470, 394, 104, 28, BONE, 6)
  c += r(210, 456, 380, 24, BONE, 8)
  portadas['plan-vende'] = marco('Plan Vende — checkout de tres pasos con cobro del adelanto', c)
}

// ── Plan Escala — el tablero del equipo ─────────────────────────────────────
{
  let c = r(110, 100, 580, 400, S1, 14, ` stroke="${BORDE}"`)
  c += r(110, 100, 92, 400, INK, 14) + r(190, 100, 12, 400, INK)
  rango(140, 340, 52).forEach((y, i) => {
    c += r(130, y, 52, 28, S2, 6)
    if (i === 1) c += r(116, y + 7, 6, 14, LIME)   // §6: indicador de nav activa
  })
  rango(140, 460, 62).forEach((y) => {
    c += r(222, y, 448, 50, S2, 8)
    c += `  <circle cx="250" cy="${y + 25}" r="14" fill="${STRUCT}"/>\n`
    c += r(276, y + 14, 128, 10, T2, 5) + r(276, y + 30, 84, 8, T3, 4)
    c += r(560, y + 14, 92, 22, STRUCT, 11)
  })
  portadas['plan-escala'] = marco('Plan Escala — tablero con varios agentes y estados de pedido', c)
}

// ── Smart Logistics — la ruta (§6.2: recorrido lima, pendiente apagado) ─────
{
  let c = '  <g stroke="#1B2027" stroke-width="10">\n'
    + [130, 330, 530, 690].map(x => `    <path d="M${x} 0V600"/>\n`).join('')
    + [150, 300, 450].map(y => `    <path d="M0 ${y}H800"/>\n`).join('')
    + '  </g>\n'
  c += '  <g stroke="#232A32" stroke-width="16">\n    <path d="M0 380H800"/>\n    <path d="M430 0V600"/>\n  </g>\n'
  c += `  <path d="M150 470 L150 380 L330 380 L330 150" fill="none" stroke="${LIME}" stroke-width="4"/>\n`
  c += `  <path d="M330 150 L530 150 L530 300 L680 300" fill="none" stroke="${LIME_DIM}" stroke-width="4" stroke-dasharray="10 12"/>\n`
  c += `  <circle cx="150" cy="470" r="20" fill="${LIME}" opacity="0.16"/>\n`
  c += `  <circle cx="150" cy="470" r="6.5" fill="${LIME}"/>\n`
  for (const [x, y] of [[330, 150], [530, 300]]) c += `  <circle cx="${x}" cy="${y}" r="3.5" fill="${STRUCT}"/>\n`
  c += r(640, 250, 100, 100, S1, 10, ` stroke="${BORDE}"`)
  c += r(660, 274, 60, 10, T2, 5) + r(660, 292, 40, 10, T3, 5) + r(660, 312, 52, 10, STRUCT, 5)
  portadas['modulo-logistica'] = marco('Smart Logistics — ruta recorrida y tramo pendiente', c, false)
}

// ── Loyalty — la entrega que vuelve a comprar ───────────────────────────────
{
  let c = ''
  ;[110, 330, 550].forEach((x, i) => {
    c += r(x, 210, 140, 180, S1, 12, ` stroke="${BORDE}"`)
    c += r(x + 24, 240, 92, 56, S2, 6)
    c += r(x + 24, 312, 70, 10, T3, 5) + r(x + 24, 332, 46, 10, STRUCT, 5)
    c += r(x + 24, 356, 92, 14, i === 2 ? LIME : S2, 7)
  })
  c += `  <path d="M250 300 H330" fill="none" stroke="${STRUCT}" stroke-width="3"/>\n`
  c += `  <path d="M470 300 H550" fill="none" stroke="${STRUCT}" stroke-width="3"/>\n`
  c += `  <path d="M320 292 l12 8 -12 8Z" fill="${STRUCT}"/>\n`
  c += `  <path d="M540 292 l12 8 -12 8Z" fill="${STRUCT}"/>\n`
  c += `  <path d="M620 190 V140 H180 V190" fill="none" stroke="${STRUCT}" stroke-width="3" stroke-dasharray="8 10"/>\n`
  c += `  <path d="M172 182 l8 12 8 -12Z" fill="${STRUCT}"/>\n`
  portadas['modulo-loyalty'] = marco('Módulo Loyalty — la entrega que vuelve a comprar', c)
}

// ── Implementación — la K armándose sobre la grilla de módulos (§3.1) ───────
{
  const M = 56, X0 = 260, Y0 = 160
  let c = ''
  for (let col = 0; col < 5; col++)
    for (let fila = 0; fila < 5; fila++)
      c += r(X0 + col * M, Y0 + fila * M, M, M, S1, 0, ` stroke="${BORDE}"`)
  const k = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [2, 1], [3, 0], [2, 3], [3, 4]]
  for (const [col, fila] of k) c += r(X0 + col * M, Y0 + fila * M, M, M, BONE)
  c += r(X0 + M, Y0 + 2 * M, M, M, LIME)                    // la junta
  c += r(120, 120, M, M, BONE, 0, ' opacity="0.18"')        // módulos por colocar
  c += r(120, 400, M, M, BONE, 0, ' opacity="0.10"')
  c += r(620, 470, M, M, BONE, 0, ' opacity="0.14"')
  portadas['implementacion'] = marco('Implementación — tu marca armada módulo a módulo', c)
}

for (const [slug, svg] of Object.entries(portadas)) {
  writeFileSync(`${OUT}/${slug}.svg`, svg)
  console.log(`✓ ${OUT}/${slug}.svg (${svg.length} B)`)
}
