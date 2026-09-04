// ─── Olva LAT · el segundo riel de Olva ──────────────────────────────────────
// Se prueba lo NUESTRO, que es lo que decide plata: cómo se traduce el estado
// del proveedor a la fase del pedido —la fase dispara la cobranza del saldo— y
// qué se le manda cuando se registra un envío, que cuesta y no tiene sandbox.
//
// El dominio del proveedor está bloqueado por egress desde estas sesiones (la
// misma condición con la que se escribieron los tests de 360pay y del primer
// riel de Olva), así que nada de esto llama a nadie: son módulos puros.

import { describe, expect, it } from 'vitest'
import {
  firmaVigente, isLatStatus, parseLatSignature, parseLatTracking,
  normalizeYear, readLatPayload, readLatTracking,
} from '../../../supabase/functions/_shared/olva-lat.ts'
import {
  buildLatShipment, esRastreable, esReconciliable, parseLatAgencies,
  parseLatShipment, resolveAgencyCode,
} from '../../../supabase/functions/_shared/olva-lat-orders.ts'

const vacio = { trackingNumber: null, status: null, statusDetail: null, origin: { agency: null, department: null }, destination: { agency: null, department: null }, estimatedDelivery: null, deliveredAt: null, events: [] }

describe('estado del proveedor → fase del pedido', () => {
  it('mapea el enum a la fase canónica', () => {
    expect(readLatTracking({ ...vacio, status: 'IN_TRANSIT' }).phase).toBe('EN_TRANSITO')
    expect(readLatTracking({ ...vacio, status: 'READY_FOR_PICKUP' }).phase).toBe('EN_DESTINO')
    expect(readLatTracking({ ...vacio, status: 'OUT_FOR_DELIVERY' }).phase).toBe('EN_DESTINO')
    expect(readLatTracking({ ...vacio, status: 'DELIVERED' }).phase).toBe('ENTREGADO')
  })

  it('REGISTERED no es EN_ORIGEN — emitir la guía no es haberla dejado en la agencia', () => {
    // Es la regla de la casa (misma que Shalom y que el primer riel): entre
    // "emití la guía" y "el paquete salió" está el hueco donde se pierde la
    // plata, y EN_ORIGEN arranca la cobranza del saldo.
    expect(readLatTracking({ ...vacio, status: 'REGISTERED', statusDetail: 'Envío registrado' }).phase).toBeNull()
  })

  it('gana la fase más avanzada, venga en la cabecera o en un evento', () => {
    const t = {
      ...vacio,
      status: 'IN_TRANSIT' as const,
      events: [
        { date: '2026-08-18', status: 'REGISTERED' as const, detail: 'Envío registrado', location: 'LIMA' },
        { date: '2026-08-21', status: 'READY_FOR_PICKUP' as const, detail: 'Disponible', location: 'AREQUIPA' },
      ],
    }
    expect(readLatTracking(t).phase).toBe('EN_DESTINO')
    expect(readLatTracking({ ...t, events: [...t.events].reverse() }).phase).toBe('EN_DESTINO')
  })

  it('EN_ORIGEN solo lo puede decir el TEXTO, porque el enum no lo tiene', () => {
    const t = {
      ...vacio,
      status: 'UNKNOWN' as const,
      events: [{ date: null, status: null, detail: 'Admitido en agencia de origen', location: 'LIMA - MIRAFLORES' }],
    }
    expect(readLatTracking(t).phase).toBe('EN_ORIGEN')
  })

  it('el texto NO puede adelantar una fase que el enum ya fijó más atrás', () => {
    // "hacia agencia de destino" no puede valer más que el IN_TRANSIT que el
    // propio proveedor puso: cobrar el saldo con el paquete todavía viajando es
    // exactamente el error que esto evita.
    const t = {
      ...vacio,
      status: 'IN_TRANSIT' as const,
      statusDetail: 'En tránsito hacia agencia de destino',
    }
    expect(readLatTracking(t).phase).toBe('EN_TRANSITO')
  })

  it('DEVUELTO y RECHAZADO no son fases: salen aparte', () => {
    expect(readLatTracking({ ...vacio, status: 'RETURNED' })).toEqual({ phase: null, terminal: 'RETURNED' })
    expect(readLatTracking({ ...vacio, status: 'REJECTED' })).toEqual({ phase: null, terminal: 'REJECTED' })
  })

  it('un estado que no está en el enum no inventa fase', () => {
    expect(isLatStatus('EN_CAMINO')).toBe(false)
    expect(readLatPayload({ data: { status: 'EN_CAMINO' } }).phase).toBeNull()
  })
})

