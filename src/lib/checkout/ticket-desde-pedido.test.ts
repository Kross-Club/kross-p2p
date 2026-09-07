// El ticket armado desde la FILA del pedido — lo que sostiene `/pedido/:token`.
// Se prueba la traducción y, sobre todo, que el recorrido avance con lo que
// reporta el courier: si recargar no enseña nada nuevo, la página no sirve.

import { describe, expect, it } from 'vitest'
import { buildTicket } from './ticket'
import { coordinadoDelPedido, estadoDesdePedido, pagadoDelPedido } from './ticket-desde-pedido'
import type { PedidoGuardado } from './ticket-desde-pedido'
import type { AgencyBranch } from './types'

const SEDE: AgencyBranch = {
  agency: 'SHALOM', id: '77', name: 'Juliaca Centro', district: 'Juliaca',
  province: 'San Román', department: 'Puno', address: 'Jr. San Martín 456', lat: null, lng: null,
}

const enAgencia = (over: Partial<PedidoGuardado> = {}): PedidoGuardado => ({
  buyer_name: 'Rosa Quispe', product_price: 189, pack_name: 'Pack x2',
  advance_amount: 95, payment_verification: 'MATCHED', payment_provider: '360PAY',
  dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM', agency_branch_id: '77',
  ...over,
})

const ticket = (p: PedidoGuardado, fase?: string | null, conGuia = false) => buildTicket({
  state: estadoDesdePedido(p),
  price: Number(p.product_price ?? 0),
  packName: p.pack_name ?? null,
  paid: pagadoDelPedido(p),
  unpaid: coordinadoDelPedido(p),
  branch: SEDE,
  guide: conGuia ? { courier: 'SHALOM', numero: '94870783', codigo: 'WKCT', oseId: null, href: '/x.pdf' } : null,
  fase,
})

const etiquetas = (t: ReturnType<typeof buildTicket>) => t.pasos.map(p => `${p.estado}:${p.label}`)

describe('el pedido guardado se traduce a lo que el ticket sabe leer', () => {
  it('en agencia: sede, destinatario y adelanto', () => {
    const t = ticket(enAgencia())
    expect(t.payment).toBe('Pago recibido por Yape: S/ 95 de S/ 189.')
    expect(t.lines.find(l => l.label === 'A nombre de')?.value).toBe('Rosa Quispe')
    expect(t.lines.find(l => l.label === 'Lo recoges en')?.value).toBe('Shalom · Juliaca Centro')
  })

  it('a domicilio: la dirección guardada es la que se enseña', () => {
    const t = ticket({
      buyer_name: 'Juan Pérez', product_price: 120, advance_amount: 60,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      dispatch_type: 'MOTORIZADO_LIMA', address: 'Av. Larco 123, Miraflores',
    })
    expect(t.lines.find(l => l.label === 'Llega a')?.value).toBe('Av. Larco 123, Miraflores')
  })

  it('la sede escrita a mano se distingue del id de sede', () => {
    const conId = estadoDesdePedido(enAgencia({ agency_branch_id: null, delivery_reference: '77' }))
    expect(conId.pickup.branchId).toBe('77')
    expect(conId.pickup.freeText).toBeNull()

    const escrita = estadoDesdePedido(enAgencia({ agency_branch_id: null, delivery_reference: 'Paradero El Cruce' }))
    expect(escrita.pickup.branchId).toBeNull()
    expect(escrita.pickup.freeText).toBe('Paradero El Cruce')
  })

  it('sin riel y sin cruce, el adelanto lo coordina un asesor — nunca "no pagaste"', () => {
    const p = enAgencia({ payment_verification: 'PENDING', payment_provider: null })
    expect(coordinadoDelPedido(p)).toBe(true)
    expect(ticket(p).payment).toContain('Un asesor te escribe')
    expect(ticket(p).payment).not.toContain('no')
  })

  it('el adelanto viaja a veces como texto y se lee igual', () => {
    expect(estadoDesdePedido(enAgencia({ advance_amount: '95' })).advanceAmount).toBe(95)
  })
})

describe('el recorrido avanza con lo que reporta el courier', () => {
  it('sin fase, con guía: va en camino a la agencia', () => {
    expect(etiquetas(ticket(enAgencia(), null, true))).toEqual([
      'hecho:Pago recibido',
      'hecho:Guía de envío emitida',
      'actual:En camino a Shalom',
      'pendiente:Llegó a la agencia',
      'pendiente:Recojo',
    ])
  })

  it('EN_DESTINO: el paquete ya está en el mostrador, pero recogerlo es del comprador', () => {
    expect(etiquetas(ticket(enAgencia(), 'EN_DESTINO', true))).toEqual([
      'hecho:Pago recibido',
      'hecho:Guía de envío emitida',
      'hecho:En camino a Shalom',
      'actual:Llegó a la agencia',
      'pendiente:Recojo',
    ])
  })

  it('ENTREGADO: todo el recorrido queda hecho', () => {
    expect(etiquetas(ticket(enAgencia(), 'ENTREGADO', true)).every(e => e.startsWith('hecho:'))).toBe(true)
  })

  it('EN_ORIGEN ya es camino para el comprador, no vocabulario del courier', () => {
    expect(etiquetas(ticket(enAgencia(), 'EN_ORIGEN', true))[2]).toBe('actual:En camino a Shalom')
  })

  it('sin el adelanto cruzado no hay envío que seguir, diga lo que diga la fase', () => {
    const p = enAgencia({ payment_verification: 'PENDING', payment_provider: null })
    expect(etiquetas(ticket(p, 'EN_TRANSITO'))[0]).toBe('actual:Pedido registrado')
    expect(etiquetas(ticket(p, 'EN_TRANSITO')).slice(1).every(e => e.startsWith('pendiente:'))).toBe(true)
  })

  it('a domicilio la fase mueve los tres pasos suyos', () => {
    const p: PedidoGuardado = {
      buyer_name: 'Juan', product_price: 120, advance_amount: 60,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      dispatch_type: 'MOTORIZADO_LIMA', address: 'Av. Larco 123',
    }
    expect(etiquetas(ticket(p, null))[1]).toBe('actual:Preparando tu pedido')
    expect(etiquetas(ticket(p, 'EN_TRANSITO'))[2]).toContain('actual:En camino')
    expect(etiquetas(ticket(p, 'ENTREGADO')).every(e => e.startsWith('hecho:'))).toBe(true)
  })
})
