// El ticket de la pantalla final: lo que el comprador captura y guarda. Se
// prueba contra estados del checkout, no contra la UI.

import { describe, expect, it } from 'vitest'
import { initialCheckoutState } from './machine'
import { buildTicket, etaEnPalabras } from './ticket'
import type { AgencyBranch, CheckoutState } from './types'

const SEDE: AgencyBranch = {
  agency: 'SHALOM', id: '77', name: 'Juliaca Centro', district: 'Juliaca',
  province: 'San Román', department: 'Puno', address: 'Jr. San Martín 456', lat: null, lng: null,
}

function agencia(over: Partial<CheckoutState> = {}): CheckoutState {
  return {
    ...initialCheckoutState('pack-1'),
    customerInfo: { dni: '12345678', whatsapp: '999111222', receiverName: 'Rosa Quispe' },
    locationType: 'PROVINCIA',
    deliveryMethod: 'AGENCIA',
    pickup: { agency: 'SHALOM', branchId: '77', freeText: null },
    provinciaConfig: {
      department: 'Puno', province: 'San Román', district: 'Juliaca', city: 'Juliaca', eta: '48h',
      lat: null, lng: null, coverageResult: 'IN_ZONE',
    },
    advanceAmount: 95,
    ...over,
  }
}

function domicilioLima(over: Partial<CheckoutState> = {}): CheckoutState {
  return {
    ...initialCheckoutState('pack-1'),
    customerInfo: { dni: '12345678', whatsapp: '999111222', receiverName: 'Luis Paredes' },
    locationType: 'LIMA',
    deliveryMethod: 'DOMICILIO',
    limaAddress: {
      department: 'Lima', province: 'Lima', district: 'Comas', lat: null, lng: null,
      addressText: 'Av. Túpac Amaru 1200', reference: 'frente al grifo',
    },
    advanceAmount: 0,
    ...over,
  }
}

describe('ticket · agencia con adelanto pagado', () => {
  const t = buildTicket({ state: agencia(), price: 189, packName: 'Pack x2', paid: true, unpaid: false, branch: SEDE })

  it('dice cuánto entró y de cuánto', () => {
    expect(t.payment).toBe('Pago recibido por Yape: S/ 95 de S/ 189.')
  })
  it('nombra la sede con su dirección, no un id', () => {
    const recojo = t.lines.find(l => l.label === 'Lo recoges en')!
    expect(recojo.value).toBe('Shalom · Juliaca Centro')
    expect(recojo.detail).toBe('Jr. San Martín 456, Juliaca')
    expect(JSON.stringify(t)).not.toContain('"77"')
  })
  it('el saldo se paga con Yape desde el enlace, nunca en la agencia, y suelta la clave', () => {
    expect(t.balance?.value).toBe('S/ 94')
    expect(t.balance?.detail).toMatch(/con Yape desde el enlace de tu pedido/)
    expect(t.balance?.detail).toMatch(/Nunca en la agencia/)
    expect(t.balance?.detail).toMatch(/clave de recojo/)
  })
  it('ninguna frase del ticket dice "app": quien no sabe qué es una app no la entiende', () => {
    expect(JSON.stringify(t)).not.toMatch(/\bapp\b/i)
  })
  it('sin guía todavía, el ticket no la promete', () => {
    expect(t.guide).toBeNull()
  })
  it('qué llevar: DNI y la clave', () => {
    expect(t.bring[0]).toBe('Tu DNI')
    expect(t.bring[1]).toMatch(/clave de recojo/)
    expect(t.bring[1]).toMatch(/pagas el saldo/)
  })
  it('qué sigue: aviso al celular, sin nombrar canal, con el plazo del courier', () => {
    expect(t.next).toBe('Te avisaremos a tu celular cuando tu pedido llegue a la agencia. Suele tardar 2 días.')
    expect(t.next).not.toMatch(/WhatsApp|SMS|push/i)
  })
  it('a nombre de quien recibe', () => {
    expect(t.lines.find(l => l.label === 'A nombre de')?.value).toBe('Rosa Quispe')
  })
})

