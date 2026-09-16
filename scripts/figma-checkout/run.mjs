// Recorre el checkout REAL (landing → modal → /pedido) contra un backend de
// mentira y captura cada paso y cada rama como PNG de celular (390×844 @2x).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { instalarMocks } from './mocks.mjs'

import { execSync } from 'node:child_process'

// Playwright no es dependencia del proyecto: se usa el del repo si está, y si
// no el global (`npm i -g playwright`). El Chromium lo pone `npx playwright
// install chromium`, o el del entorno vía PLAYWRIGHT_BROWSERS_PATH.
const require = createRequire(import.meta.url)
function cargarPlaywright() {
  try { return require('playwright') } catch { /* no está en el repo */ }
  const global = execSync('npm root -g', { encoding: 'utf8' }).trim()
  return require(path.join(global, 'playwright'))
}
const { chromium } = cargarPlaywright()

const DIR = path.dirname(new URL(import.meta.url).pathname)
const PAQUETE = path.resolve(DIR, '../../docs/figma/checkout-flow')
const HOST = process.env.HOST || 'http://127.0.0.1:5173'
const OUT = process.env.OUT || path.join(PAQUETE, 'vistas')
fs.mkdirSync(OUT, { recursive: true })
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const VIEW = { width: 390, height: 844 }

const manifest = []
const wait = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch()
// Opcional: una copia local de las fuentes de Google (`fonts/fonts.css` + los
// woff2 con las barras de la ruta cambiadas por `__`). Sin ella el navegador
// las pide a la red, que es lo normal.
const FONTS = path.join(DIR, 'fonts')

async function contexto(S, ua = UA_ANDROID) {
  const context = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua,
    locale: 'es-PE', timezoneId: 'America/Lima', ignoreHTTPSErrors: true,
  })
  // Android «normal»: permiso de avisos sin decidir, para que la página del
  // pedido ofrezca «Avisarme por aquí» (headless lo reporta como denegado).
  await context.addInitScript(() => {
    try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }) } catch {}
  })
  await instalarMocks(context, S)
  if (fs.existsSync(path.join(FONTS, 'fonts.css'))) {
    // Las fuentes de Google se sirven desde disco: el navegador no sale a la red.
    await context.route(u => u.hostname === 'fonts.googleapis.com', r =>
      r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(FONTS, 'fonts.css')) }))
    await context.route(u => u.hostname === 'fonts.gstatic.com', r => {
      const f = path.join(FONTS, new URL(r.request().url()).pathname.slice(1).replace(/\//g, '__'))
      return fs.existsSync(f)
        ? r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(f) })
        : r.fulfill({ status: 404, body: '' })
    })
  }
  const page = await context.newPage()
  page.on('pageerror', e => console.log('  [pageerror]', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)) })
  return { context, page }
}

/** Captura. Si el contenido del modal desborda, agranda el alto hasta que
 *  entre completo: la vista de Figma tiene que enseñar el paso entero. */
async function shot(page, id, meta, opts = {}) {
  await wait(opts.settle ?? 450)
  let height = VIEW.height
  if (opts.fit) {
    // Página entera (landing, /pedido): el alto del documento, para que la
    // barra fija quede abajo de verdad y no a media página.
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
    height = Math.max(VIEW.height, Math.ceil(h))
    await page.setViewportSize({ width: VIEW.width, height })
    await wait(250)
  }
  for (let i = 0; i < 4 && !opts.noGrow && !opts.fit; i++) {
    const extra = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')
      const sc = dlg?.querySelector('.overflow-y-auto')
      if (!sc) return 0
      return Math.max(0, sc.scrollHeight - sc.clientHeight)
    })
    if (extra <= 0) break
    height = Math.ceil(height + extra * 1.1 + 24)
    await page.setViewportSize({ width: VIEW.width, height })
    await wait(150)
  }
  const file = path.join(OUT, `${id}.png`)
  await page.screenshot({ path: file, fullPage: false })
  if (height !== VIEW.height) { await page.setViewportSize(VIEW); await wait(100) }
  const size = await imageSize(file)
  manifest.push({ id, file: `${id}.png`, ...meta, ...size })
  console.log('  📸', id, `${size.w}×${size.h}`)
}

