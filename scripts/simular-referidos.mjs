// ─── Simulación del programa de referidos ────────────────────────────────────
//
// Cuánto gana el que refiere y cuánto le cuesta a Kross, por tienda referida,
// con dos esquemas: **A** (S/0.20 por cobro Yape) y **B** (20 % de la
// suscripción + S/0.10 por cobro + primer mes de la referida al 50 %).
// El razonamiento y las tablas están en `docs/15-REFERIDOS.md`.
//
// Correr: `node scripts/simular-referidos.mjs`
//
// El cálculo del cobro es el mismo de `supabase/functions/_shared/comision.ts`
// (tarifa 5 % + S/1.20 con IGV, 360pay S/3.15 + IGV planos, Flow % + IGV) y se
// copia acá en vez de importarse porque ese archivo es TypeScript y este script
// corre con `node` a secas. Si la tarifa cambia allá, cambia acá.
//
// ⚠️ La tasa de Flow es la variable que lo mueve todo: el contrato dice 3.5 %
// y el panel de Flow mostró 5.5 % en el primer cobro real (ESTADO-OPERATIVO,
// 08-set-2026). Se simulan las dos.

const IGV = 1.18
const TARIFA = { pct: 0.05, fijo: 1.20 }          // lo que Kross cobra, IGV incl.
const COSTO_360 = 3.15 * IGV                       // S/3.72 planos
const TASAS = { contrato: 0.035, medida: 0.055 }   // Flow, neto de IGV
const TC = Number(process.env.TC ?? 3.75)          // S/ por US$ (parámetro)
const SUB_USD = Number(process.env.SUB_USD ?? 67)
const SUB = SUB_USD * TC                           // IGV incl.

const r2 = n => Math.round(n * 100) / 100
const comision = m => r2(m * TARIFA.pct + TARIFA.fijo)
const cruce = tasa => 3.15 / tasa                  // S/90 · S/57.27
function cobro(monto, tasa, corte = cruce(tasa)) {
  const riel = monto >= corte ? '360PAY' : 'FLOW'
  const costo = riel === '360PAY' ? COSTO_360 : monto * tasa * IGV
  const com = comision(monto)
  return { monto, riel, comision: com, costo, margen: com - costo }
}

/** Tres tiendas referidas. La demo es la del panel (`src/lib/demo/tienda-demo.ts`);
 *  las otras dos son supuestos: la conversión del paso 3 no está medida. */
const PERFILES = {
  chica:  { nombre: 'Tienda chica · 10 pedidos/día',   pedidosDia: 10,   conv: 0.60, total: 0.25, saldoOnline: 0.55, tickets: [89, 129, 159] },
  tipica: { nombre: 'Tienda típica · 30 pedidos/día',  pedidosDia: 30,   conv: 0.60, total: 0.25, saldoOnline: 0.55, tickets: [89, 129, 159] },
  demo:   { nombre: 'Tienda demo · 1.000 pedidos/día', pedidosDia: 1000, conv: 0.82, total: 0.25, saldoOnline: 0.55, tickets: [120, 150, 180] },
}

const ESQUEMAS = {
  A: { nombre: 'Tu propuesta',  porCobro: 0.20, pctSub: 0,    primerMes: 0 },
  B: { nombre: 'Recomendación', porCobro: 0.10, pctSub: 0.20, primerMes: 0.5 },
}

/** Un mes (30 días) de la referida: cobros, comisión, margen y take de Kross. */
function mes(perfil, tasa, corte) {
  const pedidos = perfil.pedidosDia * 30
  const pagados = pedidos * perfil.conv
  const n = perfil.tickets.length
  let tx = 0, com = 0, mg = 0
  for (const t of perfil.tickets) {
    const full = pagados * perfil.total / n
    const half = pagados * (1 - perfil.total) / n
    const saldo = half * perfil.saldoOnline
    const ad = Math.round(t / 2)
    for (const [monto, cant] of [[t, full], [ad, half], [t - ad, saldo]]) {
      const c = cobro(monto, tasa, corte)
      tx += cant; com += c.comision * cant; mg += c.margen * cant
    }
  }
  const margenNeto = mg / IGV
  const subNeto = SUB / IGV
  return { pedidos, pagados, tx, comision: com, margenBruto: mg, margenNeto, subNeto, takeNeto: margenNeto + subNeto }
}

