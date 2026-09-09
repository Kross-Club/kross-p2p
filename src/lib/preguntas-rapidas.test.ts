import { describe, expect, it } from 'vitest'
import { ESPERA_PREGUNTA_MS, claveDePregunta, esperaRestante, preguntasRapidas, proximoVencimiento, usadasVigentes } from './preguntas-rapidas'
import { buildTicket } from './checkout/ticket'
import type { AgencyBranch } from './checkout/types'
import { coordinadoDelPedido, estadoDesdePedido, pagadoDelPedido } from './checkout/ticket-desde-pedido'

const recojo = {
  status: 'active', stage: 'confirmado',
  buyer_name: 'Jhoann Pacahuala', product_price: 12, product_name: 'Limpieza Demo', pack_name: null,
  advance_amount: 6, payment_verification: 'MATCHED', payment_provider: 'FLOW',
  dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM', agency_branch_id: '12', delivery_reference: '12',
  address: 'El Agustino', buyer_document: '00000000',
}

const domicilio = {
  status: 'active', stage: 'confirmado',
  buyer_name: 'Ana', product_price: 12, product_name: 'Limpieza Demo', pack_name: null,
  advance_amount: 6, payment_verification: 'MATCHED', payment_provider: 'FLOW',
  dispatch_type: 'MOTORIZADO_LIMA', address: 'Av. Los Olivos 123', address_verified: true,
}

const sede = { id: '12', name: 'JIRON ANCASH', address: 'JR. ANCASH MZ. B LT. 11', district: 'El Agustino', province: 'Lima' } as unknown as AgencyBranch

function ticketDe(p: typeof recojo | typeof domicilio, extra: { fase?: string | null; guia?: boolean; branch?: AgencyBranch | null } = {}) {
  return buildTicket({
    state: estadoDesdePedido(p),
    price: p.product_price,
    packName: p.product_name,
    paid: pagadoDelPedido(p),
    unpaid: coordinadoDelPedido(p),
    branch: extra.branch ?? null,
    guide: extra.guia ? { courier: 'SHALOM', numero: '95107445', codigo: 'NDK3', oseId: null, href: '/guia/x' } : null,
    fase: extra.fase ?? null,
  })
}

