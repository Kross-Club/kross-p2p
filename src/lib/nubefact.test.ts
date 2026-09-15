import { describe, expect, it } from 'vitest'
import {
  armarBoleta, clienteDeBoleta, consultaDeBoleta, esRuc, esSerieDeBoleta, fechaDeEmision,
  leerRespuesta, limpiarTexto, lineaDeBoleta, puedeFacturar, redondear2,
} from '../../supabase/functions/_shared/nubefact.ts'

describe('la aritmética del IGV, hacia atrás desde el precio que ya lo incluye', () => {
  it('extrae el IGV de un precio con IGV y las tres cifras cuadran', () => {
    const l = lineaDeBoleta({ descripcion: 'Creatina', cantidad: 1, precioConIgv: 118 })
    expect(l.total).toBe(118)
    expect(l.subtotal).toBe(100)
    expect(l.igv).toBe(18)
    expect(l.precio_unitario).toBe(118)
    expect(l.valor_unitario).toBe(100)
    expect(l.tipo_de_igv).toBe(1)
    expect(l.unidad_de_medida).toBe('NIU')
  })
  it('con un precio que no divide exacto, subtotal + igv sigue siendo el total', () => {
    for (const precio of [2, 7, 150, 189, 99.9, 33.33]) {
      const l = lineaDeBoleta({ descripcion: 'x', cantidad: 1, precioConIgv: precio })
      expect(redondear2(l.subtotal + l.igv)).toBe(l.total)
      expect(l.total).toBe(redondear2(precio))
    }
  })
  it('con cantidad, el valor unitario por la cantidad cuadra con el subtotal', () => {
    const l = lineaDeBoleta({ descripcion: 'x', cantidad: 3, precioConIgv: 50 })
    expect(l.total).toBe(150)
    expect(redondear2(l.valor_unitario * 3)).toBe(l.subtotal)
  })
  it('los totales de la boleta son la suma de sus líneas', () => {
    const b = armarBoleta({
      serie: 'B001', numero: 7, fecha: new Date('2026-09-15T12:00:00Z'), codigoUnico: 'ORD-1',
      cliente: clienteDeBoleta({ dni: '12345678', nombre: 'Rosa Quispe' }),
      items: [
        { descripcion: 'Sérum', cantidad: 1, precioConIgv: 150 },
        { descripcion: 'Café', cantidad: 2, precioConIgv: 60 },
      ],
    })
    expect(b.total).toBe(270)
    expect(redondear2(b.total_gravada + b.total_igv)).toBe(270)
    expect(b.total_gravada).toBe(redondear2(b.items[0].subtotal + b.items[1].subtotal))
    expect(b.total_igv).toBe(redondear2(b.items[0].igv + b.items[1].igv))
  })
})