const pago = (esq, m) => esq.porCobro * m.tx + esq.pctSub * SUB

const f = n => n.toLocaleString('es-PE', { maximumFractionDigits: 0 })
const f2 = n => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = n => (n * 100).toFixed(1) + ' %'

console.log(`Suscripción: US$${SUB_USD} × ${TC} = S/${f2(SUB)} (IGV incl.) · neto S/${f2(SUB / IGV)}`)
console.log(`20 % de la suscripción = S/${f2(0.2 * SUB)} · primer mes al 50 % = S/${f2(0.5 * SUB)}`)
console.log()

for (const [tk, tasa] of Object.entries(TASAS)) {
  console.log(`━━━ Flow ${tk} (${(tasa * 100).toFixed(1)} % + IGV = ${(tasa * IGV * 100).toFixed(2)} %) · corte de riel S/${f2(cruce(tasa))} ━━━`)
  for (const perfil of Object.values(PERFILES)) {
    const m = mes(perfil, tasa)
    const pa = pago(ESQUEMAS.A, m), pb = pago(ESQUEMAS.B, m)
    console.log(`\n${perfil.nombre}`)
    console.log(`  pedidos/mes ${f(m.pedidos)} · con adelanto ${f(m.pagados)} · cobros Yape/mes ${f(m.tx)} (${(m.tx / m.pedidos).toFixed(2)} por pedido)`)
    console.log(`  comisión que paga la tienda S/${f(m.comision)} · margen Kross bruto S/${f(m.margenBruto)} · neto S/${f(m.margenNeto)} · + sub neta S/${f(m.subNeto)} = take neto S/${f(m.takeNeto)}`)
    console.log(`  A  referidor gana S/${f2(pa)}/mes · ${pct(pa / m.takeNeto)} del take neto · Kross se queda S/${f(m.takeNeto - pa)}`)
    console.log(`  B  referidor gana S/${f2(pb)}/mes · ${pct(pb / m.takeNeto)} del take neto · Kross se queda S/${f(m.takeNeto - pb)} · + S/${f2(0.5 * SUB)} una vez (primer mes de la referida)`)
    console.log(`  referidas para suscripción gratis: A ${(SUB / pa).toFixed(1)} · B ${(SUB / pb).toFixed(1)}`)
  }
  console.log()
}

console.log('━━━ Margen de Kross por cobro (IGV incl.), según monto ━━━')
console.log('monto | contrato 3.5% (corte 90) | medida 5.5% (corte 57) | medida 5.5% con el corte de hoy (90)')
for (const m of [5, 10, 20, 30, 40, 45, 50, 57, 60, 65, 75, 80, 85, 89, 90, 100, 120, 150, 180]) {
  const a = cobro(m, TASAS.contrato), b = cobro(m, TASAS.medida), c = cobro(m, TASAS.medida, 90)
  console.log(`S/${String(m).padStart(3)} | ${f2(a.margen).padStart(6)} ${a.riel.padEnd(6)} | ${f2(b.margen).padStart(6)} ${b.riel.padEnd(6)} | ${f2(c.margen).padStart(6)} ${c.riel}`)
}

// Dónde empatan A y B, en pedidos/día de la referida (mezcla de la tienda típica)
const base = PERFILES.tipica
const txPorPedido = mes(base, TASAS.medida).tx / mes(base, TASAS.medida).pedidos
const cruceAB = (ESQUEMAS.B.pctSub * SUB) / ((ESQUEMAS.A.porCobro - ESQUEMAS.B.porCobro) * txPorPedido * 30)
console.log(`\nA = B cuando la referida hace ${cruceAB.toFixed(1)} pedidos/día (${f(cruceAB * 30 * txPorPedido)} cobros/mes)`)

console.log('\n━━━ S/0.20 y S/0.10 como % del margen NETO del cobro ━━━')
for (const m of [10, 45, 60, 65, 80, 90, 129, 159]) {
  for (const [tk, tasa] of Object.entries(TASAS)) {
    const c = cobro(m, tasa); const neto = c.margen / IGV
    console.log(`S/${m} ${tk}: margen neto S/${f2(neto)} · 0.20 = ${pct(0.20 / neto)} · 0.10 = ${pct(0.10 / neto)}`)
  }
}
