// Tests del scraping que saca el deeplink de Yape de las páginas de Flow.
//
// Lo que se prueba acá NO es que Flow siga igual —eso no se puede probar sin
// Flow, y el día que cambie lo va a decir Panel → Conexiones—, sino lo que sí
// es nuestro: que los parsers leen lo que se vio en el HTML real, que la cadena
// sigue el orden correcto pasando los campos y las cookies, que corta con un
// `paso` legible en cada sitio donde puede cortarse, y sobre todo que NUNCA
// lanza ni deja pasar un enlace que no sea de Yape.

import { describe, expect, it } from 'vitest'
import {
  derivarDeeplinkYape, desescapar, esDeeplinkDeYape, extraerDeepLink, extraerHrefWait,
  extraerInputs, PRESUPUESTO_MS, UA_MOVIL, type FetchLike,
} from '../../../supabase/functions/_shared/flow-yape-deeplink.ts'

const ORIGEN = 'https://www.flow.cl'
const TOKEN = '752991F72F22E8A6213020AF4B903008280B13EF'
const PAY_URL = `${ORIGEN}/app/web/pay.php?token=${TOKEN}`
const UUID = '5be65555-ddaf-4d0b-82c7-e9f945a441f6'
const DEEPLINK = `https://www.yape.com.pe/app/checkout/oneshotpayment?origin=deeplink-externo&consentId=${UUID}&partnerCode=PEX005`

const htmlPay = `<html><body><form method="post" action="sendMedio.php">
  <input type="hidden" name="token" value="${TOKEN}">
  <input value='170' type='hidden' name='medio'>
  <input type="submit" value="Continuar">
</form></body></html>`

const htmlMedio = `<html><body><form method="post" action="/app/yape/sendYapeOneShot.php">
  <input type="hidden" name="token" value="${TOKEN}" />
  <input type="hidden" name="paso" value="oneshot">
</form></body></html>`

const htmlOneShot = `<html><body>
  <a class="btn" href="/app/yape/waitYapeOneShot.php?token=${UUID}">Solicitar aprobación</a>
</body></html>`

const htmlWait = `<html><body><script>
  var config = { deepLink: '${DEEPLINK.replace(/\//g, '\\/')}', poll: 3000 };
</script></body></html>`

/** Un Flow de mentira: responde por ruta y anota cada llamada. */
function servidor(paginas: Record<string, string | (() => Response)>, opts: { cookie?: string } = {}) {
  const llamadas: { url: string; method: string; headers: Record<string, string>; body: string }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    llamadas.push({ url, method: init?.method ?? 'GET', headers, body: String(init?.body ?? '') })
    const ruta = new URL(url).pathname
    const pagina = paginas[ruta]
    if (pagina === undefined) return new Response('no existe', { status: 404 })
    if (typeof pagina === 'function') return pagina()
    const h = new Headers({ 'content-type': 'text/html' })
    if (opts.cookie) h.append('set-cookie', `${opts.cookie}; Path=/; HttpOnly`)
    return new Response(pagina, { status: 200, headers: h })
  }
  return { fetchImpl, llamadas }
}

const CADENA = {
  '/app/web/pay.php': htmlPay,
  '/app/web/sendMedio.php': htmlMedio,
  '/app/yape/sendYapeOneShot.php': htmlOneShot,
  '/app/yape/waitYapeOneShot.php': htmlWait,
}

describe('desescapar', () => {
  it('conoce las entidades de un atributo y deja lo demás quieto', () => {
    expect(desescapar('a&amp;b=&quot;c&quot; &#39;d&#39; &lt;e&gt;')).toBe(`a&b="c" 'd' <e>`)
    expect(desescapar('sin entidades')).toBe('sin entidades')
  })
})

describe('extraerInputs', () => {
  it('lee los campos con name, en cualquier orden de atributos y con cualquier comilla', () => {
    expect(extraerInputs(htmlPay)).toEqual({ token: TOKEN, medio: '170' })
  })

  it('un input sin value viaja vacío, como haría el navegador', () => {
    expect(extraerInputs('<input name="tel">')).toEqual({ tel: '' })
  })

  it('ignora los inputs sin name y desescapa el value', () => {
    expect(extraerInputs('<input type="submit" value="x"><input name="q" value="a&amp;b">'))
      .toEqual({ q: 'a&b' })
  })

  it('sin inputs devuelve vacío, que es lo que la cadena lee como «sin formulario»', () => {
    expect(extraerInputs('<p>nada</p>')).toEqual({})
  })
})

