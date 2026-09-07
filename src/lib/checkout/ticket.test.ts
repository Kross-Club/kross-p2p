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

const GUIA = { courier: 'SHALOM', numero: '80574902', codigo: 'CJTW', oseId: null, href: '/guia/tok' }
const etiquetas = (t: ReturnType<typeof buildTicket>) => t.pasos.map(p => `${p.estado}:${p.label}`)

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
  it('el recorrido: el pago hecho, la guía en curso y lo que viene', () => {
    expect(etiquetas(t)).toEqual([
      'hecho:Pago recibido',
      'actual:Guía de envío emitida',
      'pendiente:En camino a Shalom',
      'pendiente:Llegó a la agencia',
      'pendiente:Recojo',
    ])
  })
  // El texto se acortó el 07-set-2026: explicaba la mecánica del pago en un
  // momento en que todavía no toca. Lo que sostiene el sentido es el BOTÓN
  // apagado —para que lo reconozca cuando se encienda— y las tres palabras que
  // evitan que pague en efectivo en el mostrador y se quede sin clave.
  it('el saldo vive en el paso donde se paga, y enseña su botón apagado', () => {
    const llegada = t.pasos.find(p => p.label === 'Llegó a la agencia')!
    expect(llegada.detail).toMatch(/saldo de S\/ 94/)
    expect(llegada.detail).toMatch(/clave de recojo/)
    expect(llegada.accion).toBe('Pagar S/ 94 con Yape')
  })

  it('sin saldo no hay botón que enseñar', () => {
    const sinSaldo = buildTicket({ state: agencia({ advanceAmount: 189 }), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE })
    expect(sinSaldo.pasos.find(p => p.label === 'Llegó a la agencia')?.accion).toBeUndefined()
  })
  it('el DNI y la clave viven en el paso del recojo, con la sede', () => {
    expect(t.pasos.at(-1)?.detail).toBe('En Shalom · Juliaca Centro, con tu DNI y tu clave de recojo.')
  })
  it('el plazo del courier va en "en camino", sin nombrar canal de aviso', () => {
    expect(t.pasos.find(p => p.label === 'En camino a Shalom')?.detail).toBe('Suele tardar 2 días.')
    expect(JSON.stringify(t)).not.toMatch(/WhatsApp|SMS|push/i)
  })
  it('ninguna frase del ticket dice "app": quien no sabe qué es una app no la entiende', () => {
    expect(JSON.stringify(t)).not.toMatch(/\bapp\b/i)
  })
  it('sin guía todavía, el ticket no la promete', () => {
    expect(t.guide).toBeNull()
  })
  // "La persona que recoge", no "a nombre de" (07-set-2026): el ticket se
  // reenvía y quien va al mostrador puede no ser quien compró. El DNI va AL
  // COSTADO del nombre porque allí se leen juntos.
  it('nombra a quien recoge, con su DNI al costado', () => {
    const quien = t.lines.find(l => l.label === 'La persona que recoge')!
    expect(quien.value).toBe('Rosa Quispe')
    expect(quien.aside).toBe('DNI 12345678')
  })

  it('a domicilio nadie recoge: recibe, y sin DNI porque no hay mostrador', () => {
    const t2 = buildTicket({ state: domicilioLima(), price: 140, packName: null, paid: false, unpaid: false, branch: null })
    const quien = t2.lines.find(l => l.label === 'La persona que recibe')!
    expect(quien).toBeTruthy()
    expect(quien.aside).toBeUndefined()
  })
})

describe('ticket · la guía ya salió', () => {
  it('Shalom: el número como lo nombra su voucher, y el botón con su nombre', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE, guide: GUIA })
    expect(t.guide?.line).toEqual({ label: 'Guía Shalom', value: 'Nro. de orden 80574902 · Código CJTW' })
    expect(t.guide?.button).toBe('Shalom')
    expect(t.guide?.href).toBe('/guia/tok')
  })
  it('el recorrido avanza: guía hecha, en camino en curso', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE, guide: GUIA })
    expect(etiquetas(t).slice(0, 3)).toEqual(['hecho:Pago recibido', 'hecho:Guía de envío emitida', 'actual:En camino a Shalom'])
    expect(t.pasos[1].detail).toBe('Guía Shalom: Nro. de orden 80574902 · Código CJTW')
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
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: SEDE, guide: GUIA })
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
  it('la llegada no habla de saldo y la clave se la enviamos', () => {
    const llegada = t.pasos.find(p => p.label === 'Llegó a la agencia')!
    expect(llegada.detail).toBe('Te avisaremos a tu celular, con tu clave de recojo.')
    expect(JSON.stringify(t)).not.toMatch(/saldo/i)
  })
})

