import { describe, it, expect } from 'vitest'
import { entregasDemo } from './demo/tienda-demo'
import { agruparPorDistrito, indicePadron, ubicadorDe, productosDe, filtrarPorProducto } from './mapa-entregas'
import type { CatalogosGeo, DistritoPadron, Ubicacion } from './mapa-entregas'

// ─── El mapa de entregas, de punta a punta ───────────────────────────────────
//
// Con los catálogos REALES: las 911 sedes de Shalom y Olva, el padrón del INEI
// y los centroides. Es la única manera de saber que el mapa de verdad se puede
// dibujar — el resto de las pruebas usan datos de juguete, y un resolutor que
// pasa con "Miraflores, Lima" puede fallar con las 487 sedes de Shalom.
//
// Prueba además que el demo y la pantalla ubican IGUAL: las dos llaman a
// `ubicadorDe`, así que si esto resuelve, la pantalla resuelve.

const catalogos = async (): Promise<CatalogosGeo> => {
  const [centros, distritos, sh, ol] = await Promise.all([
    import('../data/coverage/district-centroids.json'),
    import('../data/coverage/peru-districts.json'),
    import('../data/agencies/shalom.json'),
    import('../data/agencies/olva.json'),
  ])
  const sedes = new Map<string, Ubicacion>()
  const cargar = (m: { default: unknown }, courier: string) => {
    const branches = (m.default as { branches: { id: string; district: string; department: string; lat?: number; lng?: number }[] }).branches
    for (const b of branches) {
      if (b.lat == null || b.lng == null) continue
      sedes.set(`${courier}:${b.id}`, { distrito: b.district, departamento: b.department, lat: b.lat, lng: b.lng })
    }
  }
  cargar(sh, 'SHALOM')
  cargar(ol, 'OLVA')
  return {
    sedes,
    padron: indicePadron((distritos.default as unknown as { districts: DistritoPadron[] }).districts),
    centroides: (centros.default as unknown as { districts: Record<string, { lat: number; lng: number }> }).districts,
  }
}

const cat = await catalogos()
const { grupos, entregados } = await entregasDemo()
const mapa = agruparPorDistrito(grupos, ubicadorDe(cat))

describe('el mapa de entregas con los catálogos reales', () => {
  it('el demo entrega tanto como dice su historial', () => {
    expect(entregados).toBeGreaterThan(2000)
    expect(mapa.pedidos).toBe(entregados)
  })

  // Un mapa de cinco puntos no es un mapa del Perú.
  it('reparte las entregas por el país, no en un puñado de sitios', () => {
    expect(mapa.distritos.length).toBeGreaterThan(30)
    const departamentos = new Set(mapa.distritos.map(d => d.departamento))
    expect(departamentos.size).toBeGreaterThan(8)
  })

  // Lima concentra: es como se comporta el país, y un mapa donde todos los
  // distritos pesan igual no enseña lo único que un mapa así sirve para ver.
  it('tiene la forma del país: una cabeza grande y una cola larga', () => {
    expect(mapa.distritos[0].pedidos).toBeGreaterThan(mapa.distritos[mapa.distritos.length - 1].pedidos)
    const arriba = mapa.distritos.slice(0, 5).reduce((n, d) => n + d.pedidos, 0)
    expect(arriba / mapa.pedidos).toBeGreaterThan(0.2)
  })

  // Lo caro de equivocarse acá: si el resolutor no encuentra las sedes, el mapa
  // sale vacío y el total entero cae en "sin ubicar" sin que nada se rompa.
  it('ubica a casi todos: las sedes de los couriers se resuelven', () => {
    expect(mapa.sinUbicar.pedidos / mapa.pedidos).toBeLessThan(0.05)
  })

  // Pero algo sin ubicar SÍ hay, y a propósito: el demo manda una parte por
  // dirección escrita, y una de esas direcciones no se puede desambiguar. Sin
  // eso, el renglón que existe para no mentir con el total no se vería nunca.
  it('deja algo sin ubicar, que es lo que pasa de verdad', () => {
    expect(mapa.sinUbicar.pedidos).toBeGreaterThan(0)
  })

  it('cada punto cae dentro del Perú', () => {
    for (const d of mapa.distritos) {
      expect(d.lat).toBeGreaterThan(-18.7)
      expect(d.lat).toBeLessThan(-0.01)
      expect(d.lng).toBeGreaterThan(-81.7)
      expect(d.lng).toBeLessThan(-68.4)
    }
  })

  it('los puntos más lo sin ubicar dan el total, siempre', () => {
    const suma = mapa.distritos.reduce((n, d) => n + d.pedidos, 0) + mapa.sinUbicar.pedidos
    expect(suma).toBe(mapa.pedidos)
    const plata = mapa.distritos.reduce((n, d) => n + d.valor, 0) + mapa.sinUbicar.valor
    expect(plata).toBeCloseTo(mapa.valor)
  })

  it('el desglose por producto de un distrito suma su total', () => {
    for (const d of mapa.distritos.slice(0, 10)) {
      expect(d.porProducto.reduce((n, p) => n + p.pedidos, 0)).toBe(d.pedidos)
      expect(d.porProducto.reduce((n, p) => n + p.valor, 0)).toBeCloseTo(d.valor)
    }
  })
})

describe('el filtro de producto sobre datos reales', () => {
  const productos = productosDe(grupos)

  it('ofrece los tres productos de la tienda de ejemplo', () => {
    expect(productos).toHaveLength(3)
    expect(productos.every(p => p.nombre && p.pedidos > 0)).toBe(true)
  })

  // Filtrar tiene que MOVER el mapa: si los números no cambian, el filtro está
  // ahí de adorno.
  it('filtrar por un producto recorta el mapa y sus totales', () => {
    const uno = agruparPorDistrito(filtrarPorProducto(grupos, productos[0].id), ubicadorDe(cat))
    expect(uno.pedidos).toBe(productos[0].pedidos)
    expect(uno.pedidos).toBeLessThan(mapa.pedidos)
    expect(uno.distritos.length).toBeLessThanOrEqual(mapa.distritos.length)
  })

  it('la suma de los tres productos es el total del mapa', () => {
    const suma = productos.reduce((n, p) => n + p.pedidos, 0)
    expect(suma).toBe(mapa.pedidos)
  })
})