describe('extraerHrefWait', () => {
  it('devuelve el enlace ABSOLUTO, venga relativo o completo', () => {
    expect(extraerHrefWait(htmlOneShot, ORIGEN)).toBe(`${ORIGEN}/app/yape/waitYapeOneShot.php?token=${UUID}`)
    expect(extraerHrefWait(`<a href="https://www.flow.cl/app/yape/waitYapeOneShot.php?token=${UUID}">`, ORIGEN))
      .toBe(`${ORIGEN}/app/yape/waitYapeOneShot.php?token=${UUID}`)
  })

  it('resuelve contra el origen que le pasan: sandbox sale solo', () => {
    expect(extraerHrefWait(htmlOneShot, 'https://sandbox.flow.cl'))
      .toBe(`https://sandbox.flow.cl/app/yape/waitYapeOneShot.php?token=${UUID}`)
  })

  it('null cuando no está', () => {
    expect(extraerHrefWait(htmlMedio, ORIGEN)).toBeNull()
  })
})

describe('extraerDeepLink', () => {
  it('lee el deepLink del script, con las barras escapadas de JS', () => {
    expect(extraerDeepLink(htmlWait)).toBe(DEEPLINK)
  })

  it('acepta `=` además de `:` y comillas dobles', () => {
    expect(extraerDeepLink(`deepLink = "${DEEPLINK}"`)).toBe(DEEPLINK)
  })

  it('null si no hay, o si lo que hay no es una URL', () => {
    expect(extraerDeepLink(htmlOneShot)).toBeNull()
    expect(extraerDeepLink(`deepLink: 'no es url'`)).toBeNull()
  })
})

describe('esDeeplinkDeYape', () => {
  it('solo https y solo yape.com.pe', () => {
    expect(esDeeplinkDeYape(DEEPLINK)).toBe(true)
    expect(esDeeplinkDeYape('https://yape.com.pe/x')).toBe(true)
    expect(esDeeplinkDeYape('http://www.yape.com.pe/x')).toBe(false)
    expect(esDeeplinkDeYape('https://www.yape.com.pe.evil.com/x')).toBe(false)
    expect(esDeeplinkDeYape('https://www.flow.cl/x')).toBe(false)
    expect(esDeeplinkDeYape('javascript:alert(1)')).toBe(false)
    expect(esDeeplinkDeYape('')).toBe(false)
  })
})