describe('ticket · la sede aún no cargó', () => {
  it('cae al distrito sin prometer una dirección', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: true, unpaid: false, branch: null })
    expect(t.lines.find(l => l.label === 'Lo recoges en')?.value).toBe('Shalom · Juliaca')
    expect(t.lines[0].value).toBe('Tu pack')
    expect(t.pasos.at(-1)?.detail).toBe('En Shalom · Juliaca, con tu DNI y tu clave de recojo.')
  })
  it('agencia sin listado usa el texto libre', () => {
    const s = agencia({ pickup: { agency: 'OTRO', branchId: null, freeText: 'Marvisur, terminal' } })
    const t = buildTicket({ state: s, price: 189, packName: null, paid: true, unpaid: false, branch: null })
    expect(t.lines.find(l => l.label === 'Lo recoges en')?.value).toBe('Agencia · Marvisur, terminal')
  })
})

describe('ticket · nunca "tu pago no existe"', () => {
  it('adelanto sin confirmar: pedido registrado, un asesor coordina, y el recorrido no avanza', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: false, unpaid: false, branch: SEDE })
    expect(t.payment).toMatch(/^Pedido registrado/)
    expect(t.payment).toMatch(/S\/ 95/)
    expect(t.payment).not.toMatch(/no|error|falta/i)
    expect(etiquetas(t)[0]).toBe('actual:Pedido registrado')
    expect(t.pasos[0].detail).toMatch(/asesor/)
    expect(t.pasos.slice(1).every(p => p.estado === 'pendiente')).toBe(true)
  })
  it('eligió que lo llamen: lo dice, y el saldo no aparece como deuda', () => {
    const t = buildTicket({ state: agencia(), price: 189, packName: null, paid: false, unpaid: true, branch: SEDE })
    expect(t.payment).toMatch(/asesor te escribe/)
    expect(etiquetas(t)[0]).toBe('actual:Pedido registrado')
  })
})

describe('ticket · domicilio en Lima, contraentrega', () => {
  const t = buildTicket({ state: domicilioLima(), price: 140, packName: 'Pack x1', paid: false, unpaid: false, branch: null })
  it('paga todo al recibir, y no hay mostrador ni DNI de por medio', () => {
    expect(t.payment).toBe('Pedido registrado. Pagas S/ 140 al recibir.')
    expect(etiquetas(t)).toEqual([
      'hecho:Pedido registrado',
      'actual:Preparando tu pedido',
      'pendiente:En camino a Comas',
      'pendiente:Entrega',
    ])
    expect(t.pasos.at(-1)?.detail).toBe('Pagas S/ 140 al recibir.')
    expect(JSON.stringify(t)).not.toMatch(/DNI|clave|agencia/i)
  })
  it('la dirección con distrito y referencia', () => {
    const llega = t.lines.find(l => l.label === 'Llega a')!
    expect(llega.value).toBe('Av. Túpac Amaru 1200')
    expect(llega.detail).toBe('Comas · frente al grifo')
  })
  it('en camino avisa sin plazo, porque Lima no lo declara', () => {
    expect(t.pasos.find(p => p.label === 'En camino a Comas')?.detail).toBe('Te avisaremos a tu celular cuando salga.')
  })
})

describe('ticket · domicilio en Lima con adelanto', () => {
  it('el saldo se paga al recibir, en el paso de la entrega', () => {
    const t = buildTicket({ state: domicilioLima({ advanceAmount: 70 }), price: 140, packName: null, paid: true, unpaid: false, branch: null })
    expect(etiquetas(t)[0]).toBe('hecho:Pago recibido')
    expect(t.pasos[0].detail).toBe('S/ 70 por Yape.')
    expect(t.pasos.at(-1)?.detail).toBe('Pagas S/ 70 al recibir.')
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
