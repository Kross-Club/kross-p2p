import { describe, it, expect } from 'vitest'
import { agregarPorComprador, segmentoDe, ventanasDe } from '../../supabase/functions/_shared/clientes.ts'
import { resumenDeCliente } from './store-clients'

const DIA = 86_400_000
const haceDias = (d: number) => new Date(Date.now() - d * DIA).toISOString()

describe('cuánto vale un cliente', () => {
  it('suma pedidos y plata por comprador', () => {
    const m = agregarPorComprador([
      { buyer_id: 'a', product_price: 120, created_at: haceDias(40) },
      { buyer_id: 'a', product_price: 80, created_at: haceDias(5) },
      { buyer_id: 'b', product_price: 50, created_at: haceDias(10) },
    ])
    expect(m.get('a')).toMatchObject({ pedidos: 2, gastado: 200 })
    expect(m.get('b')).toMatchObject({ pedidos: 1, gastado: 50 })
  })

  it('el último pedido es el más reciente, venga en el orden que venga', () => {
    const m = agregarPorComprador([
      { buyer_id: 'a', product_price: 10, created_at: haceDias(2) },
      { buyer_id: 'a', product_price: 10, created_at: haceDias(90) },
    ])
    const dias = (Date.now() - (m.get('a')?.ultimo ?? 0)) / DIA
    expect(Math.round(dias)).toBe(2)
  })

  // Un pedido sin comprador identificado no es de nadie: sumarlo al azar
  // inflaría el LTV de quien no compró.
  it('ignora los pedidos sin comprador', () => {
    const m = agregarPorComprador([
      { buyer_id: null, product_price: 999, created_at: haceDias(1) },
      { product_price: 999, created_at: haceDias(1) },
    ])
    expect(m.size).toBe(0)
  })

  it('un precio ausente no rompe la suma', () => {
    const m = agregarPorComprador([{ buyer_id: 'a', product_price: null, created_at: haceDias(1) }])
    expect(m.get('a')?.gastado).toBe(0)
  })
})

describe('cuándo le toca volver', () => {
  const ahora = Date.now()
  const seg = (dias: number) => segmentoDe(ahora - dias * DIA, ahora, 30, 60)

  it('recién compró: todavía no le toca nada', () => {
    expect(seg(1)).toBeNull()
    expect(seg(29)).toBeNull()
  })

  it('entre las dos ventanas le toca recompra', () => {
    expect(seg(30)).toBe('restock')
    expect(seg(59)).toBe('restock')
  })

  it('pasada la segunda ventana se está yendo', () => {
    expect(seg(60)).toBe('winback')
    expect(seg(365)).toBe('winback')
  })

  // A quien nunca compró no se le puede pedir que "vuelva".
  it('sin último pedido no hay segmento', () => {
    expect(segmentoDe(0, ahora, 30, 60)).toBeNull()
  })
})

describe('las ventanas de la tienda', () => {
  it('tiene los mismos valores por defecto en todos lados', () => {
    expect(ventanasDe(null)).toEqual({ restockDias: 30, winbackDias: 60 })
    expect(ventanasDe({})).toEqual({ restockDias: 30, winbackDias: 60 })
  })

  // Una ventana de 0 días marcaría a todo el mundo como "toca recompra" el
  // mismo día que compró.
  it('nunca baja de un día', () => {
    expect(ventanasDe({ restock_days: 0, winback_days: -5 }))
      .toEqual({ restockDias: 1, winbackDias: 1 })
  })
})

// ─── Cómo se lee un cliente de un vistazo ───────────────────────────────────
describe('el resumen de una persona', () => {
  const base = {
    id: 'c1', nombre: 'Ana', document_type: 'DNI', document_number: '12345678',
    phone: '999999999', puntos: 0, score: 50, source: 'order',
    activated_at: null, created_at: null, ultimo: null, segmento: null,
  }

  it('lo primero que hay que saber es si ya compró', () => {
    expect(resumenDeCliente({ ...base, pedidos: 0, gastado: 0 })).toBe('Sin comprar')
    expect(resumenDeCliente({ ...base, pedidos: 0, gastado: 0, activated_at: '2026-01-01' }))
      .toBe('En la app, sin comprar')
  })

  it('con compras dice cuántas y cuánto', () => {
    expect(resumenDeCliente({ ...base, pedidos: 1, gastado: 120 })).toBe('1 pedido · S/ 120')
    expect(resumenDeCliente({ ...base, pedidos: 3, gastado: 349.6 })).toBe('3 pedidos · S/ 350')
  })
})
