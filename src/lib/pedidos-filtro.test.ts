import { describe, it, expect } from 'vitest'
import {
  FILTRO_VACIO, ventanaDe, pasaFiltro, aplicarFiltro,
  cuantosFiltros, resumenDelRango, opcionesDe, clave, textoDe, coincide, pagosDe,
} from './pedidos-filtro'
import type { Filtro } from './pedidos-filtro'
import type { StoreOrder } from './store-orders'

const DIA = 86_400_000
// Todo se ancla a hora LOCAL: es la que ve el vendedor y la que decide el corte
// de medianoche. Con fechas UTC la prueba pasaría o no según dónde corra.
const AHORA = new Date(2026, 7, 27, 15, 30).getTime()   // 27-ago-2026, 3:30 p. m.
const con = (p: Partial<Filtro>): Filtro => ({ ...FILTRO_VACIO, ...p })
const pedido = (p: Partial<StoreOrder>): StoreOrder => ({ id: 'x', ...p })
const enDia = (d: number, h = 12) => new Date(2026, 7, d, h).toISOString()

describe('la ventana del filtro', () => {
  it('"todo" no pone límites', () => {
    expect(ventanaDe(FILTRO_VACIO, AHORA)).toEqual({ desde: null, hasta: null })
  })

  // "Hoy" empieza a medianoche, no hace 24 horas: un pedido de anoche no es de
  // hoy aunque hayan pasado menos de 24 horas.
  it('"hoy" arranca en la medianoche local', () => {
    const { desde } = ventanaDe(con({ rango: 'hoy' }), AHORA)
    expect(desde).toBe(new Date(2026, 7, 27, 0, 0, 0, 0).getTime())
  })

  it('los atajos cuentan incluyendo hoy', () => {
    expect(ventanaDe(con({ rango: '7d' }), AHORA).desde)
      .toBe(new Date(2026, 7, 21, 0, 0, 0, 0).getTime())
    expect(ventanaDe(con({ rango: '30d' }), AHORA).desde)
      .toBe(new Date(2026, 6, 29, 0, 0, 0, 0).getTime())
  })

  // El bug clásico: `new Date('2026-08-27')` es UTC y en Perú (UTC-5) cae el 26
  // a las 7 p. m., así que el rango se corría un día entero.
  it('el rango a mano se lee en hora local, no en UTC', () => {
    const { desde, hasta } = ventanaDe(con({ rango: 'rango', desde: '2026-08-20', hasta: '2026-08-27' }), AHORA)
    expect(desde).toBe(new Date(2026, 7, 20, 0, 0, 0, 0).getTime())
    expect(hasta).toBe(new Date(2026, 7, 28, 0, 0, 0, 0).getTime())
  })

  it('un rango a medias sigue sirviendo', () => {
    expect(ventanaDe(con({ rango: 'rango', desde: '2026-08-20' }), AHORA).hasta).toBeNull()
    expect(ventanaDe(con({ rango: 'rango', hasta: '2026-08-27' }), AHORA).desde).toBeNull()
    expect(ventanaDe(con({ rango: 'rango', desde: 'ayer' }), AHORA).desde).toBeNull()
  })
})

