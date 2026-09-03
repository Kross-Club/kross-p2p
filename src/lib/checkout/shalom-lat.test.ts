// ─── Shalom LAT · el proveedor de contingencia ───────────────────────────────
// Shalom no tiene API oficial: las dos que usamos son de terceros. Este archivo
// prueba el módulo PURO de la contingencia (`_shared/shalom-lat.ts`), que es
// donde vive todo lo que se puede verificar sin llamar a nadie — y hace falta
// más que de costumbre, porque **su doc publica los requests pero no las
// respuestas**: cada lectura de acá es una búsqueda defensiva que tiene que
// aguantar que el proveedor mueva un campo de sitio.

import { describe, it, expect } from 'vitest'
import {
  buildLatRegisterPayload, buscarPendientePorDni, codigoDeResultado, demoraOf,
  derivePhase, esNoEncontrado, esRastreablePorLat, instanceIdOf, LAT_CONTENT,
  lecturaDeEvento, milestonesOf, numeroDeResultado, sesionActiva, trackBody,
  validLatSignature,
} from '../../../supabase/functions/_shared/shalom-lat.ts'
import { parseOrderResponse } from '../../../supabase/functions/_shared/shalom-orders.ts'

// ─── La fase ─────────────────────────────────────────────────────────────────

describe('deducir la fase', () => {
  it('lee los hitos cuando el proveedor los da, y gana el más avanzado', () => {
    expect(derivePhase({ status: { origen: { fecha: '2026-09-01' }, transito: { fecha: '2026-09-02' } } }))
      .toBe('EN_TRANSITO')
    expect(derivePhase({ entregado: { fecha: '2026-09-05' }, destino: { fecha: '2026-09-04' } }))
      .toBe('ENTREGADO')
  })

  it('un hito en null es un hito que NO ocurrió', () => {
    expect(derivePhase({ origen: null, transito: null, entregado: null })).toBe(null)
  })

  it('sin hitos, deduce por los TEXTOS del proveedor', () => {
    expect(derivePhase({ eventos: [{ descripcion: 'Paquete en tránsito a Piura' }] })).toBe('EN_TRANSITO')
    expect(derivePhase({ estado: 'DISPONIBLE PARA RECOJO' })).toBe('EN_DESTINO')
    expect(derivePhase({ estado: 'ENTREGADO AL DESTINATARIO' })).toBe('ENTREGADO')
  })

  it('NO lee los nombres de campo como si fueran estado', () => {
    // Si mirara las claves, este payload —que dice que nada ocurrió— saldría
    // ENTREGADO y dispararía el cierre del pedido.
    expect(derivePhase({ fecha_entregado: null, fecha_transito: null })).toBe(null)
  })

  it('REGISTRADO no es una fase (la guía existe, el paquete sigue en el almacén)', () => {
    expect(derivePhase({ registrado: { fecha: '2026-09-01' } })).toBe(null)
    expect(derivePhase({ estado: 'REGISTRADO' })).toBe(null)
  })

  it('la demora se lee aparte: no es una fase', () => {
    const payload = { transito: { fecha: '2026-09-02' }, demora: { fecha: '2026-09-03 10:00:00' } }
    expect(derivePhase(payload)).toBe('EN_TRANSITO')
    expect(demoraOf(payload)).toBe('2026-09-03 10:00:00')
    expect(demoraOf({ transito: { fecha: '2026-09-02' } })).toBe(null)
    // Marcada sin fecha: '' (marcada) ≠ null (no marcada).
    expect(demoraOf({ demora: { motivo: 'clima' } })).toBe('')
  })

  it('los hitos conocidos se recogen para el chat', () => {
    expect(Object.keys(milestonesOf({ data: { origen: { fecha: 'x' }, ruido: { a: 1 } } })))
      .toEqual(['origen'])
  })
})

// ─── El rastreo ──────────────────────────────────────────────────────────────

