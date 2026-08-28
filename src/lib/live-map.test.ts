import { describe, it, expect } from 'vitest'
import { estadoDePago, avanceDelPaquete, vaEnElMapa, proyector } from './live-map'

describe('mapa de pedidos en vivo', () => {
  describe('cómo va el dinero', () => {
    it('sin cruce verificado no hay plata, aunque el adelanto esté declarado', () => {
      expect(estadoDePago({ advance_amount: 60, product_price: 120 })).toBe('pendiente')
      expect(estadoDePago({ advance_amount: 60, product_price: 120, payment_verification: 'UNMATCHED' }))
        .toBe('pendiente')
    })

    it('adelanto cruzado que no cubre el total es pago parcial', () => {
      expect(estadoDePago({ advance_amount: 60, product_price: 120, payment_verification: 'MATCHED' }))
        .toBe('parcial')
    })

    it('adelanto cruzado que cubre el total es pago completo', () => {
      expect(estadoDePago({ advance_amount: 120, product_price: 120, payment_verification: 'MATCHED' }))
        .toBe('completo')
    })
  })

  describe('dónde está el paquete', () => {
    it('recorre la línea según lo que reporta el courier', () => {
      expect(avanceDelPaquete({ tracking_phase: 'EN_ORIGEN' })).toBeLessThan(0.2)
      expect(avanceDelPaquete({ tracking_phase: 'EN_TRANSITO' })).toBe(0.5)
      expect(avanceDelPaquete({ tracking_phase: 'EN_DESTINO' })).toBeGreaterThan(0.8)
      expect(avanceDelPaquete({ tracking_phase: 'ENTREGADO' })).toBe(1)
    })

    it('sin reporte del courier manda el reloj interno', () => {
      expect(avanceDelPaquete({ stage: 'en_camino' })).toBe(0.5)
      expect(avanceDelPaquete({ stage: 'preparando' })).toBeLessThan(0.2)
      expect(avanceDelPaquete({ stage: 'entregado' })).toBe(1)
    })
  })

  it('al mapa entran los envíos por agencia que siguen vivos', () => {
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_PROVINCIA', stage: 'en_camino' })).toBe(true)
    expect(vaEnElMapa({ dispatch_type: 'MOTORIZADO_LIMA', stage: 'en_camino' })).toBe(false)
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_PROVINCIA', stage: 'no_entregado' })).toBe(false)
  })

  // El recojo en agencia de LIMA es un recojo. Quedaba fuera del mapa porque
  // "es agencia" estaba definido dos veces y una de las dos no lo conocía —
  // justo el caso que vende hoy Kross Shop, con domicilio apagado.
  // Las cuatro vistas comparten una sola lista y esa lista trae cancelados,
  // así que el filtro del mapa tiene que descartarlos él mismo.
  it('un pedido cancelado no entra al mapa aunque sea recojo en agencia', () => {
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_LIMA', stage: 'en_camino', status: 'cancelado' })).toBe(false)
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_LIMA', stage: 'en_camino', status: 'active' })).toBe(true)
  })

  // Un pedido de prueba paseándose por el mapa del país es exactamente el tipo
  // de cosa que hace desconfiar de una pantalla entera.
  it('un pedido anulado tampoco entra al mapa', () => {
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_LIMA', stage: 'en_camino', status: 'anulado' })).toBe(false)
  })

  it('el recojo en agencia de Lima también entra al mapa', () => {
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_LIMA', stage: 'preparando' })).toBe(true)
    expect(vaEnElMapa({ dispatch_type: 'AGENCIA_LIMA', stage: 'no_entregado' })).toBe(false)
  })

  // Sin corregir por el coseno de la latitud, el Perú sale gordo.
  it('la proyección corrige la longitud por la latitud', () => {
    const caja = { minLng: -81.6, maxLng: -68.5, minLat: -18.6, maxLat: -3.2 }
    const p = proyector(caja, 700, 880)
    expect(p.x(caja.minLng)).toBeCloseTo(0)
    expect(p.y(caja.maxLat)).toBeCloseTo(0)
    // Un grado de longitud ocupa menos que uno de latitud.
    expect(p.x(-80.6) - p.x(-81.6)).toBeLessThan(p.y(-4.2) - p.y(-3.2))
  })
})