describe('la cabecera de la boleta', () => {
  const b = armarBoleta({
    serie: 'B001', numero: 12, fecha: new Date('2026-09-15T03:30:00Z'), codigoUnico: 'ORD-1789426016224',
    cliente: clienteDeBoleta({ dni: '12345678', nombre: 'Rosa "La" Quispe', email: 'rosa@x.pe' }),
    items: [{ descripcion: 'Pack "Mono Cool"', cantidad: 1, precioConIgv: 2 }],
  })
  it('es una boleta, en soles, venta interna, pagada, a SUNAT en el acto', () => {
    expect(b.operacion).toBe('generar_comprobante')
    expect(b.tipo_de_comprobante).toBe(2)
    expect(b.moneda).toBe(1)
    expect(b.sunat_transaction).toBe(1)
    expect(b.cancelado).toBe(true)
    expect(b.enviar_automaticamente_a_la_sunat).toBe(true)
    expect(b.porcentaje_de_igv).toBe(18)
    expect(b.medio_de_pago).toBe('YAPE')
  })
  it('la fecha es la de Lima, no la de UTC: a las 03:30Z todavía es el día anterior', () => {
    expect(b.fecha_de_emision).toBe('14-09-2026')
    expect(fechaDeEmision(new Date('2026-09-15T12:00:00Z'))).toBe('15-09-2026')
  })
  it('el ORD va como codigo_unico: un reintento no emite dos boletas', () => {
    expect(b.codigo_unico).toBe('ORD-1789426016224')
  })
  it('sin comillas dobles en ningún texto: rompen el JSON de Nubefact', () => {
    expect(JSON.stringify(b)).not.toMatch(/\\"/)
    expect(b.cliente_denominacion).toBe('Rosa La Quispe')
    expect(b.items[0].descripcion).toBe('Pack Mono Cool')
  })
  it('con email del cliente se le manda solo', () => {
    expect(b.enviar_automaticamente_al_cliente).toBe(true)
    expect(b.cliente_email).toBe('rosa@x.pe')
  })
})

describe('clienteDeBoleta', () => {
  it('con DNI de verdad, tipo 1', () => {
    expect(clienteDeBoleta({ dni: '48296862', nombre: 'Gab' })).toMatchObject({ tipoDocumento: '1', numeroDocumento: '48296862', denominacion: 'Gab' })
  })
  it('sin DNI, o con el de prueba 00000000, va como varios', () => {
    expect(clienteDeBoleta({ dni: '00000000', nombre: 'Gab' })).toMatchObject({ tipoDocumento: '-', numeroDocumento: '-', denominacion: 'Gab' })
    expect(clienteDeBoleta({ dni: null, nombre: '' })).toMatchObject({ tipoDocumento: '-', denominacion: 'CLIENTES VARIOS' })
  })
  it('un email inválido no viaja', () => {
    expect(clienteDeBoleta({ dni: '48296862', nombre: 'Gab', email: 'no-es-email' }).email).toBeNull()
  })
})

describe('leerRespuesta', () => {
  it('una boleta generada: serie, número, enlaces y si SUNAT la aceptó', () => {
    const r = leerRespuesta({
      tipo_de_comprobante: 2, serie: 'B001', numero: 12, enlace: 'https://www.nubefact.com/cpe/abc',
      enlace_del_pdf: '', aceptada_por_sunat: true, sunat_description: 'La Boleta numero B001-12, ha sido aceptada', codigo_hash: 'h',
    }, 200)
    expect(r).toMatchObject({ ok: true, serie: 'B001', numero: 12, aceptada: true, pdf: 'https://www.nubefact.com/cpe/abc.pdf' })
  })
  it('un error con código: en palabras, y dice si ya existe o si vale reintentar', () => {
    const dup = leerRespuesta({ errors: 'Este documento ya existe en NubeFacT', codigo: 23 }, 400)
    expect(dup).toMatchObject({ ok: false, codigo: 23, yaExiste: true, reintentable: false })
    const token = leerRespuesta({ errors: 'No se pudo autenticar', codigo: 10 }, 401)
    expect(token).toMatchObject({ ok: false, codigo: 10, yaExiste: false, reintentable: false })
    expect((token as { mensaje: string }).mensaje).toMatch(/token/)
    expect(leerRespuesta({ errors: 'x', codigo: 40 }, 500)).toMatchObject({ ok: false, reintentable: true })
  })
  it('algo sin forma conocida no se toma por éxito', () => {
    expect(leerRespuesta('<html>', 502)).toMatchObject({ ok: false, reintentable: true })
    expect(leerRespuesta({}, 200)).toMatchObject({ ok: false, reintentable: false })
  })
})

describe('lo que la marca necesita para facturar', () => {
  const tienda = { nubefact_enabled: true, ruc: '20600695771', razon_social: 'Mono Shop SAC', boleta_serie: 'B001' }
  const secretos = { nubefact_ruta: 'https://api.nubefact.com/api/v1/48239908', nubefact_token: 'tok' }
  it('con todo, puede', () => { expect(puedeFacturar(tienda, secretos)).toBe(true) })
  it('sin cualquiera de las piezas, no', () => {
    expect(puedeFacturar({ ...tienda, nubefact_enabled: false }, secretos)).toBe(false)
    expect(puedeFacturar({ ...tienda, ruc: '123' }, secretos)).toBe(false)
    expect(puedeFacturar({ ...tienda, razon_social: ' ' }, secretos)).toBe(false)
    expect(puedeFacturar({ ...tienda, boleta_serie: 'F001' }, secretos)).toBe(false)
    expect(puedeFacturar(tienda, { ...secretos, nubefact_ruta: 'api.nubefact.com' })).toBe(false)
    expect(puedeFacturar(tienda, { ...secretos, nubefact_token: '' })).toBe(false)
    expect(puedeFacturar(tienda, null)).toBe(false)
  })
  it('RUC y serie', () => {
    expect(esRuc('20600695771')).toBe(true)
    expect(esRuc('10482968622')).toBe(true)
    expect(esRuc('30600695771')).toBe(false)
    expect(esRuc('2060069577')).toBe(false)
    expect(esSerieDeBoleta('B001')).toBe(true)
    expect(esSerieDeBoleta('b001')).toBe(true)
    expect(esSerieDeBoleta('F001')).toBe(false)
    expect(esSerieDeBoleta('B01')).toBe(false)
  })
  it('consultaDeBoleta y limpiarTexto', () => {
    expect(consultaDeBoleta('B001', 3)).toEqual({ operacion: 'consultar_comprobante', tipo_de_comprobante: 2, serie: 'B001', numero: 3 })
    expect(limpiarTexto('  clavos 3" de\n acero  ', 250)).toBe('clavos 3 de acero')
    expect(limpiarTexto('x'.repeat(300), 250)).toHaveLength(250)
  })
})
