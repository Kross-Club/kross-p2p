import { describe, it, expect } from 'vitest'
import {
  claveDistrito, normalizar, titulo, indicePadron, distritoDeDireccion,
  agruparPorDistrito, productosDe, filtrarPorProducto, radioDe, ubicadorDe,
} from './mapa-entregas'
import type { GrupoEntrega, DistritoPadron, Ubicacion, CatalogosGeo } from './mapa-entregas'

const PADRON: DistritoPadron[] = [
  { department: 'Lima', province: 'Lima', district: 'Miraflores' },
  { department: 'Arequipa', province: 'Arequipa', district: 'Miraflores' },
  { department: 'Lima', province: 'Lima', district: 'San Juan de Lurigancho' },
  { department: 'Amazonas', province: 'Bagua', district: 'Aramango' },
  { department: 'Arequipa', province: 'Arequipa', district: 'Arequipa' },
  { department: 'Áncash', province: 'Santa', district: 'Chimbote' },
]
const idx = indicePadron(PADRON)

const grupo = (g: Partial<GrupoEntrega>): GrupoEntrega => ({
  courier: null, branch_id: null, address: null,
  product_id: null, product_name: null, pedidos: 1, valor: 100, ...g,
})

describe('la llave del distrito', () => {
  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(claveDistrito('Áncash', 'Chimbote')).toBe('ANCASH|CHIMBOTE')
    expect(claveDistrito(' lima ', 'san  juan de lurigancho')).toBe('LIMA|SAN JUAN DE LURIGANCHO')
  })

  it('normalizar aguanta lo vacío', () => {
    expect(normalizar(null)).toBe('')
    expect(normalizar('  ')).toBe('')
  })
})

// El `address` no tiene un formato fijo: el checkout lo arma distinto en cada
// rama. Partir por comas y asumir una posición falla en tres de las cuatro.
describe('leer el distrito de una dirección escrita', () => {
  it('lo encuentra en cualquiera de los formatos del checkout', () => {
    // Provincia con agencia: "Distrito, Provincia, Departamento"
    expect(distritoDeDireccion('Aramango, Bagua, Amazonas', idx)?.district).toBe('Aramango')
    // Provincia a domicilio: la calle primero, sin departamento
    expect(distritoDeDireccion('Jr. Union 44, Aramango, Bagua', idx)?.district).toBe('Aramango')
    // Lima a domicilio: solo calle y distrito
    expect(distritoDeDireccion('Av. Larco 123, Miraflores, Lima', idx)?.department).toBe('Lima')
  })

  it('desempata los homónimos con el resto de la dirección', () => {
    expect(distritoDeDireccion('Miraflores, Lima', idx)?.department).toBe('Lima')
    expect(distritoDeDireccion('Miraflores, Arequipa', idx)?.department).toBe('Arequipa')
  })

  // Un punto en el distrito equivocado es peor que un punto que falta: el que
  // falta se ve como falta, el equivocado se lee como dato.
  it('cuando no puede desempatar NO adivina', () => {
    expect(distritoDeDireccion('Av. Larco 123, Miraflores', idx)).toBeNull()
  })

  it('un distrito que se llama como su provincia no se desempata consigo mismo', () => {
    // "Arequipa, Arequipa" tiene un solo candidato, así que entra por el camino
    // corto — pero la regla importa igual: `otras` excluye la parte que dio el
    // nombre, si no cualquier repetición valdría como desempate.
    expect(distritoDeDireccion('Arequipa, Arequipa', idx)?.district).toBe('Arequipa')
  })

  it('lo vacío y lo desconocido devuelven null, no una excepción', () => {
    expect(distritoDeDireccion(null, idx)).toBeNull()
    expect(distritoDeDireccion('', idx)).toBeNull()
    expect(distritoDeDireccion('Calle Falsa 123', idx)).toBeNull()
  })

  it('acentos y mayúsculas no impiden encontrarlo', () => {
    expect(distritoDeDireccion('CHIMBOTE, SANTA, ANCASH', idx)?.district).toBe('Chimbote')
  })
})