async function imageSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 }
}

// ─── Acciones ───────────────────────────────────────────────────────────────
const landing = (S, variant) => `${HOST}/landing/prod-1?store=demo${variant ? `&checkout=${variant}` : ''}`

async function abrirLanding(page, S, variant) {
  await page.goto(landing(S, variant), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '¡Lo quiero!' }).waitFor()
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }' })
  await wait(400)
}
async function abrirCheckout(page) {
  await page.getByRole('button', { name: '¡Lo quiero!' }).click()
  await page.getByRole('dialog').waitFor()
  await wait(300)
}
const next = page => page.getByRole('button', { name: 'Continuar →' }).click()
const back = page => page.getByRole('button', { name: 'Atrás' }).click()
const cerrar = page => page.getByLabel('Cerrar', { exact: true }).click()
const terminar = page => page.getByRole('button', { name: 'Terminar mi pedido' }).click()

async function contacto(page, { phone = '987654321', dni = '12345678', name } = {}) {
  await page.getByLabel('Tu WhatsApp').fill(phone)
  await page.getByLabel('Tu DNI').fill(dni)
  await page.getByLabel('Nombre de quien recibe').waitFor()
  if (name !== undefined) await page.getByLabel('Nombre de quien recibe').fill(name)
  await page.getByLabel('Nombre de quien recibe').blur()
}

async function distrito(page, query, detail) {
  const box = page.getByRole('combobox')
  await box.click()
  await box.fill(query)
  await page.getByRole('option').filter({ hasText: detail }).first().click()
  await wait(700)
}

async function direccion(page, text = 'Av. Larco 1301, dpto. 402', ref = 'Portón negro, frente a la bodega') {
  await page.getByLabel('Dirección', { exact: false }).first().fill(text)
  await page.getByLabel('Referencia de entrega').fill(ref)
  await page.getByLabel('Referencia de entrega').blur()
}

async function esperarAgencias(page) {
  await page.getByText('MÁS CERCANA').first().waitFor({ timeout: 15000 })
  await wait(400)
}

