// ─── El enlace directo a Yape, sacado de las páginas web de Flow ─────────────
//
// ⚠️ ESTO NO ES API. Es scraping de las páginas PHP de Flow, y hay que
// leerlo sabiéndolo: Flow no lo publica, no lo soporta y puede cambiarlo sin
// aviso. Vive en su propio archivo —y no en `flow.ts`, que es el contrato
// documentado— para que la frontera entre lo que Flow promete y lo que
// nosotros deducimos quede a la vista.
//
// Por qué existe igual (08-set-2026). Con `paymentMethod` Yape One Shot, el
// enlace oficial de `payment/create` lleva a una página intermedia de Flow con
// un botón «Solicitar aprobación» que recién ahí abre Yape. En móvil esa página
// NO pide ningún dato —solo el botón— y detrás del botón hay un deeplink
// `https://www.yape.com.pe/app/checkout/oneshotpayment?…` que abre la app
// directo. Sacarlo de antemano cambia dos cosas: el comprador va de nuestra
// app A Yape sin pasar por una web ajena, y **nuestra pantalla no se navega a
// ningún lado**, así que la vuelta es la de 360pay —que ya funciona— y no la
// página de espera de Flow, que Android congela cuando el comprador se va a
// aprobar (`docs/12-FLOW.md` §5).
//
// La cadena, vista en el HTML real de un cobro (ORD-1788900938194):
//
//   GET  pay.php?token=<el de payment/create>   → formulario oculto
//   POST sendMedio.php (esos campos)             → formulario oculto
//   POST sendYapeOneShot.php (esos campos)       → un href a waitYapeOneShot.php?token=<UUID nuevo>
//   GET  waitYapeOneShot.php?token=<UUID>        → `deepLink: 'https://www.yape.com.pe/…'`
//
// El UUID de la última página NO es nuestro token: Flow lo acuña en ese paso.
// Por eso no se puede construir el enlace desde el servidor y hay que recorrer
// la cadena. Las cuatro llamadas van con User-Agent MÓVIL: con uno de
// escritorio `sendMedio.php` pide el celular y la cadena no llega a Yape.
//
// Las reglas que hacen que esto no pueda romper un cobro:
//
//   · **Nunca lanza.** Devuelve `{ ok:false, paso, motivo }`, y el que llama
//     (`flow-order`) sigue con el enlace oficial. Esto solo puede fallar en
//     OPTIMIZAR, jamás en cobrar.
//   · **Presupuesto de tiempo propio y corto.** Son cuatro viajes más en el
//     camino crítico del checkout; un solo `AbortSignal` cubre la cadena entera
//     y la corta antes de que el comprador lo note.
//   · **El enlace solo vale si es de yape.com.pe.** Es una URL sacada de un
//     HTML ajeno que vamos a entregar al teléfono del comprador: cualquier
//     otro host se descarta.
//   · **Ningún motivo lleva el token ni el HTML.** `paso` es el nombre de la
//     página y `motivo` una frase nuestra: es lo que se anota en `api_events`
//     y lo que se lee en Panel → Conexiones el día que Flow cambie algo.
//
// Sin APIs de Deno: `fetch`, `Response`, `URL` y `AbortSignal.timeout` existen
// igual en Deno, en Node 18+ y en el navegador, así que esto se testea desde
// `npm test` con un `fetch` inyectado.

/** Un iPhone: es el UA con el que se verificó la cadena entera. */
export const UA_MOVIL =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'

/** Para las CUATRO llamadas juntas. Más que esto ya se nota en el spinner. */
export const PRESUPUESTO_MS = 8_000

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type DeeplinkResult =
  | { ok: true; deeplink: string }
  /** `paso` es la página donde se cortó; `motivo`, una frase corta y nuestra. */
  | { ok: false; paso: string; motivo: string }

// ─── Parsers, puros ──────────────────────────────────────────────────────────

/** Las cinco entidades que aparecen en un atributo HTML. No hace falta más. */
export function desescapar(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function atributo(tag: string, nombre: string): string | null {
  const m = tag.match(new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? desescapar(m[1] ?? m[2] ?? m[3] ?? '') : null
}

/**
 * Los `<input>` con `name` de un HTML, como `{ name: value }`. Son los campos
 * ocultos con los que cada página de Flow le pasa el contexto a la siguiente.
 * El orden de los atributos no importa —`value` antes de `name` también vale—
 * y un input sin `value` viaja vacío, como haría el navegador.
 */
export function extraerInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const name = atributo(tag, 'name')
    if (!name) continue
    out[name] = atributo(tag, 'value') ?? ''
  }
  return out
}