describe('juntar los grupos en puntos del mapa', () => {
  const LIMA: Ubicacion = { distrito: 'Miraflores', departamento: 'Lima', lat: -12.1, lng: -77 }
  const AQP: Ubicacion = { distrito: 'Arequipa', departamento: 'Arequipa', lat: -16.4, lng: -71.5 }

  it('suma pedidos y plata del mismo distrito, vengan de donde vengan', () => {
    const m = agruparPorDistrito(
      [grupo({ pedidos: 3, valor: 450 }), grupo({ pedidos: 2, valor: 300 })],
      () => LIMA,
    )
    expect(m.distritos).toHaveLength(1)
    expect(m.distritos[0].pedidos).toBe(5)
    expect(m.distritos[0].valor).toBe(750)
  })

  // Un total en la esquina que no cuadra con la suma de los puntos destruye la
  // confianza en toda la pantalla.
  it('lo que no se puede ubicar se cuenta aparte, no se descarta', () => {
    const m = agruparPorDistrito(
      [grupo({ pedidos: 3, valor: 450, address: 'x' }), grupo({ pedidos: 7, valor: 700 })],
      g => (g.address ? null : LIMA),
    )
    expect(m.sinUbicar).toEqual({ pedidos: 3, valor: 450 })
    expect(m.distritos[0].pedidos).toBe(7)
    // El total lo cuenta TODO: los puntos más lo que no se pudo colocar.
    expect(m.pedidos).toBe(10)
    expect(m.valor).toBe(1150)
    expect(m.distritos.reduce((n, d) => n + d.pedidos, 0) + m.sinUbicar.pedidos).toBe(m.pedidos)
  })

  // El orden decide quién se pinta encima cuando dos puntos se solapan.
  it('ordena de mayor a menor', () => {
    const m = agruparPorDistrito(
      [grupo({ pedidos: 2, address: 'aqp' }), grupo({ pedidos: 9 })],
      g => (g.address ? AQP : LIMA),
    )
    expect(m.distritos.map(d => d.pedidos)).toEqual([9, 2])
  })

  it('sin grupos devuelve ceros, no NaN', () => {
    const m = agruparPorDistrito([], () => null)
    expect(m).toEqual({ distritos: [], sinUbicar: { pedidos: 0, valor: 0 }, pedidos: 0, valor: 0 })
  })
})

describe('el filtro de productos', () => {
  const grupos = [
    grupo({ product_id: 'p1', product_name: 'Faja', pedidos: 5 }),
    grupo({ product_id: 'p2', product_name: 'Ollas', pedidos: 9 }),
    grupo({ product_id: 'p1', product_name: 'Faja', pedidos: 3 }),
    grupo({ product_id: null, pedidos: 4 }),
  ]

  it('lista los productos del más entregado al menos', () => {
    expect(productosDe(grupos).map(p => [p.id, p.pedidos])).toEqual([['p2', 9], ['p1', 8]])
  })

  // Un filtro con opciones que no existen en el dato enseña a desconfiar de él.
  it('no inventa un producto para los pedidos sin producto', () => {
    expect(productosDe(grupos).map(p => p.id)).not.toContain(null)
    expect(productosDe([])).toEqual([])
  })

  it('sin producto elegido pasa todo', () => {
    expect(filtrarPorProducto(grupos, null)).toHaveLength(4)
    expect(filtrarPorProducto(grupos, 'p1')).toHaveLength(2)
  })
})

// Es el ÁREA la que se lee como cantidad. Escalando el radio en proporción
// directa, un distrito con el cuádruple de pedidos se ve dieciséis veces más
// grande y el mapa miente a favor de Lima.
describe('el tamaño del punto', () => {
  it('el área crece proporcional al conteo, no el radio', () => {
    const r1 = radioDe(25, 100, 0, 20)
    const r4 = radioDe(100, 100, 0, 20)
    // 4× pedidos → 2× radio → 4× área.
    expect(r4 / r1).toBeCloseTo(2)
  })

  it('un distrito sin entregas no dibuja nada', () => {
    expect(radioDe(0, 100)).toBe(0)
    expect(radioDe(5, 0)).toBe(0)
  })

  it('nunca pasa del máximo, aunque el conteo se salga de escala', () => {
    expect(radioDe(500, 100, 3, 22)).toBe(22)
  })

  it('el más chico sigue siendo visible', () => {
    expect(radioDe(1, 10_000, 3, 22)).toBeGreaterThanOrEqual(3)
  })
})

// Los catálogos de los couriers vienen EN MAYÚSCULAS y el padrón del INEI en
// capitalización normal. Mezclados en una lista se leen como dos clases de
// dato, y la de mayúsculas grita.
describe('escribir un nombre de sitio', () => {
  it('capitaliza sin gritar', () => {
    expect(titulo('LA VICTORIA')).toBe('La Victoria')
    expect(titulo('trujillo')).toBe('Trujillo')
  })

  it('las palabras de enlace van en minúscula, salvo al principio', () => {
    expect(titulo('SAN JUAN DE LURIGANCHO')).toBe('San Juan de Lurigancho')
    expect(titulo('VILLA MARIA DEL TRIUNFO')).toBe('Villa Maria del Triunfo')
    expect(titulo('LA LIBERTAD')).toBe('La Libertad')
    expect(titulo('EL AGUSTINO')).toBe('El Agustino')
  })
})

