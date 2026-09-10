import { describe, it, expect } from 'vitest'
import {
  TARIFA_AFILIADO, HORAS_LIMA,
  normalizarCodigo, esCodigoValido, enlaceDeAfiliado, codigoDeLaUrl,
  periodoDe, esPeriodo, rangoDelPeriodo, periodoAnterior, nombreDelPeriodo,
  cubierta, estadoDeSuscripcion, tramosDelPeriodo,
  comisionDeAfiliado, liquidacionDe,
  arbolDeAfiliados, aplanarArbol, descendientesDe, cerrariaCiclo,
  type AporteDeTienda, type NodoDeAfiliado,
} from '../../supabase/functions/_shared/afiliados.ts'
import { margenDeKross } from '../../supabase/functions/_shared/comision.ts'

// Las reglas del programa de afiliados. Lo que se prueba acá es lo que decide
// PLATA de alguien —qué mes cuenta, qué transacción cuenta y cuánto se debe—,
// así que cada caso está escrito como la pregunta que responde y no como el
// nombre de la función que ejecuta.

describe('la tarifa cabe en el margen', () => {
  it('S/0.10 nunca se come el margen de Kross en un riel bien elegido', () => {
    // El corte de riel (`proveedorPara`) manda los montos bajos a Flow y los
    // altos a 360pay. En los dos extremos de ese ruteo el margen queda MUY por
    // encima de la tarifa del afiliado.
    expect(margenDeKross(10, 'FLOW')).toBeGreaterThan(TARIFA_AFILIADO)
    expect(margenDeKross(90, '360PAY')).toBeGreaterThan(TARIFA_AFILIADO)
    expect(margenDeKross(300, '360PAY')).toBeGreaterThan(TARIFA_AFILIADO)
  })

  it('es un fijo, no un porcentaje: diez céntimos por venta', () => {
    expect(TARIFA_AFILIADO).toBe(0.10)
  })
})

describe('el código, que es el enlace', () => {
  it('normaliza lo que una persona teclea', () => {
    expect(normalizarCodigo('  Jhoann Pacahuala ')).toBe('jhoann-pacahuala')
    expect(normalizarCodigo('María José')).toBe('maria-jose')
    expect(normalizarCodigo('a--b__c')).toBe('a-b-c')
    expect(normalizarCodigo('---')).toBe('')
  })

  it('exige que ya venga normalizado y con tres caracteres', () => {
    expect(esCodigoValido('jhoann')).toBe(true)
    expect(esCodigoValido('ab')).toBe(false)            // muy corto: dos afiliados se pisan
    expect(esCodigoValido('Jhoann')).toBe(false)        // sin normalizar
    expect(esCodigoValido('mi codigo')).toBe(false)
  })

  it('no deja que alguien se haga pasar por la plataforma', () => {
    expect(esCodigoValido('kross')).toBe(false)
    expect(esCodigoValido('soporte')).toBe(false)
  })

  it('el enlace es absoluto: se pega en una bio, no es una ruta', () => {
    expect(enlaceDeAfiliado('jhoann')).toBe('https://krossclub.app/?ref=jhoann')
  })

  it('lee el código de una URL y lo normaliza en la puerta', () => {
    expect(codigoDeLaUrl('https://krossclub.app/?ref=jhoann')).toBe('jhoann')
    // Quien lo comparta a mano va a mandar la mayúscula tarde o temprano, y ese
    // visitante tiene que quedar atribuido al MISMO afiliado.
    expect(codigoDeLaUrl('https://krossclub.app/servicios?ref=Jhoann')).toBe('jhoann')
    expect(codigoDeLaUrl('https://krossclub.app/')).toBe(null)
    expect(codigoDeLaUrl('https://krossclub.app/?ref=ab')).toBe(null)
  })
})