describe('derivarDeeplinkYape', () => {
  it('recorre las cuatro páginas en orden, pasando los campos de cada una a la siguiente', async () => {
    const { fetchImpl, llamadas } = servidor(CADENA, { cookie: 'PHPSESSID=abc' })
    const r = await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })
    expect(r).toEqual({ ok: true, deeplink: DEEPLINK })

    expect(llamadas.map(l => `${l.method} ${new URL(l.url).pathname}`)).toEqual([
      'GET /app/web/pay.php',
      'POST /app/web/sendMedio.php',
      'POST /app/yape/sendYapeOneShot.php',
      'GET /app/yape/waitYapeOneShot.php',
    ])
    // Los campos ocultos de pay.php viajan a sendMedio, y los de sendMedio a oneshot.
    expect(new URLSearchParams(llamadas[1].body).get('medio')).toBe('170')
    expect(new URLSearchParams(llamadas[2].body).get('paso')).toBe('oneshot')
    // El wait se pide con el UUID que acuñó Flow, no con nuestro token.
    expect(llamadas[3].url).toContain(`token=${UUID}`)
  })

  it('va con User-Agent MÓVIL en todas: con uno de escritorio Flow pide el celular', async () => {
    const { fetchImpl, llamadas } = servidor(CADENA)
    await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })
    for (const l of llamadas) expect(l.headers['User-Agent']).toBe(UA_MOVIL)
  })

  it('devuelve las cookies que Flow deja, desde el segundo viaje en adelante', async () => {
    const { fetchImpl, llamadas } = servidor(CADENA, { cookie: 'PHPSESSID=abc' })
    await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })
    expect(llamadas[0].headers.Cookie).toBeUndefined()
    expect(llamadas[1].headers.Cookie).toBe('PHPSESSID=abc')
    expect(llamadas[3].headers.Cookie).toBe('PHPSESSID=abc')
  })

  it('el origen sale del enlace de pago: sandbox se recorre en sandbox', async () => {
    const { fetchImpl, llamadas } = servidor(CADENA)
    await derivarDeeplinkYape({ payUrl: `https://sandbox.flow.cl/app/web/pay.php?token=${TOKEN}`, fetchImpl })
    for (const l of llamadas) expect(new URL(l.url).origin).toBe('https://sandbox.flow.cl')
  })

  it('si una página ya trae el enlace a la espera, salta directo a ella', async () => {
    const { fetchImpl, llamadas } = servidor({ ...CADENA, '/app/web/sendMedio.php': htmlOneShot })
    const r = await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })
    expect(r.ok).toBe(true)
    expect(llamadas.map(l => new URL(l.url).pathname)).toEqual([
      '/app/web/pay.php', '/app/web/sendMedio.php', '/app/yape/waitYapeOneShot.php',
    ])
  })

  it('si una página ya trae el deepLink, termina ahí', async () => {
    const { fetchImpl, llamadas } = servidor({ ...CADENA, '/app/web/pay.php': htmlWait })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })).toEqual({ ok: true, deeplink: DEEPLINK })
    expect(llamadas).toHaveLength(1)
  })

  it('corta con el nombre de la página cuando Flow cambia el HTML', async () => {
    const sinBoton = servidor({ ...CADENA, '/app/yape/sendYapeOneShot.php': '<p>otra cosa</p>' })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl: sinBoton.fetchImpl }))
      .toEqual({ ok: false, paso: 'sendYapeOneShot.php', motivo: 'sin enlace a waitYapeOneShot' })

    const sinDeeplink = servidor({ ...CADENA, '/app/yape/waitYapeOneShot.php': '<p>esperando…</p>' })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl: sinDeeplink.fetchImpl }))
      .toEqual({ ok: false, paso: 'waitYapeOneShot.php', motivo: 'sin deepLink en la página' })

    const sinForm = servidor({ ...CADENA, '/app/web/pay.php': '<p>sin formulario</p>' })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl: sinForm.fetchImpl }))
      .toEqual({ ok: false, paso: 'pay.php', motivo: 'sin formulario' })
  })

  it('un HTTP que no es 2xx corta con su status y sin seguir', async () => {
    const { fetchImpl, llamadas } = servidor({
      ...CADENA, '/app/web/sendMedio.php': () => new Response('caído', { status: 502 }),
    })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl }))
      .toEqual({ ok: false, paso: 'sendMedio.php', motivo: 'HTTP 502' })
    expect(llamadas).toHaveLength(2)
  })

  it('un fetch que revienta no lanza: devuelve el fallo', async () => {
    const fetchImpl: FetchLike = async () => { throw new TypeError('network') }
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl }))
      .toEqual({ ok: false, paso: 'pay.php', motivo: 'sin respuesta' })
  })

  it('rechaza un deeplink que no sea de Yape, aunque la cadena haya salido entera', async () => {
    const ajeno = htmlWait.replace('www.yape.com.pe', 'www.flow.cl')
    const { fetchImpl } = servidor({ ...CADENA, '/app/yape/waitYapeOneShot.php': ajeno })
    expect(await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl }))
      .toEqual({ ok: false, paso: 'waitYapeOneShot.php', motivo: 'el deeplink no es de yape.com.pe' })
  })

  it('un enlace de pago inválido corta antes de salir a la red', async () => {
    const { fetchImpl, llamadas } = servidor(CADENA)
    expect(await derivarDeeplinkYape({ payUrl: 'no es url', fetchImpl }))
      .toEqual({ ok: false, paso: 'pay.php', motivo: 'enlace de pago inválido' })
    expect(llamadas).toHaveLength(0)
  })

  it('ningún motivo lleva el token ni el UUID: es lo que se anota en api_events', async () => {
    const casos = [
      servidor({ ...CADENA, '/app/yape/sendYapeOneShot.php': '<p></p>' }),
      servidor({ ...CADENA, '/app/yape/waitYapeOneShot.php': () => new Response('x', { status: 500 }) }),
    ]
    for (const { fetchImpl } of casos) {
      const r = await derivarDeeplinkYape({ payUrl: PAY_URL, fetchImpl })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.motivo).not.toContain(TOKEN)
        expect(r.motivo).not.toContain(UUID)
        expect(r.paso).not.toContain(TOKEN)
      }
    }
  })

  it('el presupuesto es uno para la cadena entera y es corto', () => {
    expect(PRESUPUESTO_MS).toBeLessThanOrEqual(10_000)
  })
})
