// Genera el README del paquete de Figma a partir del manifiesto y del spec.
import fs from 'node:fs'
import path from 'node:path'
import { COLUMNAS, FLECHAS } from './spec.mjs'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const PAQUETE = path.resolve(DIR, '../../docs/figma/checkout-flow')
const OUT = process.env.OUT || path.join(PAQUETE, 'vistas')
const DEST = process.env.DEST || path.join(PAQUETE, 'README.md')
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'))
const byId = Object.fromEntries(manifest.map(m => [m.id, m]))
const md = s => String(s).replace(/\|/g, '\\|')

let out = `# Vistas del checkout para Figma

> Generado el ${new Date().toISOString().slice(0, 10)} con \`scripts/figma-checkout/\` sobre la app real
> (landing → checkout → pago → \`/pedido/:token\`) corriendo contra un backend de mentira.
> **${manifest.length} vistas**, una por cada paso y por cada condicional del flujo del comprador.

## Cómo importarlo en Figma

1. **Todo el flujo de una vez:** arrastra \`flujo-checkout.svg\` al lienzo. Entra como un grupo por
   columna (paso), con cada vista como imagen, su título, la condición que la produce y las flechas
   con la condición de cada transición. Las capas llevan el nombre de la vista (\`03b-lima-B-elegir\`,
   \`Condición · 05d-…\`), así que se puede buscar por nombre en el panel de capas.
2. **Una vista suelta:** arrastra el PNG. Está a **2× (780 × H px)**; ponlo a **390 px de ancho**
   (escala 50 %) para que quede al tamaño del celular en que se capturó (390 × 844, iPhone 12/13/14).
   Las vistas cuyo contenido no entraba en 844 px se capturaron con el modal desplegado entero
   (son más altas), para que se vea el paso completo.
3. Las flechas y las cajas de condición del SVG son vectores editables; las pantallas son imágenes
   (no se pueden editar los textos dentro). El SVG pesa lo que pesan las ${manifest.length} imágenes
   embebidas; si Figma tarda, importa por columna borrando lo que no necesites.

## Qué cubre y qué no

- **Sí:** los 3 pasos del \`CheckoutModal\`, las dos ramas por región (Lima Metro/Callao vs.
  provincia), domicilio vs. agencia, variante A (la cobertura decide) vs. B (elige el comprador),
  marca con y sin reparto, producto con y sin «mitad», con y sin descuento de salida, tienda con
  Flow y sin cobro en línea, las fases del pago (emitiendo, deeplink de Yape, vuelta de la página
  de Flow, fallo), los errores de validación y la página del pedido en sus variantes.
- **No:** la página de pago de Flow (es de un tercero), la caja de 360pay (dormida desde
  set-2026, \`docs/06-360PAY.md\`), el chat del pedido \`/p/:token\` y el panel del vendedor.
- Datos de las capturas: marca «Marca Demo», producto «Sérum de Vitamina C 30 ml» con packs de
  1/2/3 unidades (S/110 · S/189 · S/259), distritos reales (Miraflores, Trujillo, Bagua, Poroy,
  Carhuaz) y las sedes reales de Shalom y Olva.

## Índice de vistas

`
for (const c of COLUMNAS) {
  out += `### ${c.nombre}\n\n| Vista | Pantalla | Condición que la produce |\n|---|---|---|\n`
  for (const id of c.ids) {
    const m = byId[id]
    if (!m) continue
    out += `| [\`${m.file}\`](vistas/${m.file}) (${m.w}×${m.h}) | **${md(m.titulo)}** | ${md(m.condicion)} |\n`
  }
  out += '\n'
}
out += `## Transiciones (las flechas del tablero)\n\n| De | A | Condición | Tipo |\n|---|---|---|---|\n`
for (const [a, b, texto, tipo = 'avanza'] of FLECHAS) {
  out += `| \`${a}\` | \`${b}\` | ${md(texto)} | ${tipo} |\n`
}
out += `
## Cómo se regeneran

\`\`\`bash
# 1) dev server con un Supabase de mentira (las URLs se interceptan en el navegador)
VITE_SUPABASE_URL=https://mock.supabase.local VITE_SUPABASE_ANON_KEY=mock npx vite --port 5173
# 2) capturas + tablero + este README (Playwright con el Chromium del entorno)
node scripts/figma-checkout/run.mjs      # ONLY=lima-A,prov-A … para una parte
node scripts/figma-checkout/board.mjs
node scripts/figma-checkout/readme.mjs
\`\`\`

Los escenarios están en \`run.mjs\`; el backend de mentira (producto, tienda, RENIEC,
\`register-buyer\`, \`flow-order\`, \`get-session\`) en \`mocks.mjs\`; las columnas y flechas del
tablero en \`spec.mjs\`. Nada de esto toca Supabase ni corre en producción.
`
fs.writeFileSync(DEST, out)
console.log('README:', DEST, out.length, 'chars')