/** El enlace a `waitYapeOneShot.php`, absoluto, o `null` si la página no lo trae. */
export function extraerHrefWait(html: string, origen: string): string | null {
  const m = html.match(/(?:https?:\/\/[a-z0-9.-]+)?\/app\/yape\/waitYapeOneShot\.php\?[^"'\s<>]+/i)
  if (!m) return null
  try {
    return new URL(desescapar(m[0]), origen).toString()
  } catch {
    return null
  }
}

/** El `deepLink: '…'` del script de la página de espera, o `null`. */
export function extraerDeepLink(html: string): string | null {
  const m = html.match(/deepLink\s*[:=]\s*["']([^"']+)["']/i)
  if (!m) return null
  // Dentro de un string de JS las barras suelen venir escapadas.
  const crudo = desescapar(m[1].replace(/\\\//g, '/'))
  try {
    return new URL(crudo).toString()
  } catch {
    return null
  }
}

/** Solo `https://` y solo Yape: es lo que se le va a entregar al comprador. */
export function esDeeplinkDeYape(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'yape.com.pe' || u.hostname.endsWith('.yape.com.pe'))
  } catch {
    return false
  }
}

// ─── La cadena ───────────────────────────────────────────────────────────────

/** Las cookies que Flow va dejando, para devolvérselas en el siguiente paso. */
class Cookies {
  private jar = new Map<string, string>()
  absorber(res: Response) {
    const h = res.headers as Headers & { getSetCookie?: () => string[] }
    const lista = typeof h.getSetCookie === 'function'
      ? h.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : [])
    for (const c of lista) {
      const par = c.split(';')[0]
      const i = par.indexOf('=')
      if (i > 0) this.jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim())
    }
  }
  header(): string | null {
    if (this.jar.size === 0) return null
    return Array.from(this.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

/**
 * Recorre las páginas de Flow hasta el deeplink de Yape, o dice en qué página
 * se cortó. `payUrl` es el enlace que devolvió `payment/create` (con su
 * `?token=`): el origen de las demás páginas se saca de ahí, así que sandbox y
 * producción salen solos.
 */
export async function derivarDeeplinkYape(input: {
  payUrl: string
  fetchImpl?: FetchLike
  presupuestoMs?: number
  userAgent?: string
}): Promise<DeeplinkResult> {
  const fetchImpl = input.fetchImpl ?? ((u, i) => fetch(u, i))
  const ua = input.userAgent ?? UA_MOVIL
  let origen: string
  try {
    origen = new URL(input.payUrl).origin
  } catch {
    return { ok: false, paso: 'pay.php', motivo: 'enlace de pago inválido' }
  }

  const signal = AbortSignal.timeout(input.presupuestoMs ?? PRESUPUESTO_MS)
  const cookies = new Cookies()

  /** Un viaje. Devuelve el HTML o el fallo ya armado, sin token ni cuerpo. */
  type Fallo = Extract<DeeplinkResult, { ok: false }>
  type Viaje = { fallo: Fallo; html?: never } | { html: string; fallo?: never }
  const ir = async (paso: string, url: string, form?: Record<string, string>): Promise<Viaje> => {
    const headers: Record<string, string> = { 'User-Agent': ua, Accept: 'text/html,*/*' }
    const cookie = cookies.header()
    if (cookie) headers.Cookie = cookie
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: form ? 'POST' : 'GET',
        headers,
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: 'follow',
        signal,
      })
    } catch {
      return { fallo: { ok: false as const, paso, motivo: signal.aborted ? 'presupuesto agotado' : 'sin respuesta' } }
    }
    cookies.absorber(res)
    if (!res.ok) return { fallo: { ok: false as const, paso, motivo: `HTTP ${res.status}` } }
    return { html: await res.text().catch(() => '') }
  }

  /** Lo que cada página puede traer ya resuelto: el deeplink, o el salto a la espera. */
  const atajo = (html: string): { deeplink: string } | { wait: string } | null => {
    const dl = extraerDeepLink(html)
    if (dl) return { deeplink: dl }
    const wait = extraerHrefWait(html, origen)
    if (wait) return { wait }
    return null
  }

  const terminar = (paso: string, deeplink: string): DeeplinkResult =>
    esDeeplinkDeYape(deeplink)
      ? { ok: true, deeplink }
      : { ok: false, paso, motivo: 'el deeplink no es de yape.com.pe' }

  const esperar = async (wait: string): Promise<DeeplinkResult> => {
    const r = await ir('waitYapeOneShot.php', wait)
    if (r.fallo) return r.fallo
    const dl = extraerDeepLink(r.html)
    return dl ? terminar('waitYapeOneShot.php', dl) : { ok: false, paso: 'waitYapeOneShot.php', motivo: 'sin deepLink en la página' }
  }

  try {
    // 1 · pay.php
    const p1 = await ir('pay.php', input.payUrl)
    if (p1.fallo) return p1.fallo
    const a1 = atajo(p1.html)
    if (a1 && 'deeplink' in a1) return terminar('pay.php', a1.deeplink)
    if (a1 && 'wait' in a1) return esperar(a1.wait)
    const f1 = extraerInputs(p1.html)
    if (Object.keys(f1).length === 0) return { ok: false, paso: 'pay.php', motivo: 'sin formulario' }

    // 2 · sendMedio.php
    const p2 = await ir('sendMedio.php', `${origen}/app/web/sendMedio.php`, f1)
    if (p2.fallo) return p2.fallo
    const a2 = atajo(p2.html)
    if (a2 && 'deeplink' in a2) return terminar('sendMedio.php', a2.deeplink)
    if (a2 && 'wait' in a2) return esperar(a2.wait)
    const f2 = extraerInputs(p2.html)
    if (Object.keys(f2).length === 0) return { ok: false, paso: 'sendMedio.php', motivo: 'sin formulario' }

    // 3 · sendYapeOneShot.php
    const p3 = await ir('sendYapeOneShot.php', `${origen}/app/yape/sendYapeOneShot.php`, f2)
    if (p3.fallo) return p3.fallo
    const a3 = atajo(p3.html)
    if (a3 && 'deeplink' in a3) return terminar('sendYapeOneShot.php', a3.deeplink)
    if (a3 && 'wait' in a3) return esperar(a3.wait)
    return { ok: false, paso: 'sendYapeOneShot.php', motivo: 'sin enlace a waitYapeOneShot' }
  } catch {
    // No debería pasar: cada viaje ya atrapa lo suyo. Pero la regla es que
    // esto NUNCA lanza hacia `flow-order`.
    return { ok: false, paso: 'cadena', motivo: 'excepción inesperada' }
  }
}
