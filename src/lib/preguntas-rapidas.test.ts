import { describe, expect, it } from 'vitest'
import { preguntasRapidas } from './preguntas-rapidas'
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
  it('recojo en camino con saldo: cuándo, dónde y cuánto falta, contestadas', () => {
    const qs = preguntasRapidas(recojo, ticketDe(recojo, { guia: true, fase: 'REGISTRADO', branch: sede }))
    expect(qs.map(q => q.pregunta)).toEqual(['¿Cuándo llega mi pedido?', '¿Dónde recojo mi pedido?', '¿Cuánto me falta pagar?'])
    expect(qs[0].respuesta).toBe('Va en camino a Shalom · JIRON ANCASH. Te avisamos por aquí cuando llegue.')
    expect(qs[1].respuesta).toBe('En Shalom · JIRON ANCASH, JR. ANCASH MZ. B LT. 11, El Agustino. Lleva tu DNI y tu clave de recojo.')
    expect(qs[2].respuesta).toBe('Te falta S/ 6. Págalo con el botón «Pagar S/ 6 con Yape» de arriba y te llega tu clave de recojo.')
  })

  it('llegó a la agencia y ya pagó: la tercera pregunta es la clave', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }
    const qs = preguntasRapidas(pagado, ticketDe(pagado, { guia: true, fase: 'EN_DESTINO', branch: sede }))
    expect(qs[0].respuesta).toBe('¡Ya llegó! Está en Shalom · JIRON ANCASH, listo para que lo recojas.')
    expect(qs[2]).toEqual({ pregunta: '¿Cuál es mi clave de recojo?', respuesta: 'Tu clave de recojo es 4821. Preséntala con tu DNI en el mostrador.' })
  })

  it('pagó todo pero la clave todavía no existe: se promete, no se inventa', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED' }
    const qs = preguntasRapidas(pagado, ticketDe(pagado, { guia: true }))
    expect(qs[2].respuesta).toBe('Te la enviamos por aquí en cuanto esté lista.')
  })

  it('validando: lo que le falta se cuenta con lo que él ya pagó', () => {
    const v = { ...recojo, stage: 'validando', payment_verification: 'PENDING' }
    const qs = preguntasRapidas(v, ticketDe(v))
    expect(qs[0]).toEqual({ pregunta: '¿Ya llegó mi pago?', respuesta: 'Lo estamos validando. Apenas cruce te avisamos por aquí.' })
    expect(qs[2].pregunta).toBe('¿Cuánto me falta pagar?')
    expect(qs[2].respuesta).toBe('Te falta S/ 6. Te avisamos por aquí cuando puedas pagarlo.')
  })

  it('sin sede resuelta, la respuesta no inventa una dirección', () => {
    const qs = preguntasRapidas(recojo, ticketDe(recojo, { guia: true }))
    expect(qs[1].respuesta).toBe('En tu agencia de Shalom. Te confirmamos la sede por aquí. Lleva tu DNI y tu clave de recojo.')
  })

  it('a domicilio: cuándo llega, cuánto paga al recibir y cambiar la dirección', () => {
    const qs = preguntasRapidas(domicilio, ticketDe(domicilio))
    expect(qs.map(q => q.pregunta)).toEqual(['¿Cuándo llega mi pedido?', '¿Cuánto pago al recibir?', 'Quiero cambiar mi dirección'])
    expect(qs[0].respuesta).toBe('Lo estamos preparando. Te avisamos por aquí cuando salga el motorizado.')
    expect(qs[1].respuesta).toBe('S/ 6 al recibir tu pedido.')
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
      '¿Cómo hago un cambio o devolución?', 'Quiero volver a pedir', 'Tengo un problema con mi pedido',
    ])
  })

  it('cancelado, anulado y cerrado sin entregar: sin preguntas', () => {
    for (const v of [{ ...recojo, status: 'cancelado' }, { ...recojo, status: 'anulado' }, { ...recojo, stage: 'no_entregado' }]) {
      expect(preguntasRapidas(v, ticketDe(v))).toEqual([])
    }
  })

  it('siempre son tres mientras el pedido está vivo', () => {
    for (const [p, extra] of [[recojo, { guia: true }], [domicilio, {}], [{ ...recojo, stage: 'entregado' }, {}]] as const) {
      expect(preguntasRapidas(p, ticketDe(p, extra))).toHaveLength(3)
    }
  })
})