describe('el mes es el de Lima, no el de UTC', () => {
  it('Perú es UTC-5 y no mueve el reloj', () => {
    expect(HORAS_LIMA).toBe(-5)
  })

  it('una venta del 30 a las 20:00 en Lima es de setiembre, no de octubre', () => {
    // En UTC esa venta figura el 1 de octubre a la 01:00. Contarla en octubre
    // le movería la comisión de mes al afiliado.
    expect(periodoDe('2026-10-01T01:00:00Z')).toBe('2026-09')
  })

  it('y la del 1 a las 00:30 de Lima ya es del mes nuevo', () => {
    expect(periodoDe('2026-10-01T05:30:00Z')).toBe('2026-10')
  })

  it('el rango es medio abierto, así que ningún milisegundo se cuenta dos veces', () => {
    const set = rangoDelPeriodo('2026-09')
    const oct = rangoDelPeriodo('2026-10')
    expect(set.desde).toBe('2026-09-01T05:00:00.000Z')
    expect(set.hasta).toBe('2026-10-01T05:00:00.000Z')
    expect(set.hasta).toBe(oct.desde)   // pegados, sin hueco y sin solape
  })

  it('cruza el año sin inventar un mes 13', () => {
    expect(rangoDelPeriodo('2026-12').hasta).toBe('2027-01-01T05:00:00.000Z')
    expect(periodoAnterior('2026-01')).toBe('2025-12')
    expect(periodoAnterior('2026-10')).toBe('2026-09')
  })

  it('rechaza lo que no es un periodo', () => {
    expect(esPeriodo('2026-13')).toBe(false)
    expect(esPeriodo('2026-00')).toBe(false)
    expect(esPeriodo('2026-9')).toBe(false)
    expect(esPeriodo(202609)).toBe(false)
    expect(() => rangoDelPeriodo('nope')).toThrow()
  })

  it('se dice en palabras, con la ortografía peruana de setiembre', () => {
    expect(nombreDelPeriodo('2026-09')).toBe('setiembre 2026')
  })
})

describe('la suscripción es la llave', () => {
  const pagados = [
    { inicio: '2026-08-01T00:00:00Z', fin: '2026-09-01T00:00:00Z' },
    { inicio: '2026-09-01T00:00:00Z', fin: '2026-10-01T00:00:00Z' },
  ]

  it('la venta cuenta si el plan cubría ESA fecha', () => {
    expect(cubierta(pagados, '2026-08-15T10:00:00Z')).toBe(true)
    expect(cubierta(pagados, '2026-09-30T23:59:59Z')).toBe(true)
  })

  it('la venta de un mes que la tienda no pagó no cuenta', () => {
    expect(cubierta(pagados, '2026-07-31T23:00:00Z')).toBe(false)
    expect(cubierta(pagados, '2026-10-01T00:00:01Z')).toBe(false)
    expect(cubierta([], '2026-09-15T00:00:00Z')).toBe(false)
  })

  it('la renovación no cuenta doble: el fin de un tramo es el inicio del otro', () => {
    // Si el extremo fuera cerrado, el instante exacto de la renovación caería
    // en los dos tramos. No cambia el total —se cuenta la venta, no el tramo—
    // pero sí rompería cualquier suma por tramo que se haga después.
    const enElBorde = pagados.filter(p => {
      const t = Date.parse('2026-09-01T00:00:00Z')
      return t >= Date.parse(p.inicio) && t < Date.parse(p.fin)
    })
    expect(enElBorde).toHaveLength(1)
  })

  it('una fecha ilegible no cuenta, en vez de reventar', () => {
    expect(cubierta(pagados, 'ayer')).toBe(false)
  })

  it('traduce los ocho estados de Stripe a los cinco que significan algo acá', () => {
    expect(estadoDeSuscripcion('active')).toBe('activa')
    expect(estadoDeSuscripcion('trialing')).toBe('prueba')
    expect(estadoDeSuscripcion('past_due')).toBe('en_gracia')
    expect(estadoDeSuscripcion('unpaid')).toBe('en_gracia')
    expect(estadoDeSuscripcion('canceled')).toBe('cancelada')
    expect(estadoDeSuscripcion('incomplete_expired')).toBe('cancelada')
    // Nunca cobró el primer pago: existe en Stripe y no existe acá.
    expect(estadoDeSuscripcion('incomplete')).toBe('sin_suscripcion')
    expect(estadoDeSuscripcion(null)).toBe('sin_suscripcion')
    expect(estadoDeSuscripcion('lo_que_sea')).toBe('sin_suscripcion')
  })
})

