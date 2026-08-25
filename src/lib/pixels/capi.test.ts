import { describe, it, expect } from 'vitest'
// Se importa el módulo de la Edge Function por ruta relativa: no usa APIs
// exclusivas de Deno (Web Crypto existe también en Node), así corre bajo Vitest.
import {
  sha256Hex, hashNormalized, normalizePhonePE, hashPhonePE,
  buildMetaEvent, buildTiktokEvent, META_EVENT, TIKTOK_EVENT,
} from '../../../supabase/functions/_shared/capi'

describe('capi · hashing de PII', () => {
  it('SHA-256 con vectores conocidos', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  })

  it('hashNormalized baja a minúsculas y recorta; vacío → null', async () => {
    expect(await hashNormalized('  ABC ')).toBe(await sha256Hex('abc'))
    expect(await hashNormalized('')).toBeNull()
    expect(await hashNormalized(null)).toBeNull()
    expect(await hashNormalized(undefined)).toBeNull()
  })
})

describe('capi · normalización de teléfono PE', () => {
  it('lleva a E.164 en dígitos con prefijo 51', () => {
    expect(normalizePhonePE('999888777')).toBe('51999888777')
    expect(normalizePhonePE('999 888 777')).toBe('51999888777')
    expect(normalizePhonePE('+51 999-888-777')).toBe('51999888777')
    expect(normalizePhonePE('0051999888777')).toBe('51999888777')
    expect(normalizePhonePE('51999888777')).toBe('51999888777')
  })

  it('sin dígitos → null', () => {
    expect(normalizePhonePE('')).toBeNull()
    expect(normalizePhonePE(null)).toBeNull()
    expect(normalizePhonePE('abc')).toBeNull()
  })

  it('hashPhonePE hashea el número YA normalizado', async () => {
    expect(await hashPhonePE('999-888-777')).toBe(await sha256Hex('51999888777'))
    expect(await hashPhonePE('')).toBeNull()
  })
})

// Formas laxas solo para leer el evento en las aserciones (los builders
// devuelven Record<string, unknown>): evitan `any` sin re-declarar toda la API.
type MetaEv = {
  event_name: string; event_time: number; event_id: string; action_source: string
  event_source_url?: string; user_data: Record<string, unknown>; custom_data: Record<string, unknown>
}
type TtEv = {
  event: string; event_time: number; event_id: string
  user: Record<string, unknown>; properties: Record<string, unknown>; page?: { url: string }
}

const baseInput = {
  eventId: 'evt-123',
  eventTimeMs: 1_700_000_000_000,
  sourceUrl: 'https://marca.krossclub.app/p/abc',
  value: 50,
  contentId: 'prod-9',
  custom: { order_value: 100 },
  user: {
    phone: '999 888 777',
    fullName: 'Juan Perez Gomez',
    externalId: 'buyer-uuid',
    fbp: 'fb.1.1.fbp',
    fbc: 'fb.1.2.fbc',
    ttp: 'ttpval',
    ttclid: 'ttclid-xyz',
    clientIp: '1.2.3.4',
    clientUserAgent: 'Mozilla/5.0',
  },
}

describe('capi · buildMetaEvent', () => {
  it('arma el evento de la Conversions API con la PII hasheada', async () => {
    const ev = await buildMetaEvent('PURCHASE', baseInput) as unknown as MetaEv
    expect(ev.event_name).toBe('Purchase')
    expect(ev.event_id).toBe('evt-123')
    expect(ev.event_time).toBe(1_700_000_000) // ms → s
    expect(ev.action_source).toBe('website')
    expect(ev.event_source_url).toBe('https://marca.krossclub.app/p/abc')
    // PII hasheada (array de un hash), nunca cruda
    expect(ev.user_data.ph).toEqual([await sha256Hex('51999888777')])
    expect(ev.user_data.fn).toEqual([await sha256Hex('juan')])
    expect(ev.user_data.ln).toEqual([await sha256Hex('perez gomez')])
    expect(ev.user_data.external_id).toEqual([await sha256Hex('buyer-uuid')])
    // Identificadores del clic: sin hashear
    expect(ev.user_data.fbp).toBe('fb.1.1.fbp')
    expect(ev.user_data.fbc).toBe('fb.1.2.fbc')
    expect(ev.user_data.client_ip_address).toBe('1.2.3.4')
    expect(ev.user_data.client_user_agent).toBe('Mozilla/5.0')
    // Valor: el adelanto pagado + propiedad extra del total
    expect(ev.custom_data.currency).toBe('PEN')
    expect(ev.custom_data.value).toBe(50)
    expect(ev.custom_data.order_value).toBe(100)
    expect(ev.custom_data.contents).toEqual([{ id: 'prod-9', quantity: 1 }])
  })

  it('nunca serializa la PII en crudo', async () => {
    const raw = JSON.stringify(await buildMetaEvent('LEAD', baseInput))
    expect(raw).not.toContain('999888777')
    expect(raw).not.toContain('51999888777')
    expect(raw).not.toContain('Juan')
    expect(raw).not.toContain('juan') // solo el hash, jamás el nombre
    expect(raw).not.toContain('buyer-uuid')
  })
})

describe('capi · buildTiktokEvent', () => {
  it('arma el evento de la Events API v1.3 con la PII hasheada', async () => {
    const ev = await buildTiktokEvent('PURCHASE', baseInput) as unknown as TtEv
    expect(ev.event).toBe('CompletePayment')
    expect(ev.event_id).toBe('evt-123')
    expect(ev.event_time).toBe(1_700_000_000)
    expect(ev.user.phone).toBe(await sha256Hex('51999888777'))
    expect(ev.user.external_id).toBe(await sha256Hex('buyer-uuid'))
    expect(ev.user.ttp).toBe('ttpval')
    expect(ev.user.ttclid).toBe('ttclid-xyz')
    expect(ev.user.ip).toBe('1.2.3.4')
    expect(ev.user.user_agent).toBe('Mozilla/5.0')
    expect(ev.properties.currency).toBe('PEN')
    expect(ev.properties.value).toBe(50)
    expect(ev.properties.contents).toEqual([{ content_id: 'prod-9', content_type: 'product', quantity: 1 }])
    expect(ev.page).toEqual({ url: 'https://marca.krossclub.app/p/abc' })
  })
})

describe('capi · mapeo de nombres', () => {
  it('cada concepto tiene su nombre por plataforma', () => {
    expect(META_EVENT.PURCHASE).toBe('Purchase')
    expect(META_EVENT.LEAD).toBe('Lead')
    expect(TIKTOK_EVENT.PURCHASE).toBe('CompletePayment')
    expect(TIKTOK_EVENT.LEAD).toBe('CompleteRegistration')
  })
})
