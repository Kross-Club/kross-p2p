// Tests del contrato con 360pay. Lo que se prueba aquí es exactamente lo que no
// se puede probar contra el sandbox desde estas sesiones (dominio bloqueado por
// egress): el desenvuelto del sobre, el armado del deep link de Yape y la
// verificación de firma del webhook.
//
// La prueba que más vale es la del sobre: `success` es del transporte y
// `data.status` es del pago, y confundirlos da pedidos por pagados sin un sol.

import { describe, expect, it } from 'vitest'
import {
  CONSUMER_CODE_MAX, PAY360_HEADERS, SIGNATURE_TOLERANCE_MS, consumerCodeFor, hmacHex,
  isPaid, isValidConsumerCode, pay360BaseUrl, signedPayload, timingSafeEqual, unwrap,
  verifySignature, yapeDeeplink, YAPE_SERVICES_PAY_URL,
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

describe('código de pago (consumerCode)', () => {
  const secret = 'secreto-de-la-tienda'

  it('respeta el formato del partner: prefijo de 3 + total de 14', async () => {
    const code = await consumerCodeFor('TED', secret, 'buyer-1')
    expect(code).toHaveLength(CONSUMER_CODE_MAX)
    expect(code.startsWith('TED')).toBe(true)
    expect(isValidConsumerCode(code)).toBe(true)
  })

  it('el sufijo es solo dígitos', async () => {
    // Los tres ejemplos del partner son numéricos y esto se teclea en un flujo
    // bancario: letras se agregan si se confirma que las aceptan, no antes.
    const code = await consumerCodeFor('TED', secret, 'buyer-1')
    expect(code.slice(3)).toMatch(/^\d{11}$/)
  })

  it('es ESTABLE por comprador — el que vuelve cae en el mismo cliente', async () => {
    const a = await consumerCodeFor('TED', secret, 'buyer-1')
    const b = await consumerCodeFor('TED', secret, 'buyer-1')
    expect(a).toBe(b)
  })

  it('distintos compradores dan códigos distintos', async () => {
    const a = await consumerCodeFor('TED', secret, 'buyer-1')
    const b = await consumerCodeFor('TED', secret, 'buyer-2')
    expect(a).not.toBe(b)
  })

  it('no es adivinable desde el celular del comprador', async () => {
    // Quien teclea un código en Yape ve los cupones pendientes de ese cliente.
    // Si el código fuera `prefijo + celular`, adivinar cuánto debe alguien sería
    // saber su número. Con otro secreto, el mismo comprador da otro código.
    const phone = '987654321'
    const code = await consumerCodeFor('TED', secret, phone)
    expect(code).not.toContain(phone)
    expect(await consumerCodeFor('TED', 'otro-secreto', phone)).not.toBe(code)
  })

  it('normaliza el prefijo y rechaza el que no mide 3', async () => {
    expect(await consumerCodeFor('ted', secret, 'b')).toMatch(/^TED/)
    await expect(consumerCodeFor('TE', secret, 'b')).rejects.toThrow()
    await expect(consumerCodeFor('', secret, 'b')).rejects.toThrow()
  })

  it('acepta las tres longitudes de ejemplo del partner', () => {
    expect(isValidConsumerCode('TED1234')).toBe(true)
    expect(isValidConsumerCode('TED46558912')).toBe(true)
    expect(isValidConsumerCode('TED19478876653')).toBe(true)
    expect(isValidConsumerCode('TED194788766531')).toBe(false)  // 15
    expect(isValidConsumerCode('TED-1234')).toBe(false)
  })
})

describe('firma del webhook', () => {
  const secret = 'whsec_VsLSN43xjcHqk4UoW6Fv5P8v3v8YGxQ2pLkV9fR8y1A'
  const body = '{"type":"PAYMENT_PAID","data":{"external_ref":"ORD-9988"}}'
  const now = Date.parse('2026-08-18T22:00:00.000Z')
  const ts = '2026-08-18T21:59:50.000Z'
  const sign = (b = body, t = ts) => hmacHex(secret, signedPayload(t, b))

  it('acepta la firma correcta', async () => {
    const r = await verifySignature(secret, body, { signature: await sign(), timestamp: ts }, now)
    expect(r.ok).toBe(true)
  })

  it('acepta el formato documentado sha256=<hex>', async () => {
    const r = await verifySignature(secret, body,
      { signature: `sha256=${(await sign()).toUpperCase()}`, timestamp: ts }, now)
    expect(r.ok).toBe(true)
  })

  it('la fecha entra en la firma: cambiarla la invalida', async () => {
    // Si se firmara solo el body, el timestamp quedaría sin proteger y se
    // podría re-fechar un evento capturado para que nunca venza.
    const r = await verifySignature(secret, body,
      { signature: await sign(), timestamp: '2026-08-18T21:59:51.000Z' }, now)
    expect(r).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rechaza si el body cambió aunque sea un byte', async () => {
    const r = await verifySignature(secret, `${body} `, { signature: await sign(), timestamp: ts }, now)
    expect(r.ok).toBe(false)
  })

  it('rechaza eventos viejos (replay)', async () => {
    const old = new Date(now - SIGNATURE_TOLERANCE_MS - 1000).toISOString()
    const r = await verifySignature(secret, body, { signature: await sign(body, old), timestamp: old }, now)
    expect(r).toEqual({ ok: false, reason: 'stale' })
  })

  it('rechaza eventos del futuro', async () => {
    const ahead = new Date(now + SIGNATURE_TOLERANCE_MS + 1000).toISOString()
    const r = await verifySignature(secret, body, { signature: await sign(body, ahead), timestamp: ahead }, now)
    expect(r).toEqual({ ok: false, reason: 'stale' })
  })

  it('rechaza secreto, firma o fecha ausentes, y formatos inválidos', async () => {
    const sig = await sign()
    expect((await verifySignature('', body, { signature: sig, timestamp: ts }, now)).reason).toBe('no_secret')
    expect((await verifySignature(secret, body, { signature: null, timestamp: ts }, now)).reason).toBe('no_signature')
    expect((await verifySignature(secret, body, { signature: sig, timestamp: null }, now)).reason).toBe('no_timestamp')
    expect((await verifySignature(secret, body, { signature: 'no-hex', timestamp: ts }, now)).reason).toBe('bad_format')
    expect((await verifySignature(secret, body, { signature: sig, timestamp: 'ayer' }, now)).reason).toBe('no_timestamp')
  })

  it('rechaza con otro secreto', async () => {
    const otra = await hmacHex('otro', signedPayload(ts, body))
    expect((await verifySignature(secret, body, { signature: otra, timestamp: ts }, now)).reason).toBe('mismatch')
  })

  it('la comparación no corta al primer byte distinto', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'ab')).toBe(false)
  })

  it('la idempotencia va por Event-Id, no por Delivery-Id', () => {
    // Delivery-Id cambia en cada reintento: deduplicar por él no deduplica
    // nada, y el mismo pago entraría tantas veces como intentos haga 360pay.
    expect(PAY360_HEADERS.eventId).toBe('X-360Pay-Event-Id')
    expect(PAY360_HEADERS.deliveryId).toBe('X-360Pay-Delivery-Id')
    expect(PAY360_HEADERS.eventId).not.toBe(PAY360_HEADERS.deliveryId)
  })
})
