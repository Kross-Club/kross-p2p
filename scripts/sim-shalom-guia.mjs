// ─── Simulación: ¿un pedido de provincia genera su guía Shalom solo? ─────────
// Pregunta que responde: si la marca HUBIERA tenido su cuenta Shalom Pro
// conectada cuando entró el pedido, ¿Kross le habría generado la guía en
// automático?
//
// No inventa la respuesta ni la copia de un doc: RECORRE EL CÓDIGO REAL del
// pipeline —el mismo que corre en producción— y por cada paso reporta qué le
// pide a Shalom, con archivo:línea. Si mañana alguien construye el generador
// de envíos (pendiente #3 de docs/02-SMART-LOGISTICS.md), este script lo
// detecta solo y cambia su veredicto. Un simulador que hardcodea el resultado
// miente a la semana.
//
// No toca la base ni la red: es lectura de fuentes. Correrlo es gratis y no
// crea ninguna guía real (las de Shalom son cobrables y no tienen sandbox).
//
// Uso: npm run sim:shalom

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAICES = ['supabase/functions', 'src', 'api']

// ─── Utilidades de lectura ───────────────────────────────────────────────────

const archivos = []
const recorrer = dir => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue
    if (statSync(ruta).isDirectory()) recorrer(ruta)
    else if (/\.(ts|tsx|js|mjs)$/.test(nombre)) archivos.push(ruta)
  }
}
for (const raiz of RAICES) { try { recorrer(raiz) } catch { /* raíz opcional */ } }

const cache = new Map()
const lineasDe = ruta => {
  if (!cache.has(ruta)) cache.set(ruta, readFileSync(ruta, 'utf8').split('\n'))
  return cache.get(ruta)
}

/** Coincidencias de `re` en un archivo → [{ruta, linea, texto}]. */
const buscarEn = (ruta, re) => {
  const out = []
  lineasDe(ruta).forEach((texto, i) => {
    if (re.test(texto)) out.push({ ruta, linea: i + 1, texto: texto.trim() })
    re.lastIndex = 0
  })
  return out
}

/** Lo mismo sobre todo el repo. */
const buscar = re => archivos.flatMap(ruta => buscarEn(ruta, re))

const cita = m => `${m.ruta}:${m.linea}`

// ─── Endpoints del proveedor: qué familia es cada uno ────────────────────────
// api.shalom-api-peru.com es el único host de Shalom que usa el repo. Lo que
// importa no es que se le llame, sino A QUÉ familia pertenece cada llamada:
// rastrear un envío que YA existe no es lo mismo que CREARLO.

// El repo escribe estas URLs de dos formas: el host literal, o un
// `${SHALOM_API_BASE}` con el path pegado. Se reconocen las dos. Se ignoran
// los comentarios (una URL citada en una nota no es una llamada) y las líneas
// sin path (declarar la base no es llamar a nadie).
const HOST = /(?:api\.shalom-api-peru\.com|\$\{[A-Z_]+BASE\})(\/[\w/{}$.?=&-]+)/
const esComentario = t => /^(\/\/|\*|\/\*)/.test(t)

const FAMILIAS = [
  { clave: 'CREAR',    re: /\/v1\/(orders|quotes|cotiza|shipments|rotulo)/i, rotulo: 'crear pedido / cotizar / rótulo — GENERA GUÍA' },
  { clave: 'TRACKING', re: /\/v1\/tracking/i,                                 rotulo: 'rastrear un envío que ya existe' },
  { clave: 'WEBHOOK',  re: /\/v1\/webhooks/i,                                 rotulo: 'suscripción a las transiciones' },
  { clave: 'SESION',   re: /\/v1\/shalom\/sessions/i,                         rotulo: 'login de la cuenta Shalom Pro (solo verifica credenciales)' },
  { clave: 'SALUD',    re: /\/healthz/i,                                      rotulo: 'semáforo verde/rojo de la API' },
]

const familiaDe = url => FAMILIAS.find(f => f.re.test(url))?.clave ?? 'OTRA'

