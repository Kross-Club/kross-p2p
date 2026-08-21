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
  COUPON_TTL_DAYS, couponExpiryFrom, isPaid, isValidConsumerCode, pay360BaseUrl, paymentUrlOf, pickPartnerKey, signedPayload, timingSafeEqual, unwrap,
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

describe('alta de negocio (respuesta real del sandbox, 18-ago-2026)', () => {
  // Fijado contra la respuesta REAL de POST /partners/v1/businesses. Viene con
  // DOBLE sobre —`{success, data:{success, business_id…}}`— y es la forma que
  // `unwrap` tiene que dejar utilizable.
  const real = {
    success: true,
    data: {
      success: true,
      business_id: '6a84e5c6b254ddaacd1441a2',
      payment_prefix: 'KRS',
      config_id: '6a84e5c6b254ddaacd1441a3',
      hook_ids: ['6a84e5c6b254ddaacd1441a4'],
      hook_signing_secrets: [{ hook_id: '6a84e5c6b254ddaacd1441a4', signing_secret: 'whsec_REDACTADO' }],
    },
    message: 'Business created and linked to partner successfully',
  }

  it('el sobre de afuera se quita y queda el negocio', () => {
    const r = unwrap<typeof real.data>(201, real)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.business_id).toBe('6a84e5c6b254ddaacd1441a2')
    expect(r.data.payment_prefix).toBe('KRS')
    expect(r.data.hook_signing_secrets?.[0].hook_id).toBe(r.data.hook_ids[0])
  })

  it('el prefijo que devuelve es el que arma el código de pago', async () => {
    const r = unwrap<typeof real.data>(201, real)
    if (!r.ok) throw new Error('unwrap falló')
    const code = await consumerCodeFor(r.data.payment_prefix, 'secreto', 'buyer-1')
    expect(code.startsWith('KRS')).toBe(true)
    expect(isValidConsumerCode(code)).toBe(true)
  })

  it('la respuesta NO trae company_id ni service_id', () => {
    // Documentado como hallazgo, no como supuesto: el partner dijo que salían
    // al crear el negocio y no vinieron. Por eso el deep link los resuelve con
    // override por tienda sobre un default de plataforma.
    expect('company_id' in real.data).toBe(false)
    expect('service_id' in real.data).toBe(false)
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

describe('enlace de pago del cupón', () => {
  it('prefiere el enlace que mande 360pay', () => {
    expect(paymentUrlOf({ _id: 'c1', payment_url: 'https://pay.360pay.pe/abc' }))
      .toBe('https://pay.360pay.pe/abc')
    expect(paymentUrlOf({ _id: 'c1', deeplink: 'https://www.yape.com.pe/app/x' }))
      .toBe('https://www.yape.com.pe/app/x')
  })

  it('si no viene ninguno, devuelve null y el caller arma el suyo', () => {
    expect(paymentUrlOf({ _id: 'c1', amount: 5, status: 'active' })).toBeNull()
  })

  it('ignora valores que no son URL https', () => {
    // Un `payment_url` vacío o relativo no es un enlace: dárselo al botón lo
    // deja muerto justo en el paso del cobro.
    expect(paymentUrlOf({ payment_url: '' })).toBeNull()
    expect(paymentUrlOf({ payment_url: '/pagar' })).toBeNull()
    expect(paymentUrlOf({ payment_url: 'http://inseguro.pe/x' })).toBeNull()
  })
})

describe('firma del webhook', () => {
  const secret = 'whsec_VsLSN43xjcHqk4UoW6Fv5P8v3v8YGxQ2pLkV9fR8y1A'
  const body = '{"type":"PAYMENT_PAID","data":{"external_ref":"ORD-9988"}}'
  const now = Date.parse('2026-08-18T22:00:00.000Z')
  const ts = '2026-08-18T21:59:50.000Z'
  const sign = (b = body, t = ts) => hmacHex(secret, signedPayload(t, b))

  it('la cadena firmada es exactamente `timestamp + "." + body`', () => {
    // Fijado contra el ejemplo oficial de /docs/webhooks:
    //   createHmac('sha256', secret).update(timestamp + '.' + rawBody)
    // Cualquier otro separador rechazaría TODOS los eventos legítimos, y sin
    // ruido: el webhook no falla, simplemente no confirma ningún pago.
    expect(signedPayload('2026-08-18T21:59:50.000Z', '{"a":1}'))
      .toBe('2026-08-18T21:59:50.000Z.{"a":1}')
  })

  it('la ventana de replay es la misma que usa su ejemplo (5 min)', () => {
    expect(SIGNATURE_TOLERANCE_MS).toBe(5 * 60 * 1000)
  })

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

// ─── Máquina de fases del cobro con cupón ────────────────────────────────────
// La rama de 360pay NO es simétrica a la de Culqi: con Culqi el cobro ocurre
// dentro de la llamada, con 360pay se emite y se espera. Lo que se prueba aquí
// es que esa espera no se pueda confundir con un cobro en duda, y que ninguna
// transición mande al comprador a pagar dos veces.

import { orderRegistered, payPhaseReducer } from './pay-phase'
import type { CouponRef, PayPhase } from './pay-phase'
import { pay360ActiveFor } from './checkout.config'
import { validateStep } from './validation'
import { initialCheckoutState } from './machine'
import type { CheckoutState } from './types'
import type { StorePay360 } from './types'

const ref = { token: 't', orderCode: 'ORD-1', sessionId: 's1' }
const cupon: CouponRef = { deeplink: 'https://www.yape.com.pe/app/…', consumerCode: 'KRS12345678901', amountPen: 5 }
const run = (start: PayPhase, ...evs: Parameters<typeof payPhaseReducer>[1][]) =>
  evs.reduce(payPhaseReducer, start)

describe('fases del cobro con 360pay', () => {
  it('el camino feliz: emitir → esperar → pagado', () => {
    const p = run({ k: 'IDLE' },
      { type: 'REGISTERED_PAY360', ...ref },
      { type: 'COUPON_ISSUED', coupon: cupon },
      { type: 'PAID' })
    expect(p.k).toBe('DONE')
    if (p.k === 'DONE') expect(p.paid).toBe(true)
  })

  it('AWAITING lleva el enlace y el código de respaldo', () => {
    const p = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'COUPON_ISSUED', coupon: cupon })
    expect(p.k).toBe('AWAITING')
    if (p.k === 'AWAITING') expect(p.coupon.consumerCode).toBe('KRS12345678901')
  })

  it('esperar el pago NO es lo mismo que un cobro en duda', () => {
    // CONFIRMING significa "el dinero pudo salir y hay que averiguar"; AWAITING
    // significa "todavía no paga". Reusar CONFIRMING haría que un pedido recién
    // emitido se leyera como un cobro dudoso.
    const p = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'COUPON_ISSUED', coupon: cupon })
    expect(p.k).not.toBe('CONFIRMING')
  })

  it('desde AWAITING no se puede re-emitir: el cupón está vivo', () => {
    const awaiting = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'COUPON_ISSUED', coupon: cupon })
    expect(payPhaseReducer(awaiting, { type: 'RETRY' })).toEqual(awaiting)
  })

  it('un cupón que llega tarde no pisa el estado', () => {
    // Respuesta atrasada de un intento anterior: pintar su enlace mandaría al
    // comprador a pagar un cupón que ya se anuló.
    const done = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref },
      { type: 'COUPON_ISSUED', coupon: cupon }, { type: 'PAID' })
    expect(payPhaseReducer(done, { type: 'COUPON_ISSUED', coupon: cupon })).toEqual(done)
  })

  it('el fallo al emitir sí se puede reintentar', () => {
    const failed = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'ISSUE_FAILED' })
    expect(failed.k).toBe('ISSUE_FAILED')
    expect(payPhaseReducer(failed, { type: 'RETRY' }).k).toBe('ISSUING')
  })

  it('si pagó mientras reintentaba, gana el pago', () => {
    // Decirle "falló" a quien ya pagó es el peor final posible.
    const failed = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'ISSUE_FAILED' })
    const p = payPhaseReducer(failed, { type: 'PAID' })
    expect(p.k).toBe('DONE')
    if (p.k === 'DONE') expect(p.paid).toBe(true)
  })

  it('"prefiero que me escriban" sale desde la espera', () => {
    const awaiting = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref }, { type: 'COUPON_ISSUED', coupon: cupon })
    const p = payPhaseReducer(awaiting, { type: 'GIVE_UP' })
    expect(p.k).toBe('DONE')
    if (p.k === 'DONE') expect(p.unpaid).toBe(true)
  })

  it('emitido = pedido ya registrado: cerrar no es abandonar un carrito', () => {
    const issuing = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref })
    expect(orderRegistered(issuing)).toBe(true)
  })

  it('no se puede emitir dos veces desde IDLE ni saltarse el registro', () => {
    const issuing = run({ k: 'IDLE' }, { type: 'REGISTERED_PAY360', ...ref })
    expect(payPhaseReducer(issuing, { type: 'REGISTERED_PAY360', ...ref })).toEqual(issuing)
    expect(payPhaseReducer({ k: 'IDLE' }, { type: 'COUPON_ISSUED', coupon: cupon })).toEqual({ k: 'IDLE' })
  })

  it('la rama de Culqi queda intacta', () => {
    const p = run({ k: 'IDLE' }, { type: 'REGISTERED_CULQI', ...ref }, { type: 'CHARGE_OK' })
    expect(p.k).toBe('DONE')
    if (p.k === 'DONE') expect(p.paid).toBe(true)
  })
})