/** Simula la vuelta desde la app de pago: `visibilitychange` con la página visible. */
async function simularVuelta(page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

async function escenario(nombre, S, fn, ua) {
  if (ONLY && !ONLY.includes(nombre)) return
  console.log('▶', nombre)
  const { context, page } = await contexto(S, ua)
  try {
    await fn(page, S)
  } catch (e) {
    console.error('  ✖ FALLÓ', nombre, e.message)
    await page.screenshot({ path: path.join(OUT, `_fallo-${nombre}.png`) }).catch(() => {})
  }
  await context.close()
}

// ─── Escenarios ─────────────────────────────────────────────────────────────

// S1 · Lima · variante A · paga todo · Flow con deeplink. El camino feliz entero.
await escenario('lima-A', { flow: true, home: true, ab: 'A', desc: 5, dniDelay: 1800, registerDelay: 1600, flowDelay: 2200, verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S)
  await shot(page, '00-landing', { grupo: 'Entrada', titulo: 'Landing del producto', condicion: 'Entrada al flujo. La barra fija muestra el precio del pack y «¡Lo quiero!» abre el checkout.' }, { fit: true })
  await abrirCheckout(page)
  await shot(page, '01-paso1-pack', { grupo: 'Paso 1 · Tu pack', titulo: 'Paso 1 · Elige tu pack', condicion: 'Siempre. El pack recomendado viene preseleccionado (badge «MÁS ELEGIDO»), con el ahorro por unidad y las 6 señales de confianza. El CTA nunca se bloquea aquí.' })
  await next(page)
  await shot(page, '02-paso2-inicial', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · WhatsApp y DNI', condicion: 'Al entrar solo se piden WhatsApp y DNI. Nombre y distrito se revelan cuando el DNI tiene 8 dígitos.' })
  await page.getByLabel('Tu WhatsApp').fill('987654321')
  await page.getByLabel('Tu DNI').fill('12345678')
  await wait(350)
  await shot(page, '02b-paso2-dni-validando', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · Validando el DNI', condicion: 'DNI completo → consulta a RENIEC (Decolecta) en curso: «Validando tu DNI…». Nombre y distrito ya aparecen.' }, { settle: 100 })
  await page.getByText('MARIA FERNANDA QUISPE ROJAS').waitFor({ timeout: 10000 })
  await page.getByLabel('Nombre de quien recibe').blur()
  await shot(page, '02c-paso2-dni-validado', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · DNI validado', condicion: 'RENIEC devolvió el nombre: sello verde y «quien recibe» se rellena solo (nunca pisa lo escrito).' })
  const box = page.getByRole('combobox')
  await box.click(); await box.fill('Mira')
  await wait(300)
  await shot(page, '02f-paso2-distrito-buscando', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · Buscando el distrito', condicion: 'Un solo selector con los 1 874 distritos del país. Badge «Podemos ir a tu casa» solo si la marca reparte en esa región y el distrito tiene cobertura.' }, { noGrow: true })
  await page.getByRole('option').filter({ hasText: 'Lima, Lima' }).first().click()
  await wait(700)
  await direccion(page)
  await shot(page, '03-lima-A-domicilio', { grupo: 'Rama Lima', titulo: 'Lima · Variante A · Domicilio', condicion: 'Distrito de Lima Metropolitana/Callao + la marca reparte + checkout_ab_mode = A: el método queda en DOMICILIO sin preguntar. Se piden dirección y referencia; el aviso dice cuánto paga ahora.' })
  await next(page)
  await shot(page, '05-paso3-total-domicilio', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Paga todo · Domicilio', condicion: 'Default (§56): se cobra el total. Con Flow activo no se pide nada más: el botón de Yape llega después de «Terminar mi pedido».' })
  await terminar(page)
  await wait(500)
  await shot(page, '05i-paso3-registrando', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Registrando el pedido', condicion: 'Submit en vuelo (register-buyer): el botón se bloquea contra el doble tap y «Atrás» desaparece.' }, { settle: 50 })
  await page.getByText('Te llevamos a pagar con Yape').waitFor({ timeout: 10000 })
  await shot(page, '07-pago-emitiendo', { grupo: 'Pago', titulo: 'Pago · Creando la orden en Flow', condicion: 'Pedido registrado y riel FLOW: mientras flow-order responde se anuncia la salida a pagar. Sin pie: no hay botón que repetir.' }, { settle: 100 })
  await simularVuelta(page)
  await shot(page, '07b-pago-esperando-al-volver', { grupo: 'Pago', titulo: 'Pago · Volvió de la página de pago', condicion: 'Sin deeplink (o en escritorio) el comprador SALE a la página de Flow; al volver (visibilitychange / bfcache) la misma pantalla pasa a «Esperando tu pago por Yape…» y consulta el pedido cada 3 s.' }, { settle: 150 })
  await page.getByRole('link', { name: 'Pagar con Yape' }).waitFor({ timeout: 10000 })
  await shot(page, '07c-pago-yape', { grupo: 'Pago', titulo: 'Pago · Botón que abre Yape (deeplink)', condicion: 'Celular + el servidor sacó el deeplink de Yape: botón «Pagar con Yape», respaldo a la página de Flow, sello de pago seguro y la espera del MATCHED que deja el webhook.' })
  S.verification = 'MATCHED'
  await page.waitForURL(/\/pedido\//, { timeout: 15000 })
  await page.getByText('¡Pedido confirmado!').waitFor({ timeout: 15000 })
  await page.getByText('Ver mi comprobante de pago').waitFor({ timeout: 10000 }).catch(() => {})
  await shot(page, '08-pedido-confirmado-domicilio', { grupo: 'Pedido confirmado', titulo: '/pedido/:token · Pagado · Domicilio', condicion: 'El webhook confirmó el pago (MATCHED): navega a la página del pedido. Cabecera con la marca, recorrido (pago recibido + comprobante, boleta pendiente, preparando, en camino, entrega) y el bloque de avisos/app (Android).' }, { fit: true })
  await page.goto(landing(S), { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Ver mi pedido' }).waitFor()
  await shot(page, '00b-landing-pedido-reciente', { grupo: 'Entrada', titulo: 'Landing con pedido reciente', condicion: 'Hay un pedido guardado en este navegador (últimas 24 h): la barra suma «Ver mi pedido» junto a «¡Lo quiero!».' }, { fit: true })
})

// S2 · Lima · variante B (el comprador elige) · agencia.
await escenario('lima-B', { flow: true, home: true, ab: 'B', verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S, 'B')
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Mira', 'Lima, Lima')
  await shot(page, '03b-lima-B-elegir', { grupo: 'Rama Lima', titulo: 'Lima · Variante B · Elegir cómo recibirlo', condicion: 'checkout_ab_mode = B (o ?checkout=B) y la marca reparte: dos tarjetas, «En mi casa» y «Recojo en agencia». Nada más aparece hasta que elija.' })
  await page.getByRole('radio', { name: /En mi casa/ }).click()
  await wait(300)
  await shot(page, '03c-lima-B-casa', { grupo: 'Rama Lima', titulo: 'Lima · Variante B · En mi casa', condicion: 'Eligió casa: dirección + referencia y el aviso de cuánto paga ahora.' })
  await page.getByRole('radio', { name: /Recojo en agencia/ }).click()
  await esperarAgencias(page)
  await shot(page, '03d-lima-agencia-cercanas', { grupo: 'Rama Lima', titulo: 'Lima · Recojo en agencia · Puntos cercanos', condicion: 'Eligió agencia (también en Lima: Shalom y Olva tienen sedes). Los 4 puntos más cercanos al centro del distrito, mezclando couriers; el primero queda preseleccionado.' })
  await page.getByRole('button', { name: 'Ver todos los puntos de mi zona' }).click()
  await page.getByPlaceholder('Escribe tu distrito, dirección o agencia').fill('San Isidro')
  await wait(500)
  await shot(page, '03e-lima-agencia-buscar', { grupo: 'Rama Lima', titulo: 'Lima · Recojo en agencia · Ver todos', condicion: '«Ver todos los puntos de mi zona»: buscador sobre las 911 sedes, con vuelta al ranking de cercanía.' })
  await page.getByRole('button', { name: '← Ver los puntos más cercanos a mí' }).click()
  await esperarAgencias(page)
  await next(page)
  await shot(page, '05b-paso3-total-agencia', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Paga todo · Recojo en agencia', condicion: 'Mismo paso 3 con la copy de recojo: «recoges sin pagar nada más» y la entrega nombra la agencia y el distrito.' })
})

// S3 · Lima · la marca no reparte: agencia forzada, sin tarjetas.
await escenario('lima-sin-domicilio', { flow: true, home: false, courier: false, ab: 'B', verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S, 'B')
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Mira', 'Lima, Lima')
  await esperarAgencias(page)
  await shot(page, '03f-lima-sin-domicilio', { grupo: 'Rama Lima', titulo: 'Lima · Marca sin reparto a domicilio', condicion: 'home_delivery_enabled = false y sin courier de Lima (§60): el reducer fija AGENCIA al elegir distrito. No hay tarjetas ni badge en la lista; va directo al selector de puntos (también en variante B).' })
})

// S4 · Provincia · variante A: cobertura decide sola. Cubre IN_ZONE, OUT_OF_ZONE, semanal y solo-L-V.
await escenario('prov-A', { flow: true, home: true, ab: 'A', registerFail: true, verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S)
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Trujillo', 'Trujillo, La Libertad')
  await page.getByText('¡Sí llegamos a tu puerta!').waitFor()
  await direccion(page, 'Jr. Pizarro 540, Urb. Santa Isabel', 'Casa de dos pisos, portón verde')
  await shot(page, '04-prov-A-domicilio', { grupo: 'Rama Provincia', titulo: 'Provincia · Cobertura IN_ZONE · Variante A', condicion: 'Distrito fuera de Lima Metro con cobertura del courier (Trujillo): «¡Sí llegamos a tu puerta!» con el plazo del tarifario, dirección + referencia y la salida siempre abierta «Prefiero recoger en una agencia». Aviso naranja con el monto.' })
  await page.getByRole('button', { name: 'Prefiero recoger en una agencia' }).click()
  await esperarAgencias(page)
  await shot(page, '04b-prov-A-agencia-elegida', { grupo: 'Rama Provincia', titulo: 'Provincia · Prefiere recoger', condicion: 'Desde domicilio tocó «Prefiero recoger en una agencia» (CHOOSE_AGENCY_BRANCH_FLOW): caja morada + puntos cercanos. Como el distrito SÍ tiene cobertura, puede volver con «Prefiero intentar entrega a domicilio».' })
  await distrito(page, 'Bagua', 'Bagua, Amazonas')
  await esperarAgencias(page)
  await shot(page, '04c-prov-sin-cobertura', { grupo: 'Rama Provincia', titulo: 'Provincia · Sin cobertura (OUT_OF_ZONE)', condicion: 'El distrito no está en el tarifario del courier: la máquina fija AGENCIA. Caja morada «En tu zona la entrega es en agencia», puntos cercanos y sin enlace para volver a domicilio.' })
  await distrito(page, 'Poroy', 'Cusco, Cusco')
  await esperarAgencias(page)
  await shot(page, '04d-prov-semanal', { grupo: 'Rama Provincia', titulo: 'Provincia · Zona de visita semanal (BORDERLINE)', condicion: 'Distrito cubierto pero con entrega 1 vez por semana: el veredicto es BORDERLINE → AGENCIA, con el aviso operativo «el courier pasa una vez por semana».' })
  await distrito(page, 'Carhuaz', 'Carhuaz, Áncash')
  await page.getByText('¡Sí llegamos a tu puerta!').waitFor()
  await direccion(page, 'Jr. Comercio 215', 'Frente a la plaza')
  await next(page)
  await shot(page, '05g-paso3-nota-zona', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Aviso de zona', condicion: 'Distrito con entrega solo de lunes a viernes (weekdaysOnly): el paso 3 suma la nota ámbar bajo el resumen. Entrega en provincia a domicilio.' })
  await terminar(page)
  await page.getByRole('alert').filter({ hasText: 'No pudimos registrar tu pedido' }).waitFor({ timeout: 10000 })
  await shot(page, '05h-paso3-error-registro', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Error al registrar', condicion: 'register-buyer falló (red o servidor): mensaje en rojo y el CTA vuelve a estar disponible. No se borra nada de lo ingresado.' })
})

// S5 · Provincia · variante B · producto que permite la mitad · oferta de salida · fallo al emitir el pago.
await escenario('prov-B-mitad', { flow: true, home: true, ab: 'B', mitad: true, desc: 5, flowFail: true, verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S, 'B')
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Trujillo', 'Trujillo, La Libertad')
  await page.getByText('¿Cómo prefieres recibirlo?').waitFor()
  await shot(page, '04e-prov-B-elegir', { grupo: 'Rama Provincia', titulo: 'Provincia · IN_ZONE · Variante B · Elegir', condicion: 'Con cobertura confirmada y variante B, el método lo elige el comprador: dos tarjetas. Sin cobertura no se pregunta (va directo a agencia). El aviso naranja todavía no pone monto.' })
  await page.getByRole('button', { name: /En mi casa/ }).click()
  await wait(300)
  await direccion(page, 'Jr. Pizarro 540, Urb. Santa Isabel', 'Casa de dos pisos, portón verde')
  await shot(page, '04f-prov-B-casa', { grupo: 'Rama Provincia', titulo: 'Provincia · Variante B · En mi casa', condicion: 'Eligió casa: «Ok, te lo enviaremos a tu casa» (copy de elección, no de veredicto), plazo, dirección y la salida a agencia.' })
  await next(page)
  await shot(page, '05c-paso3-mitad-opciones', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · El producto permite pagar la mitad', condicion: 'products.permite_mitad = true: aparece «¿Cuánto quieres pagar ahora?» con Todo (default, con el empujón de puntos) y Mitad. Sin ese flag este bloque no existe.' })
  await page.getByRole('radio', { name: /Pago la mitad ahora/ }).click()
  await wait(300)
  await shot(page, '05d-paso3-mitad-elegida', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Eligió la mitad · Domicilio', condicion: 'advanceChoice = HALF: título «adelanta tu envío», fila «Adelantas ahora» y «Pagas al recibir» con el saldo.' })
  await back(page)
  await wait(400)
  await shot(page, '04i-prov-B-volver', { grupo: 'Rama Provincia', titulo: 'Provincia · Variante B · Volver al paso 2', condicion: 'Al volver de «Atrás» la rama vuelve a consultar la cobertura y, en variante B, deja el método en blanco: se vuelven a mostrar las dos tarjetas (la dirección escrita se conserva). El aviso naranja pasa a la versión sin monto de «adelanto».' })
  await page.getByRole('button', { name: /En mi casa/ }).click()
  await wait(400)
  await shot(page, '04h-prov-adelanto-mitad', { grupo: 'Rama Provincia', titulo: 'Provincia · Aviso con adelanto de la mitad', condicion: 'Volvió al paso 2 después de elegir la mitad y re-eligió casa: el aviso naranja cambia a «Adelanto de S/…» y «el resto lo pagas al recibir».' })
  await cerrar(page)
  await page.getByRole('alertdialog').waitFor()
  await shot(page, '06-salida-oferta', { grupo: 'Salida', titulo: 'Salida · Oferta de descuento', condicion: 'Tocó la X (o Esc) con datos ingresados, el producto tiene descuento_pen > 0 y aún no se le ofreció: diálogo de retención con el monto como héroe. Una sola vez por checkout.' })
  await page.getByRole('button', { name: 'Aplicar mi descuento' }).click()
  await wait(300)
  await shot(page, '01b-paso1-descuento-aplicado', { grupo: 'Paso 1 · Tu pack', titulo: 'Paso 1 · Descuento de salida aplicado', condicion: 'Aceptó la oferta: vuelve al paso 1 con el banner y el precio tachado en cada pack. El descuento se resta del total y del adelanto.' })
  await cerrar(page)
  await page.getByRole('alertdialog').waitFor()
  await shot(page, '06b-salida-confirmar', { grupo: 'Salida', titulo: 'Salida · Confirmación seca', condicion: 'Segundo intento de salir (o producto sin descuento): «¿Salir sin terminar?» con el borrador guardado 24 h. Esc = quedarse.' })
  await page.getByRole('button', { name: 'Seguir comprando' }).click()
  await next(page)
  // Variante B: al re-montar el paso 2 la cobertura se vuelve a consultar y el
  // método queda en blanco (ver 04i): hay que volver a elegir casa.
  await page.getByRole('button', { name: /En mi casa/ }).click()
  await wait(300)
  await next(page)
  await page.getByRole('button', { name: 'Terminar mi pedido' }).waitFor()
  await terminar(page)
  await page.getByText('Tu pedido está guardado').waitFor({ timeout: 15000 })
  await shot(page, '07d-pago-fallo', { grupo: 'Pago', titulo: 'Pago · No se pudo generar el pago', condicion: 'El pedido YA existe pero flow-order falló (ISSUE_FAILED): «Reintentar el pago» o «Prefiero que me escriban para pagar». Único punto con esa salida.' })
  await page.getByRole('button', { name: 'Prefiero que me escriban para pagar' }).click()
  await page.waitForURL(/\/pedido\//, { timeout: 15000 })
  await page.getByText('¡Pedido confirmado!').waitFor({ timeout: 15000 })
  await shot(page, '08c-pedido-pago-pendiente', { grupo: 'Pedido confirmado', titulo: '/pedido/:token · Pago pendiente', condicion: 'Eligió «que me escriban» (GIVE_UP): el pedido se registró con riel FLOW pero sin pago cruzado. Regla dura: nunca se le dice que su pago no existe — «un asesor coordina tu adelanto».' }, { fit: true })
  await page.goto(landing(S, 'B'), { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Coordinar el pago de tu pedido' }).waitFor()
  await shot(page, '00c-landing-pago-pendiente', { grupo: 'Entrada', titulo: 'Landing con pago pendiente', condicion: 'El pago en línea quedó a medias (advancePending): el botón secundario pasa a «Coordinar el pago de tu pedido» y lleva al chat.' }, { fit: true })
})

// S6 · Provincia · variante B · agencia · mitad → pedido con saldo por pagar.
await escenario('prov-B-agencia-mitad', { flow: true, home: true, ab: 'B', mitad: true, verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S, 'B')
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Trujillo', 'Trujillo, La Libertad')
  await page.getByRole('button', { name: /Recojo en agencia/ }).click()
  await esperarAgencias(page)
  await shot(page, '04g-prov-B-agencia', { grupo: 'Rama Provincia', titulo: 'Provincia · Variante B · Recojo en agencia', condicion: 'Eligió agencia teniendo cobertura: «Con gusto, te lo dejamos en la agencia que prefieras», puntos cercanos y el enlace para volver a domicilio.' })
  await next(page)
  await page.getByRole('radio', { name: /Pago la mitad ahora/ }).click()
  await wait(300)
  await shot(page, '05e-paso3-mitad-agencia', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Eligió la mitad · Agencia', condicion: 'HALF + AGENCIA: la fila dice «Saldo (lo pagas por la app)» — el saldo nunca se paga en el mostrador; pagarlo suelta la clave de recojo.' })
  await terminar(page)
  await page.getByRole('link', { name: 'Pagar con Yape' }).waitFor({ timeout: 15000 })
  S.verification = 'MATCHED'
  await page.waitForURL(/\/pedido\//, { timeout: 15000 })
  await page.getByText('¡Pedido confirmado!').waitFor({ timeout: 15000 })
  await page.getByText('Guía de envío emitida').waitFor({ timeout: 10000 })
  await wait(800)
  await shot(page, '08b-pedido-confirmado-agencia-saldo', { grupo: 'Pedido confirmado', titulo: '/pedido/:token · Mitad pagada · Agencia', condicion: 'Adelanto cruzado + recojo en Shalom: recorrido con guía pendiente, «En camino a Shalom», «Llegó a la agencia» con el botón real «Pagar S/… con Yape» (riel en línea + adelanto cruzado) y el recojo con el DNI.' }, { fit: true })
})

// S7 · Sin cobro en línea: el adelanto lo coordina un asesor.
await escenario('sin-cobro-en-linea', { flow: false, home: true, ab: 'A', verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S)
  await abrirCheckout(page)
  await next(page)
  await contacto(page)
  await distrito(page, 'Mira', 'Lima, Lima')
  await direccion(page)
  await next(page)
  await shot(page, '05f-paso3-sin-cobro-en-linea', { grupo: 'Paso 3 · Confirmar', titulo: 'Paso 3 · Tienda sin cobro en línea', condicion: 'stores.flow_enabled = false: el paso 3 avisa «Tu pago lo coordinamos por el chat» con el monto. Terminar registra el pedido y va directo a la página del pedido (REGISTERED_MANUAL).' })
  await terminar(page)
  await page.waitForURL(/\/pedido\//, { timeout: 15000 })
  await page.getByText('¡Pedido confirmado!').waitFor({ timeout: 15000 })
  await shot(page, '08d-pedido-coordinar-por-chat', { grupo: 'Pedido confirmado', titulo: '/pedido/:token · Sin cobro en línea', condicion: 'Pedido registrado sin riel: «Un asesor te escribe para coordinar tu adelanto». Sin comprobante ni boleta hasta que cruce el pago.' }, { fit: true })
})

// S8 · Errores de validación y DNI no encontrado.
await escenario('errores', { flow: true, home: true, ab: 'A', dniFound: false, verification: 'PENDING' }, async (page, S) => {
  await abrirLanding(page, S)
  await abrirCheckout(page)
  await next(page)
  await page.getByLabel('Tu WhatsApp').fill('987654321')
  await page.getByLabel('Tu DNI').fill('99999999')
  await page.getByText('No pudimos validarlo, pero puedes continuar.').waitFor({ timeout: 10000 })
  await shot(page, '02d-paso2-dni-no-validado', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · DNI no validado', condicion: 'RENIEC no lo encontró (o el servicio cayó): «No pudimos validarlo, pero puedes continuar». El nombre queda vacío para escribirlo; nunca se bloquea la venta por un servicio externo.' })
  await page.getByLabel('Tu WhatsApp').fill('812345678')
  await page.getByLabel('Tu WhatsApp').blur()
  await page.getByLabel('Nombre de quien recibe').focus()
  await page.getByLabel('Nombre de quien recibe').blur()
  // El CTA está aria-disabled: tocarlo igual destapa todos los errores del paso.
  await page.getByRole('button', { name: 'Continuar →' }).dispatchEvent('click')
  await wait(300)
  await shot(page, '02e-paso2-errores', { grupo: 'Paso 2 · Tus datos', titulo: 'Paso 2 · Errores de validación', condicion: 'Campos con error al tocar el CTA (celular que no empieza en 9, nombre vacío, distrito sin elegir): mensajes que dicen CÓMO arreglarlo, CTA gris y la ayuda «Completa los datos marcados».' })
})

// S9 · La página del pedido en iPhone (sin push web: video de instalación).
await escenario('pedido-iphone', { flow: true, home: true, ab: 'A', verification: 'MATCHED' }, async (page, S) => {
  S.registerBody = {
    buyer_name: 'María Fernanda Quispe Rojas', buyer_phone: '987654321', product_name: 'Sérum de Vitamina C 30 ml',
    product_price: 189, pack_name: '2 unidades', address: 'Av. Larco 1301, dpto. 402, Miraflores',
    delivery_reference: 'Portón negro, frente a la bodega', dispatch_type: 'MOTORIZADO_LIMA',
    payment_provider: 'FLOW', advance_amount: 189, document_number: '12345678',
  }
  S.row = { id: 'sess-1' }
  await page.goto(`${HOST}/pedido/tok-demo-1?store=demo`, { waitUntil: 'networkidle' })
  await page.getByText('¡Pedido confirmado!').waitFor({ timeout: 15000 })
  await page.addStyleTag({ content: '* { transition: none !important; }' })
  await wait(800)
  await shot(page, '08e-pedido-confirmado-iphone', { grupo: 'Pedido confirmado', titulo: '/pedido/:token · iPhone', condicion: 'Mismo pedido pagado visto en iPhone: Safari no da push web, así que el bloque final enseña el video de instalación en vez de «Avisarme por aquí».' }, { fit: true })
}, UA_IPHONE)

// Se funde con el manifiesto anterior: una corrida parcial (ONLY=…) no borra
// las vistas que no volvió a capturar.
const MANIFEST = path.join(OUT, 'manifest.json')
const previo = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : []
const fundido = new Map(previo.map(m => [m.id, m]))
for (const m of manifest) fundido.set(m.id, m)
fs.writeFileSync(MANIFEST, JSON.stringify([...fundido.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2))
await browser.close()
console.log('listo:', manifest.length, 'vistas en', OUT)
