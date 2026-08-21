// ─── yapeHref: el intent de Android y cuándo NO tocar el enlace ──────────────
// El bug que este módulo corrige: desde la PWA instalada, el universal link
// abría la página WEB de Yape y no la app (la URL inicial de una Custom Tab no
// resuelve App Links). En Android el href pasa a ser un `intent://` con el
// package de Yape; en todo lo demás el enlace del servidor queda intacto.

import { describe, expect, it } from 'vitest'
import { isAndroid, yapeHref, YAPE_ANDROID_PACKAGE } from './yape-link'

const DEEPLINK = 'https://www.yape.com.pe/app/services-pay/pickService'
  + '?companyId=1E6B58C0-32C5-4575-B1B4-FA1AAECD5EBB'
  + '&serviceId=A274CCCE-B6ED-48C8-8E61-D1D2D383C87E'
  + '&consumerCode=KSH99751348700'
  + '&origin=deeplink-externo&origin_detail=tercero-web'
  + '&name=360Pay&logo=https%3A%2F%2Fstaceu2yapefrntp10.blob.core.windows.net%2F%24web%2Fbill-payment%2Fcompanies%2F360pay%2F360pay.png'

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('isAndroid', () => {
  it('distingue Android de iOS y desktop', () => {
    expect(isAndroid(UA_ANDROID)).toBe(true)
    expect(isAndroid(UA_IPHONE)).toBe(false)
    expect(isAndroid(UA_DESKTOP)).toBe(false)
  })
})

describe('yapeHref en Android', () => {
  const href = yapeHref(DEEPLINK, UA_ANDROID)

  it('es un intent:// apuntado al package de Yape', () => {
    expect(href.startsWith('intent://www.yape.com.pe/app/services-pay/pickService?')).toBe(true)
    expect(href).toContain(`;package=${YAPE_ANDROID_PACKAGE}`)
    expect(href).toContain(';scheme=https')
    expect(href.endsWith(';end')).toBe(true)
  })

  it('conserva la query del servidor byte a byte', () => {
    // El `consumerCode` es lo único que hace que el pago caiga en NUESTRO
    // cupón: la conversión no puede tocar ni un parámetro.
    const query = new URL(DEEPLINK).search
    expect(href).toContain(query)
  })

  it('el fallback es el universal link original, URL-encoded', () => {
    expect(href).toContain(`;S.browser_fallback_url=${encodeURIComponent(DEEPLINK)}`)
  })

  it('la parte intent no lleva `;` sueltos que rompan el parseo', () => {
    // La query viene de URLSearchParams (el `;` sale percent-encoded) y el
    // fallback va por encodeURIComponent: los únicos `;` del href son los
    // separadores del fragmento #Intent.
    const [uri, fragment] = href.split('#')
    expect(uri).not.toContain(';')
    expect(fragment.split(';')).toEqual([
      'Intent',
      'scheme=https',
      `package=${YAPE_ANDROID_PACKAGE}`,
      `S.browser_fallback_url=${encodeURIComponent(DEEPLINK)}`,
      'end',
    ])
  })
})

describe('yapeHref fuera de Android', () => {
  it('en iOS el universal link queda intacto', () => {
    expect(yapeHref(DEEPLINK, UA_IPHONE)).toBe(DEEPLINK)
  })

  it('en desktop queda intacto', () => {
    expect(yapeHref(DEEPLINK, UA_DESKTOP)).toBe(DEEPLINK)
  })
})

describe('yapeHref ante enlaces inesperados', () => {
  // Ante la duda se devuelve el enlace del servidor sin tocar: la web de Yape
  // degrada a "teclea el código", un intent mal armado no lleva a ningún lado.
  it('no convierte un enlace que no sea https', () => {
    expect(yapeHref('http://www.yape.com.pe/app/x', UA_ANDROID)).toBe('http://www.yape.com.pe/app/x')
  })

  it('no convierte algo que no parsea como URL', () => {
    expect(yapeHref('no-es-una-url', UA_ANDROID)).toBe('no-es-una-url')
  })
})