describe('payload real del evento PAYMENT_PAID', () => {
  // Del ejemplo oficial. Va PLANO, sin envoltorio `data` — pero el hook admite
  // `payload_mapping`, así que el handler tiene que aguantar las dos formas.
  const evento = {
    event: 'ticket.paid',
    _id: '64b1f...',
    external_ref: 'ORD-9988',
    payment_reference: 'A1B2C3D4E5F6G7',
    amount: 150.5,
    status: 'paid',
    paid_at: '2026-05-30T12:30:00.000Z',
    operation_number: 'OP-12345',
    bank_tx_id: 'BCP-1234567',
  }

  it('el estado se lee con isPaid, no del nombre del evento', () => {
    // `event` dice "ticket.paid" (nomenclatura legacy) mientras el hook es
    // PAYMENT_PAID: atarse al nombre del evento es atarse a un alias.
    expect(isPaid(evento)).toBe(true)
    expect(isPaid({ ...evento, status: 'active' })).toBe(false)
  })

  it('el monto viene en soles con decimales, no en céntimos', () => {
    expect(evento.amount).toBe(150.5)
    expect(Number.isInteger(evento.amount)).toBe(false)
  })
})

describe('¿aplica 360pay a este pedido?', () => {
  const ON: StorePay360 = { enabled: true }

  it('sin destino no hay monto, y sin monto no hay cobro', () => {
    expect(pay360ActiveFor({ pay360: ON, locationType: null, advanceAmount: 5 })).toBe(false)
    expect(pay360ActiveFor({ pay360: ON, locationType: 'LIMA', advanceAmount: 0 })).toBe(false)
  })

  it('aplica en Lima y en provincia por igual', () => {
    // Sin `scope` por región, al revés que Culqi: el de Culqi es un repliegue
    // ante un cobro que puede costar conversión. Acá el comprador toca un botón
    // y Yape abre, así que no hay amenaza que acotar.
    expect(pay360ActiveFor({ pay360: ON, locationType: 'LIMA', advanceAmount: 6 })).toBe(true)
    expect(pay360ActiveFor({ pay360: ON, locationType: 'PROVINCIA', advanceAmount: 20 })).toBe(true)
  })

  it('apagado o sin config, no cobra', () => {
    expect(pay360ActiveFor({ pay360: null, locationType: 'LIMA', advanceAmount: 5 })).toBe(false)
    expect(pay360ActiveFor({ pay360: { enabled: false }, locationType: 'LIMA', advanceAmount: 5 })).toBe(false)
  })
})


