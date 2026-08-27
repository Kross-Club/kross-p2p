import { describe, it, expect } from 'vitest'
import {
  FILTRO_VACIO, ventanaDe, pasaFiltro, aplicarFiltro,
  cuantosFiltros, resumenDelRango, opcionesDe,
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