describe('ubicar un grupo', () => {
  const cat: CatalogosGeo = {
    sedes: new Map([
      // Como los trae el courier: en mayúsculas y sin tilde.
      ['SHALOM:7', { distrito: 'MIRAFLORES', departamento: 'LIMA', lat: -12.12, lng: -77.03 }],
      ['OLVA:7', { distrito: 'CERCADO LIMA', departamento: 'LIMA', lat: -12.04, lng: -77.03 }],
    ]),
    padron: idx,
    centroides: { 'AMAZONAS|ARAMANGO': { lat: -5.4, lng: -78.4 } },
  }
  const ubicar = ubicadorDe(cat)

  // Los ids solo son únicos DENTRO de cada courier: Shalom tiene una sede "7" y
  // Olva también. Sin el courier en la llave, media operación cae en el sitio
  // de la otra.
  it('la llave de la sede lleva el courier', () => {
    expect(ubicar(grupo({ courier: 'SHALOM', branch_id: '7' }))?.distrito).toBe('Miraflores')
    expect(ubicar(grupo({ courier: 'OLVA', branch_id: '7' }))?.lat).toBe(-12.04)
  })

  it('escribe el nombre como el padrón cuando lo conoce', () => {
    expect(ubicar(grupo({ courier: 'SHALOM', branch_id: '7' }))?.departamento).toBe('Lima')
  })

  it('y capitaliza lo que el padrón no tiene, en vez de dejarlo gritando', () => {
    expect(ubicar(grupo({ courier: 'OLVA', branch_id: '7' }))?.distrito).toBe('Cercado Lima')
  })

  // En un pedido por agencia el `address` es el distrito del COMPRADOR, no el
  // de la sede: un pedido de Chaclacayo que se recoge en Huaycán se contaría en
  // Chaclacayo. Misma trampa que documenta `ubicacion.ts`.
  it('la sede manda sobre la dirección escrita', () => {
    const g = grupo({ courier: 'SHALOM', branch_id: '7', address: 'Aramango, Bagua, Amazonas' })
    expect(ubicar(g)?.distrito).toBe('Miraflores')
  })

  it('a domicilio cae en el centroide de su distrito', () => {
    expect(ubicar(grupo({ address: 'Aramango, Bagua, Amazonas' }))?.lat).toBe(-5.4)
  })

  // Se podría caer al centro del departamento, pero eso pone un punto rotulado
  // con el nombre de un distrito donde ese distrito no está.
  it('sin centroide no se coloca: se cuenta como sin ubicar', () => {
    expect(ubicar(grupo({ address: 'Miraflores, Lima' }))).toBeNull()
    expect(ubicar(grupo({ courier: 'SHALOM', branch_id: 'no-existe' }))).toBeNull()
    expect(ubicar(grupo({}))).toBeNull()
  })
})

describe('el desglose por producto de cada distrito', () => {
  const LIMA: Ubicacion = { distrito: 'Miraflores', departamento: 'Lima', lat: -12.1, lng: -77 }

  it('suma por producto y ordena por el más entregado', () => {
    const m = agruparPorDistrito([
      grupo({ product_id: 'p1', product_name: 'Faja', pedidos: 2, valor: 300 }),
      grupo({ product_id: 'p2', product_name: 'Ollas', pedidos: 9, valor: 1080 }),
      grupo({ product_id: 'p1', product_name: 'Faja', pedidos: 3, valor: 450 }),
    ], () => LIMA)
    expect(m.distritos[0].porProducto).toEqual([
      { id: 'p2', nombre: 'Ollas', pedidos: 9, valor: 1080 },
      { id: 'p1', nombre: 'Faja', pedidos: 5, valor: 750 },
    ])
  })

  // El desglose que no cuadra con el total de su propia tarjeta es la manera
  // más rápida de perder la confianza en una pantalla.
  it('el desglose suma exactamente el total del distrito', () => {
    const m = agruparPorDistrito([
      grupo({ product_id: 'p1', pedidos: 2, valor: 300 }),
      grupo({ product_id: null, pedidos: 4, valor: 480 }),
    ], () => LIMA)
    const d = m.distritos[0]
    expect(d.porProducto.reduce((n, p) => n + p.pedidos, 0)).toBe(d.pedidos)
    expect(d.porProducto.reduce((n, p) => n + p.valor, 0)).toBe(d.valor)
    expect(d.porProducto.find(p => p.id === null)?.nombre).toBe('Sin producto')
  })
})
