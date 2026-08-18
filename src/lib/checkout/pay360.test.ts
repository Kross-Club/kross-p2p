// Tests del contrato con 360pay. Lo que se prueba aquí es exactamente lo que no
// se puede probar contra el sandbox desde estas sesiones (dominio bloqueado por
// egress): el desenvuelto del sobre, el armado del deep link de Yape y la
// verificación de firma del webhook.
//
// La prueba que más vale es la del sobre: `success` es del transporte y
// `data.status` es del pago, y confundirlos da pedidos por pagados sin un sol.

import { describe, expect, it } from 'vitest'
import {
  isPaid, pay360BaseUrl, signBody, timingSafeEqual, unwrap, verifySignature,
  yapeDeeplink, YAPE_SERVICES_PAY_URL,
} from '../../../supabase/functions/_shared/pay360.ts'

describe('bases por ambiente', () => {
  it('separa sandbox por HOST, no por prefijo de ruta', () => {
    expect(pay360BaseUrl('live', 'public')).toBe('https://api.360pay.pe/v1')
    expect(pay360BaseUrl('sandbox', 'public')).toBe('https://sandbox.api.360pay.pe/v1')
    expect(pay360BaseUrl('live', 'partner')).toBe('https://api.360pay.pe/partners/v1')
    expect(pay360BaseUrl('sandbox', 'partner')).toBe('https://sandbox.api.360pay.pe/partners/v1')
  })
})

describe('sobre { success, data, message }', () => {
  it('desenvuelve el éxito', () => {
    const r = unwrap<{ _id: string }>(201, { success: true, data: { _id: 'abc' }, message: 'ok' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data._id).toBe('abc')
  })

  it('un 2xx con success:false NO es éxito', () => {
    const r = unwrap(200, { success: false, error: 'Cupon no encontrado' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Cupon no encontrado')
  })

  it('rescata required_scopes del 403 para poder decir QUÉ falta', () => {
    const r = unwrap(403, { success: false, error: 'Scope insuficiente', required_scopes: ['coupons:write'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.requiredScopes).toEqual(['coupons:write'])
  })

  it('un éxito sin data es error de contrato, no un dato vacío', () => {
    // Un cupón sin `_id` no es un cupón: darlo por bueno deja al pedido sin
    // referencia con la que cobrar ni con la que conciliar.
    expect(unwrap(201, { success: true }).ok).toBe(false)
    expect(unwrap(201, { success: true, data: null }).ok).toBe(false)
  })

  it('un cuerpo no-JSON no revienta', () => {
    expect(unwrap(502, null).ok).toBe(false)
    expect(unwrap(502, 'gateway timeout').ok).toBe(false)
  })
})

describe('estado del pago', () => {
  it('solo `paid` cuenta como pagado', () => {
    expect(isPaid({ status: 'paid' })).toBe(true)
    expect(isPaid({ status: 'PAID' })).toBe(true)
    expect(isPaid({ status: 'active' })).toBe(false)
    expect(isPaid({ status: 'voided' })).toBe(false)
    expect(isPaid({})).toBe(false)
  })
})

describe('deep link de Yape', () => {
  const link = yapeDeeplink({
    companyId: '1E6B58C0-32C5-4575-B1B4-FA1AAECD5EBB',
    serviceId: 'A274CCCE-B6ED-48C8-8E61-D1D2D383C87E',
    consumerCode: 'LSV55555555',
    name: '360Pay',
  })

  it('apunta al pago de servicios de Yape', () => {
    expect(link.startsWith(`${YAPE_SERVICES_PAY_URL}?`)).toBe(true)
  })

  it('lleva los tres identificadores que Yape necesita', () => {
    const q = new URL(link).searchParams
    expect(q.get('companyId')).toBe('1E6B58C0-32C5-4575-B1B4-FA1AAECD5EBB')
    expect(q.get('serviceId')).toBe('A274CCCE-B6ED-48C8-8E61-D1D2D383C87E')
    expect(q.get('consumerCode')).toBe('LSV55555555')
  })

  it('NO lleva el monto — lo resuelve Yape del cupón', () => {
    // Es la propiedad de seguridad del flujo: si el monto viajara en la URL,
    // cualquiera pagaría S/1 un adelanto de S/25 editando el enlace.
    const q = new URL(link).searchParams
    expect(q.get('amount')).toBeNull()
    expect(link.toLowerCase()).not.toContain('amount')
  })

  it('escapa el código en vez de romper la URL', () => {
    const raw = yapeDeeplink({ companyId: 'c', serviceId: 's', consumerCode: 'AB C&d=1' })
    expect(new URL(raw).searchParams.get('consumerCode')).toBe('AB C&d=1')
  })
})

describe('firma del webhook', () => {
  const secret = 'whsec_VsLSN43xjcHqk4UoW6Fv5P8v3v8YGxQ2pLkV9fR8y1A'
  const body = '{"type":"PAYMENT_PAID","data":{"external_ref":"ORD-9988"}}'

  it('acepta la firma correcta del body crudo', async () => {
    const sig = await signBody(secret, body)
    expect(await verifySignature(secret, body, sig)).toBe(true)
  })

  it('tolera el prefijo sha256= y las mayúsculas', async () => {
    const sig = await signBody(secret, body)
    expect(await verifySignature(secret, body, `sha256=${sig.toUpperCase()}`)).toBe(true)
  })

  it('rechaza si el body cambió aunque sea un byte', async () => {
    const sig = await signBody(secret, body)
    expect(await verifySignature(secret, `${body} `, sig)).toBe(false)
  })

  it('rechaza con otro secreto', async () => {
    const sig = await signBody('otro-secreto', body)
    expect(await verifySignature(secret, body, sig)).toBe(false)
  })

  it('rechaza firma ausente, vacía o con forma inválida', async () => {
    expect(await verifySignature(secret, body, null)).toBe(false)
    expect(await verifySignature(secret, body, '')).toBe(false)
    expect(await verifySignature(secret, body, 'no-es-hex')).toBe(false)
    expect(await verifySignature('', body, await signBody(secret, body))).toBe(false)
  })

  it('la comparación no corta al primer byte distinto', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'ab')).toBe(false)
  })
})
