// El riel SMS, la mitad pura: el número, el alfabeto y cada aviso. Se prueba
// acá lo que no se puede probar contra Twilio sin gastar: que el texto quepa,
// que llegue en GSM-7, que nombre a la tienda y NUNCA pida plata.

import { describe, expect, it } from 'vitest'
import {
  celularPeru, enlaceDelPedido, recortarSms, segmentosSms, smsGenerico, smsGuia,
  smsLlegoAgencia, smsPagoRecibido, smsSaldoRecibido, SMS_MAX, SMS_SEGMENTO, textoSms,
} from '../../supabase/functions/_shared/sms-texto.ts'

const LINK = enlaceDelPedido('gadicaf', 'tok123')!

describe('celularPeru', () => {
  it('acepta lo que la gente escribe y devuelve E.164', () => {
    for (const raw of ['999111222', '999 111 222', '+51 999111222', '51999111222', '0051999111222', '0999111222']) {
      expect(celularPeru(raw)).toBe('+51999111222')
    }
  })
  it('rechaza lo que no es un celular peruano', () => {
    expect(celularPeru('')).toBeNull()
    expect(celularPeru(null)).toBeNull()
    expect(celularPeru('14567890')).toBeNull()      // fijo de Lima
    expect(celularPeru('+13055550100')).toBeNull()  // extranjero
    expect(celularPeru('99911122')).toBeNull()      // le falta un dígito
  })
})

describe('textoSms · GSM-7', () => {
  it('quita tildes, eñes, emoji y los caracteres que cuentan doble', () => {
    expect(textoSms('¡Tu pedido llegó a Juliaca! Señora Rosa 🎉 [ok] ~ñ')).toBe('Tu pedido llego a Juliaca! Senora Rosa ok n')
  })
  it('colapsa saltos y espacios: un SMS no tiene párrafos', () => {
    expect(textoSms('a\n\n  b   c')).toBe('a b c')
  })
  it('cuenta segmentos como el operador', () => {
    expect(segmentosSms('x'.repeat(160))).toBe(1)
    expect(segmentosSms('x'.repeat(161))).toBe(2)
    expect(segmentosSms('x'.repeat(306))).toBe(2)
  })
  it('recorta sin partir el enlace', () => {
    const t = recortarSms(`${'palabra '.repeat(60)}Tu pedido: ${LINK}`)
    expect(t.length).toBeLessThanOrEqual(SMS_MAX)
    expect(t.endsWith(LINK)).toBe(true)
  })
})

describe('enlaceDelPedido', () => {
  it('va al subdominio de la marca, o a la plataforma sin slug', () => {
    expect(LINK).toBe('https://gadicaf.krossclub.app/p/tok123')
    expect(enlaceDelPedido(null, 'tok')).toBe('https://krossclub.app/p/tok')
    expect(enlaceDelPedido('x', null)).toBeNull()
  })
})

const AVISOS = {
  pago: smsPagoRecibido({ tienda: 'Gadicaf', monto: 95, codigo: 'KSH-0231', recojo: true, link: LINK }),
  pagoDomicilio: smsPagoRecibido({ tienda: 'Gadicaf', monto: 95, codigo: null, recojo: false, link: LINK }),
  saldo: smsSaldoRecibido({ tienda: 'Gadicaf', monto: 94, codigo: 'KSH-0231', link: LINK }),
  guia: smsGuia({ tienda: 'Gadicaf', courier: 'SHALOM', ids: 'Nro. de orden 80574902 · Código CJTW', link: LINK }),
  llegoConSaldo: smsLlegoAgencia({ tienda: 'Gadicaf', agencia: 'SHALOM', saldo: 94, link: LINK }),
  llegoPagado: smsLlegoAgencia({ tienda: 'Gadicaf', agencia: 'OLVA', saldo: 0, link: LINK }),
  generico: smsGenerico({ tienda: 'Gadicaf', cuerpo: 'Hola Rosa, ¿confirmas tu dirección? — Equipo', link: LINK }),
}

describe('cada aviso', () => {
  it('empieza con la tienda y termina con el enlace del pedido', () => {
    for (const t of Object.values(AVISOS)) {
      expect(t.startsWith('Gadicaf: ')).toBe(true)
      expect(t.endsWith(`Tu pedido: ${LINK}`)).toBe(true)
    }
  })
  it('viaja en GSM-7 y en dos segmentos como máximo', () => {
    for (const t of Object.values(AVISOS)) {
      expect(t).toMatch(/^[\x20-\x7E]+$/)
      expect(t.length).toBeLessThanOrEqual(SMS_MAX)
    }
  })
  it('nunca pide plata ni dice "app"', () => {
    for (const t of Object.values(AVISOS)) {
      const sinEnlace = t.replace(LINK, '')
      expect(sinEnlace).not.toMatch(/paga aqui|pagar aqui|haz clic para pagar|link de pago/i)
      expect(sinEnlace).not.toMatch(/\bapp\b/i)
    }
  })
  it('el recibo del pago no menciona el saldo: es la forma exacta del fraude', () => {
    expect(AVISOS.pago).toBe('Gadicaf: recibimos tu pago de S/95 (pedido KSH-0231). Te avisaremos cuando llegue a la agencia. Tu pedido: ' + LINK)
    expect(AVISOS.pago).not.toMatch(/saldo|debes/i)
    expect(AVISOS.pagoDomicilio).toMatch(/salga a tu direccion/)
  })
  it('la llegada con saldo dice cuánto y dónde NO se paga', () => {
    expect(AVISOS.llegoConSaldo).toBe('Gadicaf: tu pedido llego a Shalom. Lleva tu DNI. Tu saldo de S/94 se paga con Yape desde tu pedido, nunca en la agencia. Tu pedido: ' + LINK)
  })
  it('la llegada pagada apunta a la clave, sin escribirla', () => {
    expect(AVISOS.llegoPagado).toMatch(/clave de recojo, que esta en tu pedido/)
    expect(AVISOS.llegoPagado).not.toMatch(/clave de recojo es/)
  })
  it('la guía lleva el número como lo nombra el voucher, sin el punto medio', () => {
    expect(AVISOS.guia).toBe('Gadicaf: tu pedido ya tiene guia Shalom (Nro. de orden 80574902 - Codigo CJTW). Lleva tu DNI para recogerlo. Tu pedido: ' + LINK)
  })
  it('el saldo recibido cierra la deuda', () => {
    expect(AVISOS.saldo).toMatch(/Ya no debes nada/)
  })
  it('los avisos frecuentes caben en un segmento', () => {
    expect(AVISOS.pago.length).toBeLessThanOrEqual(SMS_SEGMENTO)
    expect(AVISOS.llegoPagado.length).toBeLessThanOrEqual(SMS_SEGMENTO)
  })
})