// Autoprueba del clasificador: si esto se rompe, el veredicto de abajo miente.
for (const [url, esperado] of [
  ['/v1/orders', 'CREAR'], ['/v1/tracking/batch', 'TRACKING'],
  ['/v1/webhooks', 'WEBHOOK'], ['/v1/shalom/sessions', 'SESION'], ['/healthz', 'SALUD'],
]) {
  if (familiaDe(url) !== esperado) throw new Error(`clasificador roto: ${url} → ${familiaDe(url)}`)
}

/** Llamadas a Shalom dentro de un archivo, con su familia. */
const llamadasShalom = ruta => buscarEn(ruta, HOST)
  .filter(m => !esComentario(m.texto))
  .map(m => {
    const url = m.texto.match(HOST)[0]
    return { ...m, url, familia: familiaDe(url) }
  })

// ─── El pipeline real de un pedido de provincia con recojo en agencia ────────
// Cada paso apunta al archivo que lo ejecuta. `entrada` marca los pasos que
// NO se disparan solos: los dispara una persona desde la PWA.

const PASOS = [
  {
    titulo: 'El checkout guiado cierra el pedido',
    archivo: 'supabase/functions/register-buyer/index.ts',
    hace: 'crea el order_session con dispatch_type de agencia y agency_name (SHALOM/OLVA)',
  },
  {
    titulo: 'El comprador paga el adelanto del flete',
    archivo: 'supabase/functions/pay360-webhook/index.ts',
    hace: 'marca payment_verification=MATCHED y lo acusa por el chat del pedido',
  },
  {
    titulo: 'Se despacha: alguien REGISTRA la guía en el pedido',
    archivo: 'supabase/functions/order-manage/index.ts',
    hace: 'acción set_tracking: valida numero+codigo, se los manda al comprador por el chat y suscribe el envío al webhook',
    entrada: 'src/components/TrackingBar.tsx',
  },
  {
    titulo: 'El proveedor empuja cada transición del envío',
    archivo: 'supabase/functions/shalom-webhook/index.ts',
    hace: 'refleja la fase (solo hacia adelante), avisa al comprador y dispara la cobranza del saldo al llegar a destino',
  },
  {
    titulo: 'El barrido cubre lo que el webhook no trajo',
    archivo: 'supabase/functions/shalom-tracking-sync/index.ts',
    hace: 'cada 30 min consulta las guías vivas y aplica el mismo reflejo',
  },
]

// ─── La simulación ───────────────────────────────────────────────────────────

const T = {
  h: s => `\n\x1b[1m${s}\x1b[0m`,
  ok: s => `\x1b[32m${s}\x1b[0m`,
  no: s => `\x1b[31m${s}\x1b[0m`,
  gris: s => `\x1b[90m${s}\x1b[0m`,
}

console.log(T.h('SIMULACIÓN · pedido de provincia con la cuenta Shalom Pro CONECTADA'))
console.log(T.gris('Hipótesis: store_secrets.shalom_pro_status = CONNECTED al momento del pedido.'))
console.log(T.gris('Pregunta:  ¿Kross le genera la guía sola?\n'))

let creaGuia = []

PASOS.forEach((paso, i) => {
  console.log(`${i + 1}. ${paso.titulo}`)
  console.log(T.gris(`   ${paso.archivo} — ${paso.hace}`))

  const llamadas = llamadasShalom(paso.archivo)
  if (!llamadas.length) {
    console.log(`   Llamadas a Shalom: ${T.gris('ninguna')}`)
  } else {
    for (const l of llamadas) {
      const fam = FAMILIAS.find(f => f.clave === l.familia)
      const et = fam ? fam.rotulo : 'sin clasificar'
      console.log(`   Llamada a Shalom: ${l.url}  ${T.gris(`(${et})`)}  ${T.gris(cita(l))}`)
      if (l.familia === 'CREAR') creaGuia.push(l)
    }
  }

  if (paso.entrada) {
    // Un paso con `entrada` depende de que una persona escriba algo: se
    // verifica contra el código, no de palabra.
    const campos = buscarEn(paso.entrada, /placeholder=.*Gu[ií]a/i)
    const disparo = buscarEn(paso.entrada, /action: 'set_tracking'/)
    console.log(`   ${T.no('⚠ ENTRADA MANUAL')}: lo dispara una persona desde ${paso.entrada}`)
    for (const m of [...campos, ...disparo]) console.log(T.gris(`      ${m.texto}  ${cita(m)}`))
  }
  console.log()
})

