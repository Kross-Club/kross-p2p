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
  readLatPayload, readLatTracking,
} from '../../../supabase/functions/_shared/olva-lat.ts'
import {
  buildLatShipment, claveDeIdempotencia, dimsCmTexto, esIdempotente, esRastreable, esReconciliable,
  esRegistrado, leerDetalleLat, parseDimsCm, parseLatAgencies, parseLatHeadquarters,
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

describe('armado del envío (`POST /shipments`, doc de set-2026)', () => {
  const completo = {
    sender: { document: '20512345678', phone: '987654321', email: 'Ventas@Gadicaf.pe' },
    recipient: { name: 'Maria Quispe', document: '87654321', phone: '+51 912 345 678' },
    originHeadquarterId: '43',
    destinationAgencyCode: '347',
    weightKg: 2.5,
    description: 'Ropa',
    declaredValue: 89.9,
    whoPays: 'STORE',
    pin: '4821',
  }

  it('arma el body con los campos de la doc', () => {
    const r = buildLatShipment(completo)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toEqual({
      sender: { documentType: 'ruc', documentNumber: '20512345678', phone: '987654321', email: 'ventas@gadicaf.pe' },
      recipient: { documentType: 'dni', documentNumber: '87654321', fullName: 'MARIA QUISPE', phone: '912345678' },
      origin: { headquarterId: '43' },
      destination: { agencyCode: '347' },
      package: { weightKg: 2.5, description: 'Ropa', declaredValue: 89.9, insuranceAccepted: false },
      whoPays: 'STORE',
      deliveryType: 'O',
      pin: '4821',
      confirm: true,
    })
  })

  it('el remitente va con RUC o con DNI, y su tipo de documento sale del largo', () => {
    const dni = buildLatShipment({ ...completo, sender: { ...completo.sender, document: '12345678' } })
    expect(dni.ok && (dni.body.sender as { documentType: string }).documentType).toBe('dni')
    const r = buildLatShipment({ ...completo, sender: { ...completo.sender, document: '123' } })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan.join(' ')).toContain('documento del remitente')
  })

  it('solo se sobrescribe lo del remitente que la marca configuró: Olva completa el resto con su lookup', () => {
    const r = buildLatShipment({ ...completo, sender: { document: '20512345678', phone: '12', email: 'no-es-correo' } })
    expect(r.ok && r.body.sender).toEqual({ documentType: 'ruc', documentNumber: '20512345678' })
  })

  it('con dimensiones va como PAQUETE (tipo 2); sin ellas no se declara tipo', () => {
    const conDims = buildLatShipment({ ...completo, dimsCm: '20 x 15 x 10' })
    expect(conDims.ok && conDims.body.package).toMatchObject({ shipmentType: 2, lengthCm: 20, widthCm: 15, heightCm: 10 })
    const sinDims = buildLatShipment({ ...completo, dimsCm: '20x15' })
    expect(sinDims.ok && (sinDims.body.package as Record<string, unknown>).shipmentType).toBeUndefined()
  })

  it('dice TODO lo que falta de una vez, no el primer error', () => {
    const r = buildLatShipment({
      sender: {}, recipient: {}, originHeadquarterId: null, destinationAgencyCode: null,
      weightKg: null, description: null, pin: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // remitente + 3 del destinatario + origen + destino + peso + contenido + clave
    expect(r.faltan).toHaveLength(9)
  })

  it('un peso imposible es un dato faltante, no un envío raro', () => {
    for (const weightKg of [0, -1, 500, NaN]) {
      const r = buildLatShipment({ ...completo, weightKg })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.faltan.join(' ')).toContain('peso')
    }
  })

  it('quién paga cae a la marca (STORE) si viene algo raro: ONLINE dejaría el envío sin registrar', () => {
    for (const whoPays of ['ONLINE', 'x', null, undefined]) {
      const r = buildLatShipment({ ...completo, whoPays })
      expect(r.ok && r.body.whoPays).toBe('STORE')
    }
    const dest = buildLatShipment({ ...completo, whoPays: 'DESTINATION' })
    expect(dest.ok && dest.body.whoPays).toBe('DESTINATION')
  })

  it('la clave de recojo es nuestra y va en el body', () => {
    const r = buildLatShipment({ ...completo, pin: '12' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.faltan.join(' ')).toContain('clave')
  })
})

describe('dimensiones', () => {
  it('lee `LxAxH` con tolerancia y normaliza', () => {
    expect(parseDimsCm('20x15x10')).toEqual({ lengthCm: 20, widthCm: 15, heightCm: 10 })
    expect(dimsCmTexto(' 20 × 15.5 * 10 ')).toBe('20x15.5x10')
  })
  it('rechaza lo que no son tres lados razonables', () => {
    for (const v of ['20x15', '0x1x1', '300x1x1', 'axbxc', '', null]) expect(parseDimsCm(v)).toBeNull()
  })
})

describe('la clave de idempotencia', () => {
  it('es la misma para el mismo pedido y el mismo envío: un reintento no duplica', () => {
    const body = { a: 1 }
    expect(claveDeIdempotencia('ORD-1', body)).toBe(claveDeIdempotencia('ORD-1', { a: 1 }))
    expect(claveDeIdempotencia('ORD-1', body)).toMatch(/^kross-ORD-1-[0-9a-f]{8}$/)
  })
  it('cambia si cambió el envío o el pedido: una corrección no se choca con la respuesta vieja', () => {
    expect(claveDeIdempotencia('ORD-1', { a: 1 })).not.toBe(claveDeIdempotencia('ORD-1', { a: 2 }))
    expect(claveDeIdempotencia('ORD-1', { a: 1 })).not.toBe(claveDeIdempotencia('ORD-2', { a: 1 }))
  })
  it('y por eso sí se puede reintentar, aunque siga sin haber cómo buscar por nuestro código', () => {
    expect(esIdempotente).toBe(true)
    expect(esReconciliable).toBe(false)
  })
})

describe('lectura de la respuesta del registro', () => {
  const RESPUESTA = {
    success: true,
    data: {
      sessionId: '65c0840b-x', uuid: '1d8ddcf8-x', status: 'REGISTERED', registrationNumber: '202600679978',
      cost: 8, igv: 1.22,
      label: { filename: 'rotulo-65c0840b.pdf', mimeType: 'application/pdf', pdfBase64: 'JVBERi0...' },
      origin: { headquarter: 'LIMA' }, destination: { officeId: '347' },
      securityPin: '7033', notificationTriggered: true, id: 'cmu2gwn3f000101pgxq6c37q4',
    },
  }

  it('lee el registro, el costo, la clave confirmada y el rótulo — y la guía todavía no existe', () => {
    const r = parseLatShipment(RESPUESTA)
    expect(r).toMatchObject({
      status: 'REGISTERED', registrationNumber: '202600679978', id: 'cmu2gwn3f000101pgxq6c37q4',
      cost: 8, securityPin: '7033', labelBase64: 'JVBERi0...', labelFilename: 'rotulo-65c0840b.pdf',
      trackingNumber: null,
    })
    expect(esRegistrado(r)).toBe(true)
    expect(esRastreable(r)).toBe(false)
  })

  it('PENDING_PAYMENT y DRAFT no son un registro: no hay guía por venir', () => {
    expect(esRegistrado(parseLatShipment({ data: { status: 'PENDING_PAYMENT', registrationNumber: '1' } }))).toBe(false)
    expect(esRegistrado(parseLatShipment({ data: { status: 'DRAFT' } }))).toBe(false)
    expect(esRegistrado(parseLatShipment({ data: { status: 'REGISTERED' } }))).toBe(false)
  })

  it('si por excepción la guía ya viene, se toma — pero solo con forma de guía', () => {
    expect(parseLatShipment({ data: { status: 'REGISTERED', registrationNumber: '1', trackingNumber: '17491234' } }).trackingNumber).toBe('17491234')
    expect(parseLatShipment({ data: { status: 'REGISTERED', registrationNumber: '1', trackingNumber: 'PENDIENTE' } }).trackingNumber).toBeNull()
  })

  it('una clave que no son 4 dígitos se descarta y queda la nuestra', () => {
    expect(parseLatShipment({ data: { status: 'REGISTERED', securityPin: 'abcd' } }).securityPin).toBeNull()
  })

  it('no revienta con basura', () => {
    expect(parseLatShipment(null).status).toBeNull()
    expect(parseLatShipment('x').registrationNumber).toBeNull()
  })
})

describe('el detalle (`GET /shipments/:id`): esperar la guía', () => {
  it('lee la guía cuando Olva ya la asignó, esté donde esté', () => {
    expect(leerDetalleLat({ data: { trackingNumber: '17491234', status: 'REGISTERED' } })).toEqual({
      trackingNumber: '17491234', status: 'REGISTERED', registrationNumber: null,
    })
    expect(leerDetalleLat({ id: 'x', responsePayload: { registrationNumber: '202600679978' }, trackingNumber: null }))
      .toEqual({ trackingNumber: null, status: null, registrationNumber: '202600679978' })
  })
  it('un tracking sin forma de guía no es guía', () => {
    expect(leerDetalleLat({ trackingNumber: 'pendiente' }).trackingNumber).toBeNull()
    expect(leerDetalleLat(null).trackingNumber).toBeNull()
  })
})

describe('las sedes de origen (`GET /catalog/headquarters`)', () => {
  it('lee el catálogo envuelto o pelado, con los nombres razonables', () => {
    expect(parseLatHeadquarters({ data: [{ id: 43, name: 'LIMA', district: 'LIMA' }, { headquarterId: '7', headquarter: 'AREQUIPA' }, { x: 1 }] }))
      .toEqual([{ id: '43', nombre: 'LIMA · LIMA' }, { id: '7', nombre: 'AREQUIPA' }])
    expect(parseLatHeadquarters([{ id: '1' }])).toEqual([{ id: '1', nombre: '1' }])
    expect(parseLatHeadquarters(null)).toEqual([])
  })
})
