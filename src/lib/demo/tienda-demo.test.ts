import { describe, it, expect } from 'vitest'
import { tiendaDemo, PEDIDOS_POR_DIA } from './tienda-demo'
import { columnaDelPedido, COLUMNAS } from '../order-tracking'
import { estaVivo } from '../store-orders'

const t = await tiendaDemo()

describe('la tienda de ejemplo', () => {
  // Si cada llamada inventara datos distintos, un total cambiaría solo con
  // cambiar de pantalla y nadie podría fiarse de ningún número.
  it('es determinista: siempre la misma tienda', async () => {
    const otra = await tiendaDemo()
    expect(otra.pedidos[0].id).toBe(t.pedidos[0].id)
    expect(otra.clientes.length).toBe(t.clientes.length)
  })

  it('vende los tres productos del brief', () => {
    expect(t.productos.map(p => p.precio).sort((a, b) => a - b)).toEqual([120, 150, 180])
  })

  // Un tablero con todo en una columna no enseña nada. El valor del demo es
  // justamente ver la operación repartida.
  it('llena el tablero: ninguna columna del eje queda vacía', () => {
    const ocupadas = new Set(t.pedidos.filter(estaVivo).map(columnaDelPedido))
    for (const c of COLUMNAS) expect(ocupadas.has(c.key)).toBe(true)
  })

  it('tiene pedidos caídos y cancelados, que son los que hay que saber mirar', () => {
    expect(t.pedidos.some(p => p.stage === 'no_entregado')).toBe(true)
    expect(t.pedidos.some(p => p.status === 'cancelado')).toBe(true)
  })

  it('el mapa tiene rutas: los envíos llevan sede real de destino', () => {
    const conSede = t.pedidos.filter(p => p.agency_branch_id)
    expect(conSede.length).toBeGreaterThan(50)
    expect(Object.keys(t.origenPorProducto).length).toBeGreaterThan(0)
  })

  it('los pedidos vienen del más nuevo al más viejo, como los devuelve el servidor', () => {
    const fechas = t.pedidos.map(p => String(p.created_at))
    expect([...fechas].sort().reverse()).toEqual(fechas)
  })
})

describe('los clientes de ejemplo', () => {
  it('hay base suficiente para que la lista se sienta una tienda que vende', () => {
    expect(t.clientes.length).toBeGreaterThan(300)
  })

  // Sin recompras no hay tasa de recompra que mirar, que es medio Loyalty.
  it('una parte repite y otra no', () => {
    const repiten = t.clientes.filter(c => c.pedidos >= 2).length
    const compraron = t.clientes.filter(c => c.pedidos >= 1).length
    expect(repiten).toBeGreaterThan(20)
    expect(repiten).toBeLessThan(compraron)
  })

  it('hay gente en los dos segmentos de reactivación', () => {
    expect(t.clientes.some(c => c.segmento === 'restock')).toBe(true)
    expect(t.clientes.some(c => c.segmento === 'winback')).toBe(true)
  })

  // El LTV sale del MISMO agregado que usa la tienda real: solo entregados.
  it('quien gastó tiene pedidos, y quien no, no', () => {
    for (const c of t.clientes.slice(0, 50)) {
      if (c.gastado > 0) expect(c.pedidos).toBeGreaterThan(0)
      else expect(c.pedidos).toBe(0)
    }
  })
})

describe('el equipo y la escala', () => {
  it('tiene los roles de una operación de contraentrega', () => {
    const roles = t.equipo.map(m => m.role_label)
    expect(roles).toContain('Ventas')
    expect(roles).toContain('Despacho')
    expect(roles).toContain('Motorizado')
    expect(t.equipo.filter(m => m.is_admin)).toHaveLength(1)
  })

  it('declara la escala que representa', () => {
    expect(PEDIDOS_POR_DIA).toBe(1000)
  })
})