// ─── Auditoría 1 · ¿existe en algún lado la familia que crea la guía? ────────

console.log(T.h('¿Alguien en el repo llama a la familia que CREA la guía?'))
const todasCrear = archivos.flatMap(llamadasShalom).filter(m => m.familia === 'CREAR')
creaGuia = [...creaGuia, ...todasCrear]
if (creaGuia.length) {
  console.log(T.ok(`Sí — ${creaGuia.length} llamada(s):`))
  for (const m of creaGuia) console.log(`  ${m.url}  ${T.gris(cita(m))}`)
} else {
  console.log(T.no('No. Ni una sola llamada a POST /v1/orders (ni cotización, ni rótulo) en todo el repo.'))
}

// ─── Auditoría 2 · ¿las credenciales conectadas mueven algo aguas abajo? ─────

console.log(T.h('Conectar la cuenta, ¿cambia algo del pedido?'))
const CONEXION = /manage-store|MarcaPage/
const usos = buscar(/shalom_pro_(email|password)/).filter(m => !CONEXION.test(m.ruta))
if (usos.length) {
  console.log(T.ok('Sí: hay código fuera del panel que usa las credenciales:'))
  for (const m of usos) console.log(`  ${T.gris(cita(m))}  ${m.texto}`)
} else {
  console.log(T.no('No. Las credenciales solo se guardan y se verifican con un login (manage-store);'))
  console.log(T.no('ningún otro archivo las lee. El pedido corre igual con la cuenta conectada o sin ella.'))
}

// ─── Auditoría 3 · ¿quién es el único que puede poner la guía en el pedido? ──

console.log(T.h('¿Quién escribe el número de guía en el pedido?'))
// Solo escrituras: una declaración de tipo (`tracking_numero: string | null`)
// no escribe nada en el pedido.
const escritores = buscar(/tracking_numero:/).filter(m => !/:\s*(string|number|boolean)\b/.test(m.texto))
for (const m of escritores) console.log(`  ${T.gris(cita(m))}  ${m.texto}`)

// ─── Veredicto ───────────────────────────────────────────────────────────────

console.log(T.h('VEREDICTO'))
if (creaGuia.length) {
  console.log(T.ok('El generador de envíos EXISTE en el código: revisa las llamadas de arriba'))
  console.log(T.ok('y vuelve a correr la simulación contra el paso que las hace.'))
} else {
  console.log(`${T.no('NO se genera la guía en automático')}, con Shalom Pro conectado o sin conectar.`)
  console.log('')
  console.log('  · Conectar la cuenta hoy solo guarda y valida credenciales (login real, ~90 s).')
  console.log('  · El pedido se cierra, cobra el adelanto y avisa por el chat sin tocar Shalom.')
  console.log('  · La guía la genera SHALOM en su mostrador cuando alguien lleva el paquete,')
  console.log('    y entra a Kross a mano: Logística la escribe en TrackingBar (numero + código).')
  console.log('  · Recién ahí arranca todo lo automático: aviso al comprador, suscripción al')
  console.log('    webhook, reflejo de fases y cobranza del saldo al llegar a destino.')
  console.log('')
  console.log(T.gris('  Falta el pendiente #3 de docs/02-SMART-LOGISTICS.md (generador de envíos):'))
  console.log(T.gris('  POST /v1/orders con las credenciales Shalom Pro de la marca. Decisión aparte'))
  console.log(T.gris('  porque crea guías REALES y cobrables, sin sandbox ni idempotencia.'))
}
console.log()