describe('qué pedido pasa', () => {
  it('el día que escribe el vendedor en "hasta" se ve completo', () => {
    const f = con({ rango: 'rango', desde: '2026-08-27', hasta: '2026-08-27' })
    expect(pasaFiltro(pedido({ created_at: enDia(27, 23) }), f, AHORA)).toBe(true)
    expect(pasaFiltro(pedido({ created_at: enDia(28, 0) }), f, AHORA)).toBe(false)
    expect(pasaFiltro(pedido({ created_at: new Date(2026, 7, 26, 23, 59).toISOString() }), f, AHORA)).toBe(false)
  })

  it('filtra por vendedor y por producto', () => {
    const p = pedido({ assigned_seller_id: 'kevin', product_name: 'Colchón Inflable Doble' })
    expect(pasaFiltro(p, con({ vendedor: 'kevin' }), AHORA)).toBe(true)
    expect(pasaFiltro(p, con({ vendedor: 'renzo' }), AHORA)).toBe(false)
    expect(pasaFiltro(p, con({ producto: 'Colchón Inflable Doble' }), AHORA)).toBe(true)
    expect(pasaFiltro(p, con({ producto: 'Faja Reductora Premium' }), AHORA)).toBe(false)
    // Sin asignar no es "cualquiera": no debe salir cuando se pide a alguien.
    expect(pasaFiltro(pedido({}), con({ vendedor: 'kevin' }), AHORA)).toBe(false)
  })

  it('las condiciones se acumulan', () => {
    const p = pedido({ assigned_seller_id: 'kevin', product_name: 'Pack', created_at: enDia(20) })
    expect(pasaFiltro(p, con({ vendedor: 'kevin', rango: 'hoy' }), AHORA)).toBe(false)
    expect(pasaFiltro(p, con({ vendedor: 'kevin', rango: '30d' }), AHORA)).toBe(true)
  })

  // Un pedido no se pierde por una fecha rota: se ve de más, nunca de menos.
  it('un pedido sin fecha legible no desaparece', () => {
    expect(pasaFiltro(pedido({}), con({ rango: 'hoy' }), AHORA)).toBe(true)
    expect(pasaFiltro(pedido({ created_at: 'ayer por la tarde' }), con({ rango: 'hoy' }), AHORA)).toBe(true)
  })

  it('sin filtro devuelve la MISMA lista, sin copiarla', () => {
    const lista = [pedido({ created_at: enDia(1) })]
    expect(aplicarFiltro(lista, FILTRO_VACIO, AHORA)).toBe(lista)
  })

  it('aplica sobre la lista entera', () => {
    const lista = [
      pedido({ id: 'a', created_at: enDia(27) }),
      pedido({ id: 'b', created_at: enDia(26) }),
      pedido({ id: 'c', created_at: new Date(AHORA - 40 * DIA).toISOString() }),
    ]
    expect(aplicarFiltro(lista, con({ rango: 'hoy' }), AHORA).map(p => p.id)).toEqual(['a'])
    expect(aplicarFiltro(lista, con({ rango: '7d' }), AHORA).map(p => p.id)).toEqual(['a', 'b'])
    expect(aplicarFiltro(lista, con({ rango: 'todo' }), AHORA)).toHaveLength(3)
  })
})

describe('lo que dice el control', () => {
  it('cuenta las condiciones puestas', () => {
    expect(cuantosFiltros(FILTRO_VACIO)).toBe(0)
    expect(cuantosFiltros(con({ rango: 'hoy' }))).toBe(1)
    expect(cuantosFiltros(con({ rango: 'hoy', vendedor: 'kevin' }))).toBe(2)
    expect(cuantosFiltros(con({ rango: 'hoy', vendedor: 'kevin', producto: 'Pack' }))).toBe(3)
    // Un rango a mano sin fechas todavía no filtra nada.
    expect(cuantosFiltros(con({ rango: 'rango' }))).toBe(0)
    expect(cuantosFiltros(con({ rango: 'rango', desde: '2026-08-01' }))).toBe(1)
  })

  it('se lee sin abrir el panel', () => {
    expect(resumenDelRango(FILTRO_VACIO)).toBe('Todo')
    expect(resumenDelRango(con({ rango: '7d' }))).toBe('7 días')
    expect(resumenDelRango(con({ rango: 'rango', desde: '2026-08-01', hasta: '2026-08-27' })))
      .toBe('2026-08-01 → 2026-08-27')
    expect(resumenDelRango(con({ rango: 'rango' }))).toBe('Fechas')
  })
})

describe('las opciones del desplegable', () => {
  it('salen de los pedidos que hay, sin repetir y en orden', () => {
    const { vendedores, productos } = opcionesDe([
      pedido({ assigned_seller_id: 'k', seller_name: 'Kevin Ramos', product_name: 'Faja' }),
      pedido({ assigned_seller_id: 'k', seller_name: 'Kevin Ramos', product_name: 'Faja' }),
      pedido({ assigned_seller_id: 'a', seller_name: 'Andrea Flores', product_name: 'Colchón' }),
      pedido({}),
    ])
    expect(vendedores).toEqual([{ id: 'a', nombre: 'Andrea Flores' }, { id: 'k', nombre: 'Kevin Ramos' }])
    expect(productos).toEqual(['Colchón', 'Faja'])
  })
})