describe('ticket · la guía ya salió', () => {
  it('Shalom: el número como lo nombra su voucher, y el botón con su nombre', () => {
    const t = buildTicket({
      state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE,
      guide: { courier: 'SHALOM', numero: '80574902', codigo: 'CJTW', oseId: null, href: '/guia/tok' },
    })
    expect(t.guide?.line).toEqual({ label: 'Guía Shalom', value: 'Nro. de orden 80574902 · Código CJTW' })
    expect(t.guide?.button).toBe('Shalom')
    expect(t.guide?.href).toBe('/guia/tok')
  })
  it('Shalom solo con orden de servicio (registrada a mano)', () => {
    const t = buildTicket({
      state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE,
      guide: { courier: 'SHALOM', numero: null, codigo: null, oseId: '5566', href: '/guia/tok' },
    })
    expect(t.guide?.line.value).toBe('Orden de servicio 5566')
  })
  it('Olva: número de guía y el PDF del courier si lo trajo', () => {
    const s = agencia({ pickup: { agency: 'OLVA', branchId: '9', freeText: null } })
    const t = buildTicket({
      state: s, price: 189, packName: null, paid: true, unpaid: false, branch: null,
      guide: { courier: 'OLVA', numero: '123456', codigo: null, oseId: null, href: 'https://olva.example/g.pdf' },
    })
    expect(t.guide?.line).toEqual({ label: 'Guía Olva', value: 'N.º 123456' })
    expect(t.guide?.button).toBe('Olva')
    expect(t.guide?.href).toBe('https://olva.example/g.pdf')
  })
  it('la clave de recojo nunca aparece, aunque la guía ya exista', () => {
    const t = buildTicket({
      state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE,
      guide: { courier: 'SHALOM', numero: '80574902', codigo: 'CJTW', oseId: null, href: '/guia/tok' },
    })
    expect(JSON.stringify(t)).not.toMatch(/clave de recojo es/)
  })
  it('a domicilio no hay guía que mostrar aunque llegue una', () => {
    const t = buildTicket({
      state: domicilioLima(), price: 140, packName: null, paid: true, unpaid: false, branch: null,
      guide: { courier: 'OLVA', numero: '1', codigo: null, oseId: null, href: '/guia/tok' },
    })
    expect(t.guide).toBeNull()
  })
})

describe('ticket · pagó el total en agencia', () => {
  const t = buildTicket({ state: agencia({ advanceAmount: 189 }), price: 189, packName: 'Pack x2', paid: true, unpaid: false, branch: SEDE })
  it('no queda saldo y la clave se la enviamos', () => {
    expect(t.balance).toBeNull()
    expect(t.bring[1]).toBe('Tu clave de recojo (te la enviaremos)')
  })
})

describe('ticket · la sede aún no cargó', () => {
  it('cae al distrito sin prometer una dirección', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: null })
    expect(t.lines.find(l => l.label === 'Lo recoges en')?.value).toBe('Shalom · Juliaca')
    expect(t.lines[0].value).toBe('Tu pack')
  })
  it('agencia sin listado usa el texto libre', () => {
    const s = agencia({ pickup: { agency: 'OTRO', branchId: null, freeText: 'Marvisur, terminal' } })
    const t = buildTicket({ state: s, price: 189, packName: null, paid: true, unpaid: false, branch: null })
    expect(t.lines.find(l => l.label === 'Lo recoges en')?.value).toBe('Agencia · Marvisur, terminal')
  })
})

describe('ticket · nunca "tu pago no existe"', () => {
  it('adelanto sin confirmar: pedido registrado y un asesor coordina', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: false, unpaid: false, branch: SEDE })
    expect(t.payment).toMatch(/^Pedido registrado/)
    expect(t.payment).toMatch(/S\/ 95/)
    expect(t.payment).not.toMatch(/no|error|falta/i)
  })
  it('eligió que lo llamen: lo dice sin caja de saldo', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: false, unpaid: true, branch: SEDE })
    expect(t.payment).toMatch(/asesor te escribe/)
    expect(t.balance).toBeNull()
  })
})

describe('ticket · domicilio en Lima, contraentrega', () => {
  const t = buildTicket({ state: domicilioLima(), price: 140, packName: 'Pack x1', paid: false, unpaid: false, branch: null })
  it('paga todo al recibir y no hay nada que llevar', () => {
    expect(t.payment).toBe('Pedido registrado. Pagas S/ 140 al recibir.')
    expect(t.balance).toBeNull()
    expect(t.bring).toEqual([])
  })
  it('la dirección con distrito y referencia', () => {
    const llega = t.lines.find(l => l.label === 'Llega a')!
    expect(llega.value).toBe('Av. Túpac Amaru 1200')
    expect(llega.detail).toBe('Comas · frente al grifo')
  })
  it('qué sigue: sale a tu dirección, sin plazo porque Lima no lo declara', () => {
    expect(t.next).toBe('Te avisaremos a tu celular cuando tu pedido salga a tu dirección.')
  })
})

describe('ticket · domicilio en Lima con adelanto', () => {
  it('el saldo se paga al recibir', () => {
    const t = buildTicket({ state: domicilioLima({ advanceAmount: 70 }), price: 140, packName: null, paid: true, unpaid: false, branch: null })
    expect(t.balance).toEqual({ label: 'Te falta pagar', value: 'S/ 70', detail: 'Lo pagas al recibir tu pedido.' })
  })
})

describe('etaEnPalabras', () => {
  it('traduce las formas del courier y descarta lo que no entiende', () => {
    expect(etaEnPalabras('48h')).toBe('2 días')
    expect(etaEnPalabras('72h')).toBe('3 días')
    expect(etaEnPalabras('24h')).toBe('24 horas')
    expect(etaEnPalabras('24h (dia anterior hasta las 11:59pm)')).toBe('24 horas')
    expect(etaEnPalabras('depende')).toBeNull()
    expect(etaEnPalabras(null)).toBeNull()
  })
})