describe('llave de partner por ambiente', () => {
  it('sandbox usa la de sandbox aunque exista la de producción', () => {
    expect(pickPartnerKey('sandbox', 'pt_sandbox', 'pt_prod')).toBe('pt_sandbox')
  })

  it('live usa la de producción', () => {
    expect(pickPartnerKey('live', 'pt_sandbox', 'pt_prod')).toBe('pt_prod')
  })

  it('live cae a la de sandbox solo si no hay una propia', () => {
    // 360pay podría usar la misma para ambos: el pt_live_ de partner ya
    // funcionó contra sandbox.
    expect(pickPartnerKey('live', 'pt_unica', '')).toBe('pt_unica')
  })
})

describe('higiene de la llave de partner', () => {
  it('recorta espacios: un secreto con espacio al final da 401', () => {
    // Se ve idéntico a "llave inválida" y manda a buscar donde no es.
    expect(pickPartnerKey('sandbox', '  pt_live_abc \n', '')).toBe('pt_live_abc')
    expect(pickPartnerKey('live', '', ' pt_prod ')).toBe('pt_prod')
  })

  it('una llave que es solo espacios cuenta como ausente', () => {
    expect(pickPartnerKey('live', 'pt_sandbox', '   ')).toBe('pt_sandbox')
    expect(pickPartnerKey('sandbox', '   ', '')).toBe('')
  })
})

