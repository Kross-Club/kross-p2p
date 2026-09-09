import { describe, expect, it } from 'vitest'
import { estadoDeLaTarjeta } from './tarjeta-del-pedido'
import { buildTicket } from './checkout/ticket'
import { coordinadoDelPedido, estadoDesdePedido, pagadoDelPedido } from './checkout/ticket-desde-pedido'

// Un pedido de recojo en Shalom, como el primero cobrado por Flow
// (ORD-1788900938194): S/12 con adelanto de S/6 cruzado.
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
  dispatch_type: 'MOTORIZADO_LIMA', address: 'Av. Los Olivos 123', address_verified: false,
}

function pasosDe(p: typeof recojo | typeof domicilio, extra: { fase?: string | null; guia?: boolean } = {}) {
  return buildTicket({
    state: estadoDesdePedido(p),
    price: p.product_price,
    packName: p.product_name,
    paid: pagadoDelPedido(p),
    unpaid: coordinadoDelPedido(p),
    branch: null,
    guide: extra.guia ? { courier: 'SHALOM', numero: '95107445', codigo: 'NDK3', oseId: null, href: '/guia/x' } : null,
    fase: extra.fase ?? null,
  }).pasos
}

describe('estadoDeLaTarjeta', () => {
  it('recojo con guía y saldo pendiente: va en camino y la acción es pagar', () => {
    const e = estadoDeLaTarjeta(recojo, pasosDe(recojo, { guia: true, fase: 'REGISTRADO' }))
    expect(e.titulo).toBe('En camino a Shalom')
    expect(e.tono).toBe('activo')
    expect(e.pasos).toEqual(['hecho', 'hecho', 'actual', 'pendiente', 'pendiente'])
    expect(e.accion).toBe('saldo')
    expect(e.detalle).toBe('Te avisamos por aquí cuando llegue a la agencia.')
    expect(e.notaDePago).toBe('Al pagar te llega tu clave de recojo.')
  })

  it('llegó a la agencia con saldo: lo dice y sigue cobrando', () => {
    const e = estadoDeLaTarjeta(recojo, pasosDe(recojo, { guia: true, fase: 'EN_DESTINO' }))
    expect(e.titulo).toBe('Llegó a la agencia')
    expect(e.accion).toBe('saldo')
    expect(e.detalle).toBe('Ya llegó. Paga tu saldo y te damos tu clave para recogerlo.')
  })

  it('llegó y ya no debe nada: la acción es la clave', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }
    const e = estadoDeLaTarjeta(pagado, pasosDe(pagado, { guia: true, fase: 'EN_DESTINO' }))
    expect(e.accion).toBe('clave')
    expect(e.detalle).toBe('Ya puedes recogerlo. Lleva tu DNI y esta clave al mostrador.')
    expect(e.notaDePago).toBeUndefined()
  })

  it('sin saldo, sin clave todavía: ninguna acción', () => {
    const pagado = { ...recojo, saldo_verification: 'MATCHED' }
    const e = estadoDeLaTarjeta(pagado, pasosDe(pagado, { guia: true }))
    expect(e.accion).toBeNull()
  })

  it('a domicilio sin verificar: verificar GPS va antes que el saldo', () => {
    const e = estadoDeLaTarjeta(domicilio, pasosDe(domicilio))
    expect(e.titulo).toBe('Preparando tu pedido')
    expect(e.accion).toBe('gps')
    expect(e.detalle).toBe('Te avisamos por aquí cuando salga el motorizado.')
    expect(e.pasos).toEqual(['hecho', 'actual', 'pendiente', 'pendiente'])
  })

  it('a domicilio verificado y con saldo: pagar, y se puede pagar al recibir', () => {
    const v = { ...domicilio, address_verified: true }
    const e = estadoDeLaTarjeta(v, pasosDe(v))
    expect(e.accion).toBe('saldo')
    expect(e.notaDePago).toBe('O si prefieres, lo pagas al recibir.')
  })

  it('la clave no es acción a domicilio', () => {
    const v = { ...domicilio, address_verified: true, saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }
    expect(estadoDeLaTarjeta(v, pasosDe(v)).accion).toBeNull()
  })

  it('entregado: todo hecho y sin acción, aunque haya clave', () => {
    const v = { ...recojo, stage: 'entregado', saldo_verification: 'MATCHED', shalom_pickup_code: '4821' }
    const e = estadoDeLaTarjeta(v, pasosDe(v, { guia: true, fase: 'EN_DESTINO' }))
    expect(e.titulo).toBe('Pedido entregado')
    expect(e.tono).toBe('entregado')
    expect(e.pasos).toEqual(['hecho', 'hecho', 'hecho', 'hecho', 'hecho'])
    expect(e.accion).toBeNull()
  })

  it('cancelado, anulado y cerrado sin entregar: sin barra ni acción', () => {
    for (const [pedido, titulo] of [
      [{ ...recojo, status: 'cancelado' }, 'Pedido cancelado'],
      [{ ...recojo, status: 'anulado' }, 'Pedido anulado'],
      [{ ...recojo, stage: 'no_entregado' }, 'Pedido cerrado'],
    ] as const) {
      const e = estadoDeLaTarjeta(pedido, pasosDe(pedido, { guia: true }))
      expect(e.titulo).toBe(titulo)
      expect(e.tono).toBe('cerrado')
      expect(e.pasos).toBeNull()
      expect(e.accion).toBeNull()
    }
  })

  it('un `preparando` viejo se lee como confirmado y no rompe la tarjeta', () => {
    const v = { ...recojo, stage: 'preparando' }
    expect(estadoDeLaTarjeta(v, pasosDe(v, { guia: true })).titulo).toBe('En camino a Shalom')
  })
})
