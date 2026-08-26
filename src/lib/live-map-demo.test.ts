import { describe, it, expect } from 'vitest'
import { escenaDemo } from './live-map-demo'
import { estadoDePago } from './live-map'

// El riesgo real de un demo no es que se vea feo: es que se vea VACÍO. Si un
// departamento del guion no existe en el listado del courier, ese pedido se
// cae en silencio y el vendedor abre "Ver ejemplo" para encontrar el mismo
// país desierto que quería llenar.
describe('escena de ejemplo del mapa', () => {
  it('todas las cajas del guion encuentran sus dos sedes reales', async () => {
    const { pedidos, origenPorProducto } = await escenaDemo()

    expect(pedidos.length).toBe(8)
    for (const p of pedidos) {
      expect(p.agency_branch_id).toBeTruthy()
      expect(origenPorProducto[p.product_id!]).toBeTruthy()
      expect(['SHALOM', 'OLVA']).toContain(p.tracking_courier)
    }
  })

  it('muestra los tres estados de pago, que es lo que la demo tiene que explicar', async () => {
    const { pedidos } = await escenaDemo()
    const estados = new Set(pedidos.map(estadoDePago))
    expect(estados).toEqual(new Set(['completo', 'parcial', 'pendiente']))
  })

  it('muestra cajas en las tres posiciones del camino', async () => {
    const { pedidos } = await escenaDemo()
    const fases = new Set(pedidos.map(p => p.tracking_phase))
    expect(fases).toEqual(new Set(['EN_ORIGEN', 'EN_TRANSITO', 'EN_DESTINO']))
  })
})