describe('el paso 3 con 360pay no pide nada', () => {
  // Con 360pay el comprador toca "Terminar mi pedido" y RECIÉN ahí aparece el
  // botón que abre Yape. Pedirle antes el código de seguridad de 3 dígitos es
  // pedirle la prueba de un pago que todavía no hizo — y era lo que dejaba el
  // CTA bloqueado con "completa los datos marcados".
  const base = (pay360: StorePay360 | null): CheckoutState => ({
    ...initialCheckoutState('p1'),
    pay360,
    locationType: 'LIMA',
    advanceAmount: 6,
    advanceYapeCode: '',
  })

  it('sin código de Yape, el paso 3 ya es válido', () => {
    expect(validateStep(base({ enabled: true }), 3)).toEqual({})
  })

  it('sin 360pay sigue exigiendo el código, como siempre', () => {
    expect(validateStep(base(null), 3).yapeCode).toBeTruthy()
  })

  it('sin adelanto no pide nada, con o sin 360pay', () => {
    expect(validateStep({ ...base({ enabled: true }), advanceAmount: 0 }, 3)).toEqual({})
    expect(validateStep({ ...base(null), advanceAmount: 0 }, 3)).toEqual({})
  })
})

describe('vencimiento del cupón', () => {
  const now = Date.parse('2026-08-21T02:00:00.000Z')

  it('vence a los 7 días de emitido', () => {
    expect(couponExpiryFrom(now)).toBe('2026-08-28T02:00:00.000Z')
    expect(COUPON_TTL_DAYS).toBe(7)
  })

  it('va en ISO, que es lo que el API acepta', () => {
    expect(couponExpiryFrom(now)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('siempre es futuro respecto del momento de emisión', () => {
    // Un cupón que nace vencido no lo puede pagar nadie, y el fallo sería en
    // Yape —fuera de nuestros logs— no al emitirlo.
    expect(Date.parse(couponExpiryFrom(now))).toBeGreaterThan(now)
  })
})
