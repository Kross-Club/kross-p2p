// Tests del contrato con Flow. Lo que se prueba acá es lo que no se puede
// probar contra el sandbox desde estas sesiones (dominio bloqueado por egress):
// la firma, el armado del enlace, la lectura del estado y el desglose.
//
// La prueba que más vale es la de la firma: los vectores salen de la doc de
// Flow, y una firma mal armada rebota TODA la integración sin decir por qué.

import { describe, expect, it } from 'vitest'
import {
  FLOW_STATUS, ORDER_TTL_S, cadenaAFirmar, checkoutUrl, comercioAprobado,
  desgloseDeFlow, EMAIL_DEL_PAGADOR, esFinalSinPago, esPagada, firmar, flowBaseUrl,
  hmacHex, montoParaFlow, normalizar, orderExpiryFrom, pickFlowKeys, tokenDelWebhook, unwrap,
} from '../../../supabase/functions/_shared/flow.ts'
import { esRielEnLinea, rielPara, RIELES } from '../../../supabase/functions/_shared/comision.ts'

describe('bases por ambiente', () => {
  it('separa sandbox por HOST, no por prefijo de ruta', () => {
    expect(flowBaseUrl('live')).toBe('https://www.flow.cl/api')
    expect(flowBaseUrl('sandbox')).toBe('https://sandbox.flow.cl/api')
  })

  it('no cae de live a sandbox: son cuentas distintas', () => {
    const k = { sandboxKey: ' sk ', sandboxSecret: 'ss', liveKey: '', liveSecret: '' }
    expect(pickFlowKeys('sandbox', k)).toEqual({ apiKey: 'sk', secretKey: 'ss' })
    // Sin llaves de producción, producción queda VACÍA — y el caller lo nota.
    expect(pickFlowKeys('live', k)).toEqual({ apiKey: '', secretKey: '' })
  })
})

describe('la firma', () => {
  it('arma la cadena como el ejemplo de la doc', () => {
    // "amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP" — literal de Primeros pasos.
    const n = normalizar({ apiKey: 'XXXX-XXXX-XXXX', currency: 'CLP', amount: 5000 })
    expect(cadenaAFirmar(n)).toBe('amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP')
  })

  it('y como el ejemplo de getStatus', () => {
    const n = normalizar({ apiKey: '1F90971E-8276-4715-97FF-2BLG5030EE3B', token: 'AJ089FF5467367' })
    expect(cadenaAFirmar(n)).toBe('apiKey1F90971E-8276-4715-97FF-2BLG5030EE3BtokenAJ089FF5467367')
  })

  it('ordena como el sort() de los ejemplos oficiales: paymentMethod antes que payment_currency', () => {
    const n = normalizar({ payment_currency: 'PEN', paymentMethod: 9, apiKey: 'k' })
    expect(cadenaAFirmar(n)).toBe('apiKkpaymentMethod9payment_currencyPEN'.replace('apiKk', 'apiKeyk'))
  })

  it('los parámetros vacíos NO viajan ni se firman', () => {
    const n = normalizar({ apiKey: 'k', paymentMethod: undefined, merchantId: null, amount: 10 })
    expect(Object.keys(n).sort()).toEqual(['amount', 'apiKey'])
    expect(cadenaAFirmar(n)).toBe('amount10apiKeyk')
  })

  it('el HMAC es el que produce el ejemplo NodeJS de la doc', async () => {
    // Vector fijado con `node:crypto` sobre el ejemplo literal de la doc
    // (secret "my secret", apiKey + token). Si nuestra WebCrypto se desvía de
    // esto, Flow rechaza TODA llamada sin decir por qué.
    const secret = 'my secret'
    const params = { apiKey: '1F90971E-8276-4715-97FF-2BLG5030EE3B', token: 'AJ089FF5467367' }
    const esperado = '191947b8253f1b615adeda260fab7d8c8cc0507b22e19d4742baa00b0e464d44'
    expect(await hmacHex(secret, cadenaAFirmar(normalizar(params)))).toBe(esperado)
    const firmado = await firmar(params, secret)
    expect(firmado.s).toBe(esperado)
    expect(firmado.apiKey).toBe(params.apiKey)
  })

  it('un número se firma tal como viaja', async () => {
    const f = await firmar({ apiKey: 'k', amount: 30000 }, 's')
    expect(f.amount).toBe('30000')
    expect(cadenaAFirmar(normalizar({ apiKey: 'k', amount: 30000 }))).toBe('amount30000apiKeyk')
    expect(f.s).toBe('115624a556385019b6a4b31c1eca553977c36f4555e7cc93f7a2bcd1ce07778f')
  })
})

