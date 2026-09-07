// La cascada de recojo: la regla de los días y los dos avisos que manda. Es la
// mitad que decide CUÁNDO se le escribe a alguien y QUÉ fecha se le promete, y
// por eso se prueba acá: equivocarse en un día es mandarle a un comprador un
// último aviso sobre una fecha que ya pasó.

import { describe, expect, it } from 'vitest'
import {
  DIAS_EN_AGENCIA_DEFAULT, DIA_AVISO_VENDEDOR, DIA_RECORDATORIO, DIA_ULTIMO_AVISO,
  diasDesde, fechaDeDevolucion, fechaEnPalabras, pasoDebido,
} from '../../supabase/functions/_shared/recojo.ts'
import {
  enlaceDelPedido, smsRecordatorioRecojo, smsUltimoAvisoRecojo, SMS_MAX,
} from '../../supabase/functions/_shared/sms-texto.ts'

const LINK = enlaceDelPedido('gadicaf', 'tok123')!

describe('pasoDebido', () => {
  it('no molesta antes del día 2', () => {
    expect(pasoDebido(0)).toBe(0)
    expect(pasoDebido(1)).toBe(0)
  })

  it('los días de cada paso son los del doc 08', () => {
    expect(pasoDebido(DIA_RECORDATORIO)).toBe(1)
    expect(pasoDebido(DIA_ULTIMO_AVISO)).toBe(2)
    expect(pasoDebido(DIA_AVISO_VENDEDOR)).toBe(3)
    expect([DIA_RECORDATORIO, DIA_ULTIMO_AVISO, DIA_AVISO_VENDEDOR]).toEqual([2, 4, 5])
  })

  it('el día 3 sigue en recordatorio: los pasos no se adelantan', () => {
    expect(pasoDebido(3)).toBe(1)
  })

  it('si el cron estuvo caído salta al paso de hoy, no manda el viejo', () => {
    // Pedido de día 9 con la cascada sin empezar: le toca el vendedor, no un
    // recordatorio de hace una semana.
    expect(pasoDebido(9)).toBe(3)
    expect(pasoDebido(60)).toBe(3)
  })
})

describe('diasDesde', () => {
  const ahora = new Date('2026-09-10T16:00:00Z')
  it('cuenta días enteros', () => {
    expect(diasDesde('2026-09-10T15:00:00Z', ahora)).toBe(0)
    expect(diasDesde('2026-09-08T16:00:00Z', ahora)).toBe(2)
    expect(diasDesde('2026-09-08T17:00:00Z', ahora)).toBe(1)
  })
  it('sin fecha o con basura no decide nada', () => {
    expect(diasDesde(null, ahora)).toBeNull()
    expect(diasDesde('cuando sea', ahora)).toBeNull()
  })
})

describe('la fecha de devolución', () => {
  it('sale de la llegada más lo que la agencia guarda', () => {
    const d = fechaDeDevolucion('2026-09-05T14:00:00Z', DIAS_EN_AGENCIA_DEFAULT)
    expect(d.toISOString()).toBe('2026-09-12T14:00:00.000Z')
  })

  it('se dice como una persona, sin tildes y en hora de Lima', () => {
    expect(fechaEnPalabras(new Date('2026-09-12T14:00:00Z'))).toBe('sabado 12 de setiembre')
  })

  it('un envío de la noche no promete el día siguiente', () => {
    // 01:00 UTC del sábado 12 son las 20:00 del viernes 11 en Lima. Prometer
    // "sabado 12" a quien todavía está en viernes le regala un día que no tiene.
    expect(fechaEnPalabras(new Date('2026-09-12T01:00:00Z'))).toBe('viernes 11 de setiembre')
  })
})

describe('los avisos de la cascada', () => {
  const recordatorio = smsRecordatorioRecojo({ tienda: 'Gadicaf', agencia: 'SHALOM', saldo: 94, link: LINK })
  const recordatorioPagado = smsRecordatorioRecojo({ tienda: 'Gadicaf', agencia: 'OLVA', saldo: 0, link: LINK })
  const ultimo = smsUltimoAvisoRecojo({ tienda: 'Gadicaf', agencia: 'SHALOM', fecha: 'sabado 12 de setiembre', link: LINK })

  it('el recordatorio con saldo dice cuánto y desde dónde se paga', () => {
    expect(recordatorio).toBe(
      'Gadicaf: tu pedido sigue esperandote en Shalom. Paga tu saldo de S/94 desde tu pedido y recogelo con tu DNI. '
      + `Tu pedido: ${LINK}`,
    )
  })

  it('sin saldo apunta a la clave, sin escribirla', () => {
    expect(recordatorioPagado).toMatch(/tu clave, que esta en tu pedido/)
    expect(recordatorioPagado).not.toMatch(/clave de recojo es/)
  })

  it('el último aviso lleva la fecha real de devolución', () => {
    expect(ultimo).toBe(
      'Gadicaf: ultimo aviso. Shalom devuelve tu pedido el sabado 12 de setiembre y despues ya no podremos entregartelo. '
      + `Recogelo con tu DNI. Tu pedido: ${LINK}`,
    )
  })

  it('no grita: un SMS en mayúsculas se lee como estafa', () => {
    for (const t of [recordatorio, ultimo]) {
      expect(t).not.toMatch(/URGENTE|ULTIMA OPORTUNIDAD|!!/)
    }
  })

  it('empiezan con la tienda, terminan con el enlace, y viajan en GSM-7', () => {
    for (const t of [recordatorio, recordatorioPagado, ultimo]) {
      expect(t.startsWith('Gadicaf: ')).toBe(true)
      expect(t.endsWith(`Tu pedido: ${LINK}`)).toBe(true)
      expect(t).toMatch(/^[\x20-\x7E]+$/)
      expect(t.length).toBeLessThanOrEqual(SMS_MAX)
    }
  })

  it('nunca piden plata por el mensaje ni dicen "app"', () => {
    for (const t of [recordatorio, recordatorioPagado, ultimo]) {
      const sinEnlace = t.replace(LINK, '')
      expect(sinEnlace).not.toMatch(/paga aqui|link de pago/i)
      expect(sinEnlace).not.toMatch(/\bapp\b/i)
    }
  })
})