describe('preguntasRapidas', () => {
  it('recojo en camino con saldo: cuándo, dónde, cuánto falta y la clave, contestadas', () => {
    const qs = preguntasRapidas(recojo, ticketDe(recojo, { guia: true, fase: 'REGISTRADO', branch: sede }))
    expect(qs.map(q => q.pregunta)).toEqual(['¿Cuándo llega?', '¿Dónde lo recojo?', '¿Cuánto me falta?', '¿Cuál es mi clave?'])
    expect(qs[0].respuesta).toBe('Va en camino a Shalom · JIRON ANCASH. Te avisamos por aquí cuando llegue.')
    expect(qs[1].respuesta).toBe('En Shalom · JIRON ANCASH, JR. ANCASH MZ. B LT. 11, El Agustino. Lleva tu DNI y tu clave de recojo.')
    expect(qs[2].respuesta).toBe('Te falta S/ 6. Págalo con el botón «Pagar S/ 6 con Yape» de arriba y te llega tu clave de recojo.')
    expect(qs[3].respuesta).toBe('Te la enviamos por aquí apenas pagues el saldo.')
  })

  it('llegó a la agencia y ya pagó: no debe nada y la clave se contesta', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }
    const qs = preguntasRapidas(pagado, ticketDe(pagado, { guia: true, fase: 'EN_DESTINO', branch: sede }))
    expect(qs[0].respuesta).toBe('¡Ya llegó! Está en Shalom · JIRON ANCASH, listo para que lo recojas.')
    expect(qs[2].respuesta).toBe('Nada. Tu pedido está pagado por completo.')
    expect(qs[3]).toEqual({ pregunta: '¿Cuál es mi clave?', respuesta: 'Tu clave de recojo es 4821. Preséntala con tu DNI en el mostrador.' })
  })

  it('pagó todo pero la clave todavía no existe: se promete, no se inventa', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED' }
    const qs = preguntasRapidas(pagado, ticketDe(pagado, { guia: true }))
    expect(qs[3].respuesta).toBe('Te la enviamos por aquí en cuanto esté lista.')
  })

  it('validando: lo que le falta se cuenta con lo que él ya pagó', () => {
    const v = { ...recojo, stage: 'validando', payment_verification: 'PENDING' }
    const qs = preguntasRapidas(v, ticketDe(v))
    expect(qs[0]).toEqual({ pregunta: '¿Ya llegó mi pago?', respuesta: 'Lo estamos validando. Apenas cruce te avisamos por aquí.' })
    expect(qs[2].pregunta).toBe('¿Cuánto me falta?')
    expect(qs[2].respuesta).toBe('Te falta S/ 6. Te avisamos por aquí cuando puedas pagarlo.')
    expect(qs[3].respuesta).toBe('Te la enviamos por aquí apenas pagues el saldo.')
  })

  it('sin sede resuelta, la respuesta no inventa una dirección', () => {
    const qs = preguntasRapidas(recojo, ticketDe(recojo, { guia: true }))
    expect(qs[1].respuesta).toBe('En tu agencia de Shalom. Te confirmamos la sede por aquí. Lleva tu DNI y tu clave de recojo.')
  })

  it('a domicilio: cuándo llega, cuánto falta, a dónde llega y cambiar la dirección', () => {
    const qs = preguntasRapidas(domicilio, ticketDe(domicilio))
    expect(qs.map(q => q.pregunta)).toEqual(['¿Cuándo llega?', '¿Cuánto me falta?', '¿A dónde llega?', 'Cambiar dirección'])
    expect(qs[0].respuesta).toBe('Lo estamos preparando. Te avisamos por aquí cuando salga el motorizado.')
    expect(qs[1].respuesta).toBe('S/ 6, al recibir tu pedido.')
    expect(qs[2].respuesta).toBe('A Av. Los Olivos 123. Tu ubicación está verificada con GPS.')
  })

  it('a domicilio sin GPS verificado: a dónde llega pide verificarlo', () => {
    const v = { ...domicilio, address_verified: false }
    const qs = preguntasRapidas(v, ticketDe(v))
    expect(qs[2].respuesta).toBe('A Av. Los Olivos 123. Verifica tu ubicación con GPS desde «Ver pedido» para que el motorizado te encuentre.')
  })

  it('a domicilio en camino y pagado por completo', () => {
    const v = { ...domicilio, advance_amount: 12 }
    const qs = preguntasRapidas(v, ticketDe(v, { fase: 'EN_TRANSITO' }))
    expect(qs[0].respuesta).toBe('Va en camino a Av. Los Olivos 123. Te avisamos por aquí cuando esté por llegar.')
    expect(qs[1].respuesta).toBe('Nada. Tu pedido está pagado por completo.')
  })

  it('entregado: cambio, volver a pedir y un problema', () => {
    const v = { ...recojo, stage: 'entregado' }
    expect(preguntasRapidas(v, ticketDe(v, { guia: true })).map(q => q.pregunta)).toEqual([
      'Cambiar o devolver', 'Volver a pedir', 'Tengo un problema',
    ])
  })

  it('cancelado, anulado y cerrado sin entregar: sin preguntas', () => {
    for (const v of [{ ...recojo, status: 'cancelado' }, { ...recojo, status: 'anulado' }, { ...recojo, stage: 'no_entregado' }]) {
      expect(preguntasRapidas(v, ticketDe(v))).toEqual([])
    }
  })

  it('siempre son cuatro mientras el pedido está vivo, y tres entregado', () => {
    for (const [p, extra] of [[recojo, { guia: true }], [domicilio, {}], [{ ...recojo, stage: 'validando', payment_verification: 'PENDING' }, {}]] as const) {
      expect(preguntasRapidas(p, ticketDe(p, extra))).toHaveLength(4)
    }
    expect(preguntasRapidas({ ...recojo, stage: 'entregado' }, ticketDe(recojo))).toHaveLength(3)
  })

  it('caben en media pantalla: ninguna pasa de 18 caracteres (entregado, la última va sola)', () => {
    const vivos = [
      preguntasRapidas(recojo, ticketDe(recojo, { guia: true })),
      preguntasRapidas({ ...recojo, saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }, ticketDe(recojo, { guia: true })),
      preguntasRapidas({ ...recojo, stage: 'validando', payment_verification: 'PENDING' }, ticketDe(recojo)),
      preguntasRapidas(domicilio, ticketDe(domicilio)),
      preguntasRapidas({ ...recojo, stage: 'entregado' }, ticketDe(recojo)).slice(0, 2),
    ]
    for (const q of vivos.flat()) expect(q.pregunta.length, q.pregunta).toBeLessThanOrEqual(18)
  })
})

describe('enfriamiento de una pregunta usada', () => {
  const q = { pregunta: '¿Cuánto me falta?', respuesta: 'Te falta S/ 6. Te avisamos por aquí cuando puedas pagarlo.' }
  const T = 1_800_000_000_000

  it('la marca es de la pregunta CON su respuesta: si cambia la respuesta, es otra', () => {
    expect(claveDePregunta(q)).toBe(claveDePregunta({ ...q }))
    expect(claveDePregunta(q)).not.toBe(claveDePregunta({ ...q, respuesta: 'Nada. Tu pedido está pagado por completo.' }))
  })

  it('espera cinco minutos desde el toque, ni más ni menos', () => {
    expect(esperaRestante(undefined, T)).toBe(0)
    expect(esperaRestante(T, T)).toBe(ESPERA_PREGUNTA_MS)
    expect(esperaRestante(T, T + 60_000)).toBe(ESPERA_PREGUNTA_MS - 60_000)
    expect(esperaRestante(T, T + ESPERA_PREGUNTA_MS)).toBe(0)
    expect(esperaRestante(T, T + ESPERA_PREGUNTA_MS + 1)).toBe(0)
  })

  it('un reloj que retrocedió no alarga la espera más de cinco minutos', () => {
    expect(esperaRestante(T + 3_600_000, T)).toBe(ESPERA_PREGUNTA_MS)
    expect(esperaRestante(Number.NaN, T)).toBe(0)
  })

  it('las marcas vencidas se van y la próxima en vencer manda el temporizador', () => {
    const usadas = { a: T - ESPERA_PREGUNTA_MS - 1, b: T - 120_000, c: T - 30_000 }
    expect(usadasVigentes(usadas, T)).toEqual({ b: T - 120_000, c: T - 30_000 })
    expect(proximoVencimiento(usadas, T)).toBe(ESPERA_PREGUNTA_MS - 120_000)
    expect(proximoVencimiento({}, T)).toBeNull()
    expect(proximoVencimiento({ a: T - ESPERA_PREGUNTA_MS }, T)).toBeNull()
  })
})