describe('lo que se le debe al afiliado', () => {
  it('son diez céntimos por transacción', () => {
    expect(comisionDeAfiliado(1)).toBe(0.10)
    expect(comisionDeAfiliado(1000)).toBe(100)
    expect(comisionDeAfiliado(0)).toBe(0)
  })

  it('no inventa céntimos con el punto flotante', () => {
    // 3 * 0.1 en punto flotante es 0.30000000000000004.
    expect(comisionDeAfiliado(3)).toBe(0.30)
    expect(comisionDeAfiliado(7)).toBe(0.70)
  })

  it('un conteo negativo o roto es cero, no una deuda al revés', () => {
    expect(comisionDeAfiliado(-5)).toBe(0)
    expect(comisionDeAfiliado(NaN)).toBe(0)
    expect(comisionDeAfiliado(2.7)).toBe(0.20)   // media transacción no existe
  })

  const tiendas: AporteDeTienda[] = [
    { store_id: 'a', nombre: 'Marca A', transacciones: 120, sin_plan: 0, estado: 'activa' },
    { store_id: 'b', nombre: 'Marca B', transacciones: 400, sin_plan: 12, estado: 'en_gracia' },
    { store_id: 'c', nombre: 'Marca C', transacciones: 0, sin_plan: 90, estado: 'cancelada' },
  ]

  it('suma el mes y lo ordena por quien más aportó', () => {
    const l = liquidacionDe('2026-09', tiendas)
    expect(l.transacciones).toBe(520)
    expect(l.monto).toBe(52)
    expect(l.tiendas.map(t => t.store_id)).toEqual(['b', 'a', 'c'])
  })

  it('enseña las que NO contaron en vez de esconderlas', () => {
    // "300 ventas, 0 comisión" sin explicación se lee como un robo. Con el
    // número al lado, la conversación es "tu tienda no pagó el plan".
    const l = liquidacionDe('2026-09', tiendas)
    expect(l.sin_plan).toBe(102)
    expect(l.monto).toBe(comisionDeAfiliado(l.transacciones))
  })

  it('un afiliado sin tiendas liquida en cero, no en error', () => {
    const l = liquidacionDe('2026-09', [])
    expect(l).toMatchObject({ periodo: '2026-09', transacciones: 0, sin_plan: 0, monto: 0 })
  })
})

describe('quién está debajo de quién', () => {
  const n = (id: string, referred_by: string | null): NodoDeAfiliado =>
    ({ id, codigo: id, nombre: id.toUpperCase(), referred_by })

  it('arma el árbol con su nivel', () => {
    const arbol = arbolDeAfiliados([n('a', null), n('b', 'a'), n('c', 'b'), n('d', null)])
    expect(aplanarArbol(arbol).map(f => [f.afiliado.id, f.nivel]))
      .toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0]])
  })

  it('el huérfano sube a la raíz en vez de desaparecer', () => {
    // La pantalla de UN afiliado recibe su rama, no la tabla entera: su propio
    // padre no viene en la lista. Desaparecerlo dejaría la pantalla en blanco.
    const arbol = arbolDeAfiliados([n('b', 'padre-que-no-vino'), n('c', 'b')])
    expect(aplanarArbol(arbol).map(f => f.afiliado.id)).toEqual(['b', 'c'])
  })

  it('un ciclo NO cuelga: se corta y la rama termina', () => {
    // A→B→A. Sin corta-ciclos esta llamada no vuelve nunca.
    const arbol = arbolDeAfiliados([n('a', 'b'), n('b', 'a')])
    const filas = aplanarArbol(arbol)
    expect(filas).toHaveLength(2)
    expect(new Set(filas.map(f => f.afiliado.id))).toEqual(new Set(['a', 'b']))
  })

  it('lista todo lo que cuelga de uno, a cualquier profundidad', () => {
    const lista = [n('a', null), n('b', 'a'), n('c', 'b'), n('d', 'a'), n('e', null)]
    expect(descendientesDe(lista, 'a').sort()).toEqual(['b', 'c', 'd'])
    expect(descendientesDe(lista, 'e')).toEqual([])
  })

  it('avisa antes de guardar un ciclo, que es el único momento en que se puede evitar', () => {
    const lista = [n('a', null), n('b', 'a'), n('c', 'b')]
    expect(cerrariaCiclo(lista, 'a', 'c')).toBe(true)    // su propio nieto de padre
    expect(cerrariaCiclo(lista, 'a', 'a')).toBe(true)    // padre de sí mismo
    expect(cerrariaCiclo(lista, 'c', 'a')).toBe(false)   // reacomodo legítimo
    expect(cerrariaCiclo(lista, 'c', null)).toBe(false)  // soltarlo a la raíz
  })
})

