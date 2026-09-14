// De qué plataforma es cada suscripción de push (§57), y cuándo un aviso cae a
// WhatsApp. Las dos reglas son puras y viven en `_shared`: se prueban acá sin Deno.

import { describe, expect, it } from 'vitest'
import {
  plataformaDePush, plataformaPorUserAgent, servicioPorEndpoint, standaloneDelBody,
} from '../../supabase/functions/_shared/push-plataforma.ts'
import { debeCaerAWhatsApp } from '../../supabase/functions/_shared/respaldo-wa.ts'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/127.0',
}
const EP = {
  apple: 'https://web.push.apple.com/QGxrWm9…',
  fcm: 'https://fcm.googleapis.com/fcm/send/dR3…',
  mozilla: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAA…',
  wns: 'https://wns2-bl2p.notify.windows.com/w/?token=…',
}

describe('plataforma por user-agent', () => {
  it('iPhone e iPad son ios', () => {
    expect(plataformaPorUserAgent(UA.iphone)).toBe('ios')
    expect(plataformaPorUserAgent(UA.ipad)).toBe('ios')
  })
  it('Android es android, aunque diga Linux', () => {
    expect(plataformaPorUserAgent(UA.android)).toBe('android')
  })
  it('Windows, Mac y Linux son desktop', () => {
    expect(plataformaPorUserAgent(UA.windows)).toBe('desktop')
    expect(plataformaPorUserAgent(UA.mac)).toBe('desktop')
    expect(plataformaPorUserAgent(UA.linux)).toBe('desktop')
  })
  it('sin user-agent, otro: no se inventa', () => {
    expect(plataformaPorUserAgent(null)).toBe('otro')
    expect(plataformaPorUserAgent('')).toBe('otro')
    expect(plataformaPorUserAgent('curl/8.0')).toBe('otro')
  })
})

describe('servicio por endpoint', () => {
  it('reconoce los cuatro servicios', () => {
    expect(servicioPorEndpoint(EP.apple)).toBe('apple')
    expect(servicioPorEndpoint(EP.fcm)).toBe('fcm')
    expect(servicioPorEndpoint(EP.mozilla)).toBe('mozilla')
    expect(servicioPorEndpoint(EP.wns)).toBe('wns')
  })
  it('lo demás es otro, incluida una URL rota', () => {
    expect(servicioPorEndpoint('https://push.example.com/x')).toBe('otro')
    expect(servicioPorEndpoint('no es una url')).toBe('otro')
    expect(servicioPorEndpoint(null)).toBe('otro')
  })
})

describe('plataformaDePush · la fila del §57', () => {
  it('iPhone Safari → ios/apple; Android Chrome → android/fcm; Windows Chrome → desktop/fcm', () => {
    expect(plataformaDePush(UA.iphone, EP.apple)).toEqual({ platform: 'ios', push_service: 'apple' })
    expect(plataformaDePush(UA.android, EP.fcm)).toEqual({ platform: 'android', push_service: 'fcm' })
    expect(plataformaDePush(UA.windows, EP.fcm)).toEqual({ platform: 'desktop', push_service: 'fcm' })
  })
  it('el endpoint solo no separa Android de escritorio: por eso hace falta el user-agent', () => {
    expect(plataformaDePush(null, EP.fcm)).toEqual({ platform: 'otro', push_service: 'fcm' })
  })
  it('standalone solo con un booleano de verdad; lo demás es NULL', () => {
    expect(standaloneDelBody(true)).toBe(true)
    expect(standaloneDelBody(false)).toBe(false)
    expect(standaloneDelBody(undefined)).toBeNull()
    expect(standaloneDelBody('true')).toBeNull()
  })
})

describe('debeCaerAWhatsApp · el respaldo lo decide la tienda', () => {
  const lista = { wa_enabled: true, wa_phone_number_id: '1234567890', wa_fallback_enabled: true }
  it('sí: ningún push llegó y la tienda lo encendió con Cloud API configurado', () => {
    expect(debeCaerAWhatsApp(0, lista)).toBe(true)
  })
  it('no si algún push llegó', () => {
    expect(debeCaerAWhatsApp(1, lista)).toBe(false)
  })
  it('no si la tienda no lo encendió, aunque tenga Cloud API', () => {
    expect(debeCaerAWhatsApp(0, { ...lista, wa_fallback_enabled: false })).toBe(false)
    expect(debeCaerAWhatsApp(0, { ...lista, wa_fallback_enabled: null })).toBe(false)
  })
  it('no sin Cloud API, aunque lo haya encendido', () => {
    expect(debeCaerAWhatsApp(0, { ...lista, wa_enabled: false })).toBe(false)
    expect(debeCaerAWhatsApp(0, { ...lista, wa_phone_number_id: '' })).toBe(false)
    expect(debeCaerAWhatsApp(0, { ...lista, wa_phone_number_id: null })).toBe(false)
  })
  it('no sin tienda', () => {
    expect(debeCaerAWhatsApp(0, null)).toBe(false)
    expect(debeCaerAWhatsApp(0, undefined)).toBe(false)
  })
})
