// ─── Generador de guías Shalom · el armado del envío ─────────────────────────
// Prueba el ÚNICO módulo puro del generador (`_shared/shalom-orders.ts`), que
// vive del lado de las Edge Functions pero no toca Deno ni red a propósito:
// emitir una guía cuesta plata y no tiene sandbox, así que lo que se puede
// verificar gratis —qué se manda y cómo se lee la respuesta— se verifica acá.

import { describe, it, expect } from 'vitest'
// El fuente del panel como texto (vite `?raw`): la prueba de abajo compara las
// dos listas de tamaños, no el render.
import panelSource from '../../pages/vendedor/ProductosPage.tsx?raw'
import {
  buildOrderPayload, esRastreable, isPackageSize, PACKAGE_SIZES, parseOrderResponse,
} from '../../../supabase/functions/_shared/shalom-orders.ts'

const completo = () => ({
  orderRef: 'KSH-1042',
  origenBranchId: '6',
  destinoBranchId: '2',
  remitente: { nombre: 'Kross Shop' },
  destinatario: { nombre: 'Fabricio Ramos', dni: '45678912', telefono: '987654321' },
  paquete: { size: 'XXS', contenido: 'Aceite de Orégano 6000mg', valorDeclarado: 189 },
})

describe('armar el envío', () => {
  it('con todo completo, arma el payload', () => {
    const r = buildOrderPayload(completo())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body.sede_origen).toBe('6')
    expect(r.body.sede_destino).toBe('2')
    expect(r.body.referencia_externa).toBe('KSH-1042')
  })

  it('el saldo NUNCA viaja como contra-entrega: se paga por la app', () => {
    const r = buildOrderPayload(completo())
    expect(r.ok && r.body.pago_contra_entrega).toBe(false)
  })

  it('dice TODO lo que falta de una vez, no el primer error', () => {
    const r = buildOrderPayload({
      ...completo(),
      origenBranchId: '',
      destinatario: { nombre: '', dni: '123', telefono: '' },
      paquete: { size: null, contenido: '', valorDeclarado: 0 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // Quien lee esto está por completar un formulario: seis campos en seis
    // intentos convierte una corrección en una tarde.
    expect(r.faltan.length).toBeGreaterThanOrEqual(6)
    expect(r.faltan.join(' ')).toMatch(/origen/i)
    expect(r.faltan.join(' ')).toMatch(/DNI/i)
    expect(r.faltan.join(' ')).toMatch(/tamaño/i)
  })

  it('un tamaño fuera de la escala del proveedor no pasa', () => {
    // Un "XXL" que la API no conoce es un 400 con el paquete ya empacado.
    const r = buildOrderPayload({ ...completo(), paquete: { ...completo().paquete, size: 'XXL' } })
    expect(r.ok).toBe(false)
    expect(isPackageSize('XXL')).toBe(false)
    expect(isPackageSize('XXS')).toBe(true)
  })

  it('el celular se normaliza a los 9 dígitos peruanos', () => {
    const r = buildOrderPayload({
      ...completo(),
      destinatario: { ...completo().destinatario, telefono: '+51 987 654 321' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.body.destinatario as { telefono: string }).telefono).toBe('987654321')
  })

  it('sin valor declarado no se manda: es la cobertura del paquete', () => {
    const r = buildOrderPayload({ ...completo(), paquete: { ...completo().paquete, valorDeclarado: 0 } })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan.join(' ')).toMatch(/valor declarado/i)
  })

  it('una sede de destino vacía no se disfraza de envío válido', () => {
    const r = buildOrderPayload({ ...completo(), destinoBranchId: '' })
    expect(r.ok).toBe(false)
  })
})

describe('leer la guía que devuelve el proveedor', () => {
  it('la encuentra anidada, sin casarse con la forma de la respuesta', () => {
    const g = parseOrderResponse({ data: { envio: { numero: '12345678', codigo: 'ab12' }, ose_id: '99001' } })
    expect(g.numero).toBe('12345678')
    expect(g.codigo).toBe('AB12')
    expect(g.oseId).toBe('99001')
    expect(esRastreable(g)).toBe(true)
  })

  it('acepta los nombres alternativos de la guía', () => {
    const g = parseOrderResponse({ guia: '87654321', clave: 'Z9X8' })
    expect(g.numero).toBe('87654321')
    expect(g.codigo).toBe('Z9X8')
  })

  it('descarta lo que NO tiene forma de guía en vez de escribirlo en el pedido', () => {
    // Un "numero" de 4 dígitos no se rastrea: escribirlo dejaría el pedido con
    // una guía falsa y al comprador buscando algo que no existe.
    const g = parseOrderResponse({ numero: '123', codigo: 'no-es-codigo' })
    expect(g.numero).toBeNull()
    expect(g.codigo).toBeNull()
    expect(esRastreable(g)).toBe(false)
  })

  it('solo con ose_id ya es rastreable (la API lo acepta solo)', () => {
    expect(esRastreable(parseOrderResponse({ ose_id: '4455' }))).toBe(true)
  })

  it('una respuesta vacía o rara no revienta', () => {
    expect(esRastreable(parseOrderResponse(null))).toBe(false)
    expect(esRastreable(parseOrderResponse('no soy json'))).toBe(false)
    expect(esRastreable(parseOrderResponse([{ nada: 1 }]))).toBe(false)
  })
})

describe('la escala de tamaños no se desincroniza', () => {
  it('el panel ofrece exactamente los tamaños que el backend acepta', () => {
    // La lista vive en dos lados a propósito —el panel no importa código de las
    // Edge Functions— y por eso se vigila: si el panel ofreciera un tamaño que
    // el backend descarta, el vendedor lo elegiría, se guardaría NULL y su
    // producto dejaría de generar guías sin que nada avise.
    const linea = panelSource.match(/const PACKAGE_SIZES = \[(.+?)\] as const/)
    expect(linea, 'ProductosPage debe declarar PACKAGE_SIZES').toBeTruthy()
    const enElPanel = [...linea![1].matchAll(/'([A-Z]+)'/g)].map(m => m[1])
    expect(enElPanel).toEqual([...PACKAGE_SIZES])
  })
})