describe('los pedazos del mes que estaban pagados', () => {
  const mes = { desde: '2026-09-01T05:00:00Z', hasta: '2026-10-01T05:00:00Z' }

  it('recorta el tramo a los bordes del mes', () => {
    // La factura cubre del 15/08 al 15/09; del mes solo cuenta hasta el 15/09.
    expect(tramosDelPeriodo(
      [{ inicio: '2026-08-15T00:00:00Z', fin: '2026-09-15T00:00:00Z' }],
      mes.desde, mes.hasta,
    )).toEqual([{ desde: '2026-09-01T05:00:00.000Z', hasta: '2026-09-15T00:00:00.000Z' }])
  })

  it('el mes entero pagado es UN rango', () => {
    expect(tramosDelPeriodo(
      [{ inicio: '2026-08-20T00:00:00Z', fin: '2026-10-20T00:00:00Z' }],
      mes.desde, mes.hasta,
    )).toEqual([{ desde: mes.desde.replace('Z', '.000Z'), hasta: mes.hasta.replace('Z', '.000Z') }])
  })

  it('dos renovaciones pegadas se fusionan: una consulta, no dos', () => {
    const r = tramosDelPeriodo([
      { inicio: '2026-08-10T00:00:00Z', fin: '2026-09-10T00:00:00Z' },
      { inicio: '2026-09-10T00:00:00Z', fin: '2026-10-10T00:00:00Z' },
    ], mes.desde, mes.hasta)
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ desde: '2026-09-01T05:00:00.000Z', hasta: '2026-10-01T05:00:00.000Z' })
  })

  it('dos tramos que SE SOLAPAN no cuentan los días dos veces', () => {
    // Pasa con un cambio de plan a mitad de mes: Stripe emite el prorrateo Y la
    // factura nueva, y los dos cubren los mismos días. Sin fusionar, esas
    // transacciones se contarían dos veces y el afiliado cobraría de más.
    const r = tramosDelPeriodo([
      { inicio: '2026-09-01T00:00:00Z', fin: '2026-09-20T00:00:00Z' },
      { inicio: '2026-09-10T00:00:00Z', fin: '2026-09-25T00:00:00Z' },
    ], mes.desde, mes.hasta)
    expect(r).toEqual([{ desde: '2026-09-01T05:00:00.000Z', hasta: '2026-09-25T00:00:00.000Z' }])
  })

  it('deja el hueco cuando la tienda dejó de pagar y volvió', () => {
    const r = tramosDelPeriodo([
      { inicio: '2026-09-01T00:00:00Z', fin: '2026-09-08T00:00:00Z' },
      { inicio: '2026-09-22T00:00:00Z', fin: '2026-10-22T00:00:00Z' },
    ], mes.desde, mes.hasta)
    expect(r).toHaveLength(2)
    expect(r[1].hasta).toBe('2026-10-01T05:00:00.000Z')
  })

  it('un mes sin nada pagado no da ningún rango', () => {
    expect(tramosDelPeriodo([], mes.desde, mes.hasta)).toEqual([])
    // Un tramo que no toca el mes tampoco.
    expect(tramosDelPeriodo(
      [{ inicio: '2026-05-01T00:00:00Z', fin: '2026-06-01T00:00:00Z' }],
      mes.desde, mes.hasta,
    )).toEqual([])
  })

  it('fechas ilegibles se ignoran en vez de reventar la liquidación', () => {
    expect(tramosDelPeriodo([{ inicio: 'ayer', fin: 'hoy' }], mes.desde, mes.hasta)).toEqual([])
    expect(tramosDelPeriodo([{ inicio: mes.desde, fin: mes.hasta }], 'x', mes.hasta)).toEqual([])
  })
})