describe('lectura del payload del proveedor', () => {
  it('lee la respuesta envuelta en `data` y también el objeto pelado', () => {
    const data = { trackingNumber: '1234567890', status: 'IN_TRANSIT', events: [] }
    expect(parseLatTracking({ success: true, data })?.trackingNumber).toBe('1234567890')
    expect(parseLatTracking(data)?.trackingNumber).toBe('1234567890')
  })

  it('una respuesta a medias se lee igual: lo que falta queda en null', () => {
    const t = parseLatTracking({ data: { trackingNumber: 17491234, events: [{ detail: 'algo' }, 'basura'] } })
    expect(t?.trackingNumber).toBe('17491234')
    expect(t?.status).toBeNull()
    expect(t?.events).toHaveLength(1)
  })

  it('no revienta con basura', () => {
    expect(parseLatTracking(null)).toBeNull()
    expect(parseLatTracking('nope')).toBeNull()
  })
})

describe('firma del webhook', () => {
  it('parte el header tipo Stripe', () => {
    expect(parseLatSignature('t=1756900000,v1=abc123')).toEqual({ t: '1756900000', v1: 'abc123' })
    expect(parseLatSignature('v1=abc123')).toBeNull()
    expect(parseLatSignature(null)).toBeNull()
  })

  it('la ventana anti-replay son 5 minutos, en los dos sentidos', () => {
    const now = 1_756_900_000_000
    expect(firmaVigente('1756900000', now)).toBe(true)
    expect(firmaVigente(String(1_756_900_000 - 299), now)).toBe(true)
    expect(firmaVigente(String(1_756_900_000 - 301), now)).toBe(false)
    expect(firmaVigente(String(1_756_900_000 + 301), now)).toBe(false)
    expect(firmaVigente('ayer', now)).toBe(false)
  })
})

describe('código de agencia del proveedor', () => {
  const agencias = parseLatAgencies({
    agencies: [
      { code: 'LIM-MIR-01', name: 'MIRAFLORES', department: 'LIMA', province: 'LIMA', district: 'MIRAFLORES' },
      { code: 'ARE-MIR-01', name: 'MIRAFLORES', department: 'AREQUIPA', province: 'AREQUIPA', district: 'MIRAFLORES' },
      { code: 'ARE-CER-01', name: 'CERCADO', department: 'AREQUIPA', province: 'AREQUIPA', district: 'AREQUIPA' },
      { code: 'ARE-CER-02', name: 'AREQUIPA CENTRO', department: 'AREQUIPA', province: 'AREQUIPA', district: 'AREQUIPA' },
      { sin: 'codigo' },
    ],
  })

  it('lee el catálogo y descarta lo que no tiene código', () => {
    expect(agencias).toHaveLength(4)
  })

  it('con una sola sede en el distrito no hace falta el nombre', () => {
    expect(resolveAgencyCode(agencias, { district: 'Miraflores', department: 'LIMA' })).toBe('LIM-MIR-01')
  })

  it('desambigua el distrito homónimo por departamento', () => {
    expect(resolveAgencyCode(agencias, { district: 'MIRAFLORES', province: 'AREQUIPA', department: 'AREQUIPA' }))
      .toBe('ARE-MIR-01')
  })

  it('ante DUDA devuelve null: mandar a la agencia equivocada es perder el pedido', () => {
    // Dos sedes en el mismo distrito y ningún nombre que las separe.
    expect(resolveAgencyCode(agencias, { district: 'AREQUIPA', province: 'AREQUIPA', department: 'AREQUIPA' })).toBeNull()
  })

  it('el nombre separa cuando el distrito no alcanza, aunque el rótulo traiga de más', () => {
    expect(resolveAgencyCode(agencias, {
      name: 'TIENDA AREQUIPA CENTRO - AV. EJERCITO 123',
      district: 'AREQUIPA', province: 'AREQUIPA', department: 'AREQUIPA',
    })).toBe('ARE-CER-02')
  })

  it('sin distrito no se resuelve nada', () => {
    expect(resolveAgencyCode(agencias, { name: 'MIRAFLORES' })).toBeNull()
  })
})