describe('rastrear', () => {
  it('exige numero Y codigo: sin código, LAT no puede rastrear', () => {
    expect(esRastreablePorLat({ numero: '66479331', codigo: '3KTH' })).toBe(true)
    expect(esRastreablePorLat({ numero: '66479331', codigo: null })).toBe(false)
    expect(esRastreablePorLat({ numero: null, codigo: '3KTH' })).toBe(false)
    expect(esRastreablePorLat({ numero: '664', codigo: '3KTH' })).toBe(false)
  })

  it('arma el body con los nombres del proveedor', () => {
    expect(trackBody({ numero: ' 6647-9331 ', codigo: '3kth' }))
      .toEqual({ orderNumber: '66479331', orderCode: '3KTH' })
  })

  it('correlaciona el lote por número de guía, esté donde esté', () => {
    expect(numeroDeResultado({ orderNumber: '66479331', estado: 'x' })).toBe('66479331')
    expect(numeroDeResultado({ data: { order: { numero: 66479332 } } })).toBe('66479332')
    expect(numeroDeResultado({ nada: 'que ver' })).toBe(null)
  })

  it('reconoce el "no existe" del proveedor sin inventarlo', () => {
    expect(esNoEncontrado({ ok: false, error: { code: 'not_found' } })).toBe(true)
    expect(esNoEncontrado({ mensaje: 'No se encontró la orden' })).toBe(true)
    expect(esNoEncontrado({ estado: 'EN TRANSITO' })).toBe(false)
  })

  it('lee el código de 4 con cualquiera de sus nombres', () => {
    expect(codigoDeResultado({ orderCode: '3kth' })).toBe('3KTH')
    expect(codigoDeResultado({ clave: '9ABC' })).toBe('9ABC')
    expect(codigoDeResultado({ codigo: 'DEMASIADO-LARGO' })).toBe(null)
  })
})

// ─── Emitir ──────────────────────────────────────────────────────────────────

const completo = () => ({
  instanceId: '2e656a02-7e37-4573-9d68-e76740d337dc',
  originTerminalId: '404',
  destinyTerminalId: '7',
  size: 'XS' as const,
  pickupCode: '2415',
  receiver: {
    dni: '45678912',
    name: 'Fabricio', lastName: 'Ramos', surName: 'Torres',
    phone: '987654321',
  },
})

