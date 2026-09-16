// Renderiza el SVG del tablero a PNG (escala reducida) para revisarlo.
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
import { execSync } from 'node:child_process'
function cargarPlaywright() {
  try { return require('playwright') } catch { /* no está en el repo */ }
  return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'))
}
const { chromium } = cargarPlaywright()
import os from 'node:os'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const svg = process.argv[2] || path.resolve(DIR, '../../docs/figma/checkout-flow/flujo-checkout.svg')
const scale = Number(process.argv[3] || 0.18)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.goto('file://' + svg)
const dims = await page.evaluate(() => { const s = document.querySelector('svg'); return { w: +s.getAttribute('width'), h: +s.getAttribute('height') } })
await page.setViewportSize({ width: Math.ceil(dims.w * scale), height: Math.ceil(dims.h * scale) })
// Abierto directo, el documento ES el svg (no hay body): se escala con sus atributos.
await page.evaluate(sc => { const s = document.documentElement; const w = +s.getAttribute('width'), h = +s.getAttribute('height'); s.setAttribute('width', String(w * sc)); s.setAttribute('height', String(h * sc)) }, scale)
await page.waitForTimeout(800)
const dest = process.env.DEST || path.join(os.tmpdir(), 'tablero-preview.png')
await page.screenshot({ path: dest })
console.log('preview en', dest)
console.log('preview', dims, '→', Math.ceil(dims.w * scale), '×', Math.ceil(dims.h * scale))
await browser.close()