// ─── El buscador ─────────────────────────────────────────────────────────────
//
// Los desplegables REBANAN; esto ENCUENTRA. Se busca con lo que uno tiene en la
// mano cuando llega a la pantalla: un nombre, el N° que el cliente lee de su
// pantalla, un DNI dictado por teléfono, el número del que llamó, o la guía por
// la que pregunta el courier.
const ROSA = pedido({
  buyer_name: 'Rosa Sánchez',
  order_id: 'ORD-17563450000000',
  buyer_phone: '912345678',
  tracking_numero: '448812',
  buyers: { document_number: '48296862' },
  product_name: 'Faja Reductora Premium',
})

describe('normalizar para comparar', () => {
  it('quita acentos, mayúsculas y separadores', () => {
    expect(clave('Rosa Sánchez')).toBe('ROSASANCHEZ')
    expect(clave('ORD-1756 3450')).toBe('ORD17563450')
    expect(clave('912 345 678')).toBe('912345678')
    expect(clave(null)).toBe('')
  })
})

describe('buscar un pedido', () => {
  it('encuentra por nombre, aunque falte la tilde', () => {
    expect(coincide(ROSA, 'sanchez')).toBe(true)
    expect(coincide(ROSA, 'Sánchez')).toBe(true)
    expect(coincide(ROSA, 'ROSA')).toBe(true)
  })

  it('encuentra por N° de pedido, con o sin el guion', () => {
    expect(coincide(ROSA, 'ORD-1756345')).toBe(true)
    expect(coincide(ROSA, 'ord 1756345')).toBe(true)
    // Y por la cola, que es lo que uno alcanza a leer del final del número.
    expect(coincide(ROSA, '450000000')).toBe(true)
  })

  it('encuentra por DNI, por teléfono y por guía', () => {
    expect(coincide(ROSA, '48296862')).toBe(true)
    expect(coincide(ROSA, '912 345 678')).toBe(true)
    expect(coincide(ROSA, '448812')).toBe(true)
  })

  // Uno no recuerda en qué orden estaba escrito el nombre, y exigirlo convierte
  // una búsqueda fallida en "este cliente no existe".
  it('los términos van en cualquier orden', () => {
    expect(coincide(ROSA, 'sanchez rosa')).toBe(true)
    expect(coincide(ROSA, 'rosa sanchez')).toBe(true)
  })

  // Con OR, escribir dos palabras devolvería MÁS resultados que escribir una:
  // lo contrario de lo que uno espera al seguir tecleando.
  it('todos los términos tienen que estar, no uno cualquiera', () => {
    expect(coincide(ROSA, 'rosa medina')).toBe(false)
  })

  it('vacío no filtra nada', () => {
    expect(coincide(ROSA, '')).toBe(true)
    expect(coincide(ROSA, '   ')).toBe(true)
  })

  // El producto ya tiene su desplegable al lado. Meterlo acá haría que escribir
  // "faja" devuelva media tienda desde un control que promete encontrar uno.
  it('NO busca por producto: para eso está el desplegable', () => {
    expect(coincide(ROSA, 'faja')).toBe(false)
  })

  // Normalizado y pegado, "ROSASANCHEZ" + "ORD1756…" darían un solo texto donde
  // "ZORD" encontraría un pedido que no dice eso en ninguna parte.
  it('no encuentra a caballo entre dos campos', () => {
    expect(textoDe(ROSA)).toContain('|')
    expect(coincide(ROSA, 'zord')).toBe(false)
  })

  it('un pedido sin datos no revienta ni aparece en todo', () => {
    const vacio = pedido({})
    expect(coincide(vacio, '')).toBe(true)
    expect(coincide(vacio, 'rosa')).toBe(false)
  })
})