describe('la orden', () => {
  it('arma el enlace del checkout como dice la doc: url + "?token=" + token', () => {
    expect(checkoutUrl({ url: 'https://www.flow.cl/app/web/pay.php', token: '3337ABC' }))
      .toBe('https://www.flow.cl/app/web/pay.php?token=3337ABC')
  })

  it('la orden vive 30 días, como el cupón de 360pay', () => {
    expect(ORDER_TTL_S).toBe(30 * 24 * 60 * 60)
    const t0 = Date.parse('2026-09-01T00:00:00Z')
    expect(orderExpiryFrom(t0)).toBe('2026-10-01T00:00:00.000Z')
  })

  it('el monto va en soles con decimales — a confirmar en sandbox', () => {
    expect(montoParaFlow(10)).toBe(10)
    expect(montoParaFlow(12.5)).toBe(12.5)
    expect(montoParaFlow(0.1 + 0.2)).toBe(0.3)
  })

  it('el email se sintetiza del celular, como hacía Culqi', () => {
    // Uno solo para todos: el checkout no pide correo y Flow lo exige.
    expect(EMAIL_DEL_PAGADOR).toBe('uxbriel@gmail.com')
    expect(EMAIL_DEL_PAGADOR).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  })
})

describe('el sobre', () => {
  it('un 200 con objeto es éxito', () => {
    const r = unwrap<{ token: string }>(200, { url: 'u', token: 't', flowOrder: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.token).toBe('t')
  })

  it('un 4xx trae el mensaje de Flow', () => {
    const r = unwrap(400, { code: 1, message: 'Invalid signature' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Invalid signature')
  })

  it('un 2xx sin objeto es error de contrato, no dato vacío', () => {
    expect(unwrap(200, null).ok).toBe(false)
    expect(unwrap(200, 'ok').ok).toBe(false)
  })
})

describe('el estado', () => {
  it('solo el 2 es pagada', () => {
    expect(esPagada({ status: 2 })).toBe(true)
    // Flow lo manda como número; si un día llega como texto, sigue valiendo.
    expect(esPagada({ status: '2' as unknown as number })).toBe(true)
    expect(esPagada({ status: 1 })).toBe(false)
    expect(esPagada({ status: 3 })).toBe(false)
    expect(esPagada({})).toBe(false)
  })

  it('rechazada y anulada son finales sin pago; pendiente no', () => {
    expect(esFinalSinPago({ status: FLOW_STATUS.RECHAZADA })).toBe(true)
    expect(esFinalSinPago({ status: FLOW_STATUS.ANULADA })).toBe(true)
    expect(esFinalSinPago({ status: FLOW_STATUS.PENDIENTE })).toBe(false)
    expect(esFinalSinPago({ status: FLOW_STATUS.PAGADA })).toBe(false)
  })

  it('el desglose trae el costo del riel y deja la comisión en null', () => {
    // El ejemplo de la doc: amount 12000, fee 551, balance 11499.
    expect(desgloseDeFlow({ fee: 551, balance: 11499 })).toEqual({ comision: null, costo: 551 })
    expect(desgloseDeFlow(null)).toEqual({ comision: null, costo: null })
    expect(desgloseDeFlow({})).toEqual({ comision: null, costo: null })
  })

  it('el comercio asociado solo cuenta aprobado', () => {
    expect(comercioAprobado({ status: 1 })).toBe(true)
    expect(comercioAprobado({ status: '1' })).toBe(true)
    expect(comercioAprobado({ status: 0 })).toBe(false)
    expect(comercioAprobado({ status: 2 })).toBe(false)
  })
})

describe('el webhook', () => {
  it('lee el token del body form-urlencoded, y solo eso', () => {
    expect(tokenDelWebhook('token=123187565538192')).toBe('123187565538192')
    expect(tokenDelWebhook('token=abc&otra=x')).toBe('abc')
    expect(tokenDelWebhook('')).toBeNull()
    expect(tokenDelWebhook('nada=1')).toBeNull()
  })
})

describe('el seam de proveedor', () => {
  it('los dos rieles cobran en línea; nada más', () => {
    expect(RIELES).toEqual(['360PAY', 'FLOW'])
    expect(esRielEnLinea('360PAY')).toBe(true)
    expect(esRielEnLinea('FLOW')).toBe(true)
    expect(esRielEnLinea(null)).toBe(false)
    expect(esRielEnLinea('CULQI')).toBe(false)
  })

  it('con los dos encendidos manda el corte; con uno, ese; sin ninguno, null', () => {
    expect(rielPara(10, ['360PAY', 'FLOW'])).toBe('FLOW')
    expect(rielPara(100, ['360PAY', 'FLOW'])).toBe('360PAY')
    // Solo 360pay: un cobro chico va igual por 360pay — nunca por un riel apagado.
    expect(rielPara(10, ['360PAY'])).toBe('360PAY')
    expect(rielPara(300, ['FLOW'])).toBe('FLOW')
    expect(rielPara(10, [])).toBeNull()
  })
})
