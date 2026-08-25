import { describe, it, expect } from 'vitest'
import { parseAttribution } from './attribution'

describe('parseAttribution', () => {
  it('lee las cookies del pixel', () => {
    const a = parseAttribution({
      cookieString: '_fbp=fb.1.100.abc; _fbc=fb.1.200.def; _ttp=ttpval; other=x',
    })
    expect(a.fbp).toBe('fb.1.100.abc')
    expect(a.fbc).toBe('fb.1.200.def')
    expect(a.ttp).toBe('ttpval')
  })

  it('sintetiza _fbc desde fbclid cuando la cookie aún no existe', () => {
    const a = parseAttribution({ search: '?fbclid=CLICK123', nowMs: 1000 })
    expect(a.fbc).toBe('fb.1.1000.CLICK123')
  })

  it('la cookie _fbc gana sobre el fbclid de la URL', () => {
    const a = parseAttribution({
      cookieString: '_fbc=fb.1.9.cookiewins',
      search: '?fbclid=CLICK123',
      nowMs: 1000,
    })
    expect(a.fbc).toBe('fb.1.9.cookiewins')
  })

  it('captura ttclid de la URL', () => {
    const a = parseAttribution({ search: '?ttclid=TT-999&foo=bar' })
    expect(a.ttclid).toBe('TT-999')
  })

  it('pasa sourceUrl y userAgent', () => {
    const a = parseAttribution({ url: 'https://marca.app/p/1?fbclid=x', userAgent: 'UA/1.0' })
    expect(a.sourceUrl).toBe('https://marca.app/p/1?fbclid=x')
    expect(a.userAgent).toBe('UA/1.0')
  })

  it('sin nada de entrada → todo null', () => {
    const a = parseAttribution({})
    expect(a).toEqual({ fbp: null, fbc: null, ttp: null, ttclid: null, sourceUrl: null, userAgent: null })
  })

  it('tolera espacios y valores con = dentro de la cookie', () => {
    const a = parseAttribution({ cookieString: '  _fbp = fb.1.1.a=b ; _ttp=t ' })
    expect(a.fbp).toBe('fb.1.1.a=b')
    expect(a.ttp).toBe('t')
  })
})