describe('armado del envío', () => {
  const completo = {
    sender: { name: 'Gadicaf', document: '20512345678', phone: '987654321' },
    recipient: { name: 'Maria Quispe', document: '87654321', phone: '+51 912 345 678' },
    originAgencyCode: 'LIM-MIR-01',
    destinationAgencyCode: 'ARE-CER-01',
    weightKg: 2.5,
    description: 'Ropa',
  }

  it('arma el body con los campos de la doc', () => {
    const r = buildLatShipment(completo)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toEqual({
      sender: { name: 'GADICAF', document: '20512345678', phone: '987654321' },
      recipient: { name: 'MARIA QUISPE', document: '87654321', phone: '912345678' },
      origin: { agencyCode: 'LIM-MIR-01' },
      destination: { agencyCode: 'ARE-CER-01' },
      package: { weightKg: 2.5, description: 'Ropa' },
      service: 'REGULAR',
    })
  })

  it('el remitente puede ir con RUC o con DNI', () => {
    expect(buildLatShipment({ ...completo, sender: { ...completo.sender, document: '12345678' } }).ok).toBe(true)
    const r = buildLatShipment({ ...completo, sender: { ...completo.sender, document: '123' } })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan.join(' ')).toContain('documento del remitente')
  })

  it('dice TODO lo que falta de una vez, no el primer error', () => {
    const r = buildLatShipment({
      sender: {}, recipient: {}, originAgencyCode: null, destinationAgencyCode: null,
      weightKg: null, description: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // 3 del remitente + 3 del destinatario + origen + destino + peso + contenido
    expect(r.faltan).toHaveLength(10)
  })

  it('un peso imposible es un dato faltante, no un envío raro', () => {
    for (const weightKg of [0, -1, 500, NaN]) {
      const r = buildLatShipment({ ...completo, weightKg })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.faltan.join(' ')).toContain('peso')
    }
  })

  it('un servicio inventado cae a REGULAR en vez de viajar al proveedor', () => {
    const r = buildLatShipment({ ...completo, service: 'SUPERSONICO' })
    expect(r.ok && (r.body.service as string)).toBe('REGULAR')
  })
})

describe('lectura de la respuesta del registro', () => {
  it('encuentra la guía aunque venga anidada', () => {
    const g = parseLatShipment({ success: true, data: { shipment: { trackingNumber: '17491234', id: 'ship_9' } } })
    expect(g.numero).toBe('17491234')
    expect(g.orderId).toBe('ship_9')
    expect(esRastreable(g)).toBe(true)
  })

  it('lo que no tiene forma de guía se descarta — escribir basura es peor que nada', () => {
    const g = parseLatShipment({ trackingNumber: 'PENDIENTE', orderNumber: '123' })
    expect(g.numero).toBeNull()
    expect(esRastreable(g)).toBe(false)
  })

  it('toma el PDF de la guía cuando la respuesta trae una URL', () => {
    expect(parseLatShipment({ numero: '17491234', rotulo: 'https://x.test/g/17491234.pdf' }).pdfUrl)
      .toBe('https://x.test/g/17491234.pdf')
  })

  it('en Olva basta el número para rastrear: no hay código como en Shalom', () => {
    expect(esRastreable({ numero: '17491234', orderId: null, pdfUrl: null })).toBe(true)
  })
})

describe('el año de emisión (`orderCode`)', () => {
  // Su doc: "orderCode — Año de emisión (2 dígitos). Opcional; por defecto el
  // año en curso." Ese default es la trampa: una guía de diciembre consultada en
  // enero se buscaría contra el año equivocado y volvería como inexistente. El
  // pedido ya guarda ese año en `tracking_year` porque el primer riel lo exige,
  // así que lo que se prueba acá es que las dos puntas hablan el mismo formato.
  it('el año que guarda el pedido es el formato que el proveedor espera: YY', () => {
    const dic2025 = Date.UTC(2025, 11, 20, 18, 0, 0)
    expect(normalizeYear(null, dic2025)).toBe('25')
    expect(normalizeYear('2025', dic2025)).toBe('25')
    expect(normalizeYear('25', dic2025)).toBe('25')
    expect(normalizeYear('veinticinco', dic2025)).toBeNull()
  })

  it('el corte de año se decide en hora de Lima, no en UTC', () => {
    // 1-ene 03:00 UTC es todavía 31-dic en Lima (UTC-5): una guía registrada esa
    // noche es del año viejo, y preguntar por el nuevo la deja sin rastrear.
    expect(normalizeYear(null, Date.UTC(2026, 0, 1, 3, 0, 0))).toBe('25')
    expect(normalizeYear(null, Date.UTC(2026, 0, 1, 6, 0, 0))).toBe('26')
  })
})

describe('lo que el proveedor NO da', () => {
  it('no se puede reconciliar: no publica cómo listar envíos', () => {
    // Esta constante es el motivo por el que `olva-order` NO reintenta nunca,
    // ni siquiera un 5xx. Si algún día el proveedor publica ese endpoint, este
    // test es el que avisa que la defensa se puede volver a encender.
    expect(esReconciliable).toBe(false)
  })
})