describe('el buscador dentro del filtro', () => {
  it('recorta la lista y cuenta como filtro puesto', () => {
    const otros = [ROSA, pedido({ buyer_name: 'Luis Ccahuana' })]
    expect(aplicarFiltro(otros, con({ busca: 'rosa' }), AHORA)).toEqual([ROSA])
    expect(cuantosFiltros(con({ busca: 'rosa' }))).toBe(1)
  })

  // Un buscador en blanco no puede contar como condición: el globito diría que
  // hay un filtro puesto cuando no hay ninguno.
  it('en blanco no cuenta ni recorta', () => {
    expect(cuantosFiltros(con({ busca: '   ' }))).toBe(0)
    const todos = [ROSA, pedido({ buyer_name: 'Luis' })]
    expect(aplicarFiltro(todos, con({ busca: '  ' }), AHORA)).toBe(todos)
  })

  it('se acumula con las demás condiciones', () => {
    const f = con({ busca: 'rosa', producto: 'Faja Reductora Premium' })
    expect(pasaFiltro(ROSA, f, AHORA)).toBe(true)
    expect(pasaFiltro({ ...ROSA, product_name: 'Otro' }, f, AHORA)).toBe(false)
  })
})

// ─── Rebanar por lo que se cobró ─────────────────────────────────────────────

/** Los cuatro casos que existen de verdad en una tienda. */
const ADELANTO = pedido({ id: 'a', product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' })
const TOTAL = pedido({ id: 't', product_price: 150, advance_amount: 150, payment_verification: 'MATCHED' })
const DOBLE = pedido({
  id: 'd', product_price: 150, advance_amount: 75, payment_verification: 'MATCHED',
  saldo_amount: 75, saldo_verification: 'MATCHED',
})
const SIN_CRUZAR = pedido({ id: 's', product_price: 150, advance_amount: 75, payment_verification: 'PENDING' })

describe('el filtro de pagos', () => {
  it('separa adelanto, pago total y saldo', () => {
    expect(pagosDe(ADELANTO)).toEqual(['adelanto'])
    expect(pagosDe(TOTAL)).toEqual(['total'])
    expect(pagosDe(DOBLE)).toEqual(['adelanto', 'saldo'])
  })

  // Quien adelantó y después pagó su saldo hizo LAS DOS operaciones, y las dos
  // ocurrieron de verdad. Esconder una para que las listas no se solapen sería
  // inventar: "Saldo" es justo la lista de los que pagaron dos veces.
  it('un pedido con los dos pagos sale en las dos listas', () => {
    const todos = [ADELANTO, TOTAL, DOBLE]
    expect(aplicarFiltro(todos, con({ pago: 'adelanto' }), AHORA)).toEqual([ADELANTO, DOBLE])
    expect(aplicarFiltro(todos, con({ pago: 'saldo' }), AHORA)).toEqual([DOBLE])
    expect(aplicarFiltro(todos, con({ pago: 'total' }), AHORA)).toEqual([TOTAL])
  })

  // Un cupón emitido no es un pago. El desplegable dice "pagos", así que
  // listarlo ahí haría contar como cobrado lo que todavía no entró — que es
  // exactamente el error que hace despachar de más.
  it('lo que no cruzó la pasarela no es un pago', () => {
    expect(pagosDe(SIN_CRUZAR)).toEqual([])
    expect(pagosDe(pedido({
      id: 'p', product_price: 150, advance_amount: 75, payment_verification: 'MATCHED',
      saldo_amount: 75, saldo_verification: 'PENDING',
    }))).toEqual(['adelanto'])
    expect(aplicarFiltro([ADELANTO, SIN_CRUZAR], con({ pago: 'adelanto' }), AHORA)).toEqual([ADELANTO])
  })

  it('cuenta como filtro puesto y se acumula con los demás', () => {
    expect(cuantosFiltros(con({ pago: 'saldo' }))).toBe(1)
    expect(cuantosFiltros(con({ pago: 'saldo', producto: 'Faja' }))).toBe(2)
    expect(cuantosFiltros(FILTRO_VACIO)).toBe(0)
  })

  // Un desplegable que se reordena solo según qué pedido entró primero obliga a
  // leerlo entero cada vez.
  it('ofrece solo las formas de cobro que existen, y siempre en el mismo orden', () => {
    expect(opcionesDe([DOBLE, TOTAL]).pagos).toEqual(['adelanto', 'total', 'saldo'])
    expect(opcionesDe([TOTAL]).pagos).toEqual(['total'])
    expect(opcionesDe([SIN_CRUZAR]).pagos).toEqual([])
  })
})