describe('armar el envío de la contingencia', () => {
  it('con todo completo, arma el body de POST /account/register', () => {
    const r = buildLatRegisterPayload(completo())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toEqual({
      instanceId: '2e656a02-7e37-4573-9d68-e76740d337dc',
      origen: 404,
      destino: '7',
      content: 'PAQUETE XS',
      documento: '45678912',
      name: 'FABRICIO',
      firstname: 'RAMOS',
      lastname: 'TORRES',
      phone: 987654321,
      clave: '2415',
    })
  })

  it('el destino va como string y el origen como número (lo que pide su doc)', () => {
    const r = buildLatRegisterPayload(completo())
    if (!r.ok) throw new Error('debía armar')
    expect(typeof r.body.destino).toBe('string')
    expect(typeof r.body.origen).toBe('number')
  })

  it('el tamaño viaja como TEXTO — por eso puede emitir sin el catálogo del titular', () => {
    expect(LAT_CONTENT.SOBRE).toBe('SOBRE')
    expect(LAT_CONTENT.OTRA_MEDIDA).toBe('OTRA MEDIDA')
    const r = buildLatRegisterPayload({ ...completo(), size: 'L' })
    if (!r.ok) throw new Error('debía armar')
    expect(r.body.content).toBe('PAQUETE L')
  })

  it('sin nombres de RENIEC no emite: LAT no tiene person_id', () => {
    const r = buildLatRegisterPayload({
      ...completo(),
      receiver: { ...completo().receiver, lastName: null },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan).toContain('nombre y apellidos del destinatario (RENIEC)')
  })

  it('dice TODO lo que falta de una vez, no el primer error', () => {
    const r = buildLatRegisterPayload({
      instanceId: '', originTerminalId: '', destinyTerminalId: '', size: null, pickupCode: '12',
      receiver: { dni: '123', phone: '11', name: null, lastName: null, surName: null },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan.length).toBeGreaterThanOrEqual(7)
  })

  it('el teléfono se queda con los 9 dígitos finales (tolera el +51)', () => {
    const r = buildLatRegisterPayload({
      ...completo(),
      receiver: { ...completo().receiver, phone: '+51 987 654 321' },
    })
    if (!r.ok) throw new Error('debía armar')
    expect(r.body.phone).toBe(987654321)
  })
})

describe('no emitir dos veces', () => {
  it('encuentra en los pendientes la guía ya creada para ese DNI', () => {
    const pendientes = {
      shipments: [
        { documento: '11111111', orderNumber: '66000001', orderCode: 'AAAA' },
        { documento: '45678912', orderNumber: '66479331', orderCode: '3KTH' },
      ],
    }
    expect(buscarPendientePorDni(pendientes, '45678912')).toEqual({ numero: '66479331', codigo: '3KTH' })
  })

  it('no confunde el DNI con un pedazo de otro número', () => {
    const pendientes = { shipments: [{ documento: '456789120', orderNumber: '66479331', orderCode: '3KTH' }] }
    expect(buscarPendientePorDni(pendientes, '45678912')).toBe(null)
  })

  it('sin coincidencia devuelve null (y entonces sí se emite)', () => {
    expect(buscarPendientePorDni({ shipments: [] }, '45678912')).toBe(null)
    expect(buscarPendientePorDni(null, '45678912')).toBe(null)
  })
})

describe('leer la guía emitida', () => {
  it('la lectura compartida entiende también los nombres de LAT', () => {
    const g = parseOrderResponse({ orderNumber: '66479331', orderCode: '3KTH' })
    expect(g.numero).toBe('66479331')
    expect(g.codigo).toBe('3KTH')
  })
})

// ─── Instancias ──────────────────────────────────────────────────────────────

describe('instancias', () => {
  it('saca el instanceId prefiriendo el campo que lo nombra', () => {
    expect(instanceIdOf({ instanceId: '2e656a02-7e37-4573-9d68-e76740d337dc' }))
      .toBe('2e656a02-7e37-4573-9d68-e76740d337dc')
    expect(instanceIdOf({ data: { id: '2e656a02-7e37-4573-9d68-e76740d337dc' } }))
      .toBe('2e656a02-7e37-4573-9d68-e76740d337dc')
    expect(instanceIdOf({ nombre: 'Sucursal Principal' })).toBe(null)
  })

  it('ante la duda dice que NO hay sesión: un login de más cuesta menos que una emisión rechazada', () => {
    expect(sesionActiva({ loggedIn: true })).toBe(true)
    expect(sesionActiva({ status: 'connected' })).toBe(true)
    expect(sesionActiva({ status: 'disconnected' })).toBe(false)
    expect(sesionActiva({ raro: 1 })).toBe(false)
    expect(sesionActiva(null)).toBe(false)
  })
})

// ─── Webhook ─────────────────────────────────────────────────────────────────

const firmar = async (secret: string, data: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('firma del webhook', () => {
  const secret = 'un-secreto-de-prueba'
  const raw = '{"event":"tracking.updated","data":{"orderNumber":"66479331"}}'

  it('acepta el digest pelado del cuerpo, con y sin prefijo', async () => {
    const v = await firmar(secret, raw)
    expect(await validLatSignature(raw, v, secret)).toBe(true)
    expect(await validLatSignature(raw, `sha256=${v}`, secret)).toBe(true)
  })

  it('acepta el formato con timestamp y rechaza el viejo (anti-replay)', async () => {
    const now = 1_800_000_000_000
    const t = Math.floor(now / 1000)
    const v1 = await firmar(secret, `${t}.${raw}`)
    expect(await validLatSignature(raw, `t=${t},v1=${v1}`, secret, now)).toBe(true)
    // Diez minutos después, el mismo evento ya no vale.
    expect(await validLatSignature(raw, `t=${t},v1=${v1}`, secret, now + 600_000)).toBe(false)
  })

  it('rechaza firma equivocada, vacía o de otro cuerpo', async () => {
    expect(await validLatSignature(raw, await firmar('otro', raw), secret)).toBe(false)
    expect(await validLatSignature(raw, null, secret)).toBe(false)
    expect(await validLatSignature(raw, '', secret)).toBe(false)
    expect(await validLatSignature(raw, await firmar(secret, `${raw} `), secret)).toBe(false)
  })
})

describe('leer el evento del webhook', () => {
  it('saca guía y fase de un evento con la forma que sea', () => {
    const l = lecturaDeEvento({
      event: 'tracking.updated',
      data: { orderNumber: '66479331', orderCode: '3KTH', estado: 'EN DESTINO' },
    })
    expect(l.numero).toBe('66479331')
    expect(l.codigo).toBe('3KTH')
    expect(l.phase).toBe('EN_DESTINO')
  })

  it('reconoce el ping de verificación de propiedad', () => {
    const l = lecturaDeEvento({ event: 'webhook.ping', data: { challenge: 'abc123' } })
    expect(l.challenge).toBe('abc123')
    expect(l.numero).toBe(null)
  })
})
