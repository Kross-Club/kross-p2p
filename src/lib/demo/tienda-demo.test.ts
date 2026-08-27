import { describe, it, expect } from 'vitest'
import { tiendaDemo, fichaDemoDeCliente, PEDIDOS_POR_DIA, pedidoDemoPorToken, esTokenDemo, AUDIO_DEMO } from './tienda-demo'
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

// La bandeja del demo llevaba a "Sesión no encontrada": el pedido de ejemplo no
// existe en la base, así que la pantalla tiene que abrirlo desde el generador.
describe('abrir un pedido de ejemplo', () => {
  it('reconoce sus tokens sin consultar nada', () => {
    expect(esTokenDemo('demo-42')).toBe(true)
    expect(esTokenDemo('abc123')).toBe(false)
    expect(esTokenDemo(null)).toBe(false)
  })

  it('cada pedido de la lista se puede abrir por su token', async () => {
    for (const p of t.pedidos.slice(0, 5)) {
      expect(await pedidoDemoPorToken(p.token)).toMatchObject({ id: p.id })
    }
  })

  it('un token que no es de ejemplo no devuelve nada', async () => {
    expect(await pedidoDemoPorToken('token-real')).toBeNull()
  })

  it('los pedidos traen conversación, no un chat vacío', () => {
    for (const p of t.pedidos.slice(0, 10)) {
      expect((p.chat_messages ?? []).length).toBeGreaterThan(2)
    }
    expect(t.pedidos.some(p => (p.chat_messages ?? []).some(m => m.sender_role === 'buyer'))).toBe(true)
  })

  // La llamada es un evento del pedido (11-RELACIONES): en el demo también.
  it('algunos pedidos tienen llamada con grabación enganchada', () => {
    const conGrabacion = t.pedidos.filter(p =>
      (p.chat_messages ?? []).some(m => m.type === 'call_log' && (m as { call_recording_id?: string }).call_recording_id))
    expect(conGrabacion.length).toBeGreaterThan(5)
  })

  it('el audio de ejemplo es un WAV de verdad, no un botón muerto', () => {
    expect(AUDIO_DEMO.startsWith('data:audio/wav;base64,')).toBe(true)
    expect(AUDIO_DEMO.length).toBeGreaterThan(1000)
  })
})

describe('la ficha de un cliente de ejemplo', () => {
  // Abrir a una persona pedía `list-clients`, que consulta la base de verdad y
  // no sabe nada de un `demo-cli-7`: la ficha decía "No se pudo cargar" justo
  // donde se ve la recompra.
  it('se puede abrir a cualquiera de la libreta', async () => {
    const alguien = t.clientes.find(c => c.pedidos >= 2)!
    const ficha = await fichaDemoDeCliente(alguien.id)
    expect(ficha).not.toBeNull()
    expect(ficha!.cliente.id).toBe(alguien.id)
  })

  it('quien no existe no inventa una ficha', async () => {
    expect(await fichaDemoDeCliente('demo-cli-999999')).toBeNull()
  })

  // Las dos mitades: lo vivo (con chat) y lo entregado (sin chat que guardar).
  it('junta los pedidos vivos y el historial, del más nuevo al más viejo', async () => {
    const conVivo = t.pedidos.find(p => p.buyer_id)!
    const ficha = (await fichaDemoDeCliente(conVivo.buyer_id!))!
    expect(ficha.pedidos.length).toBeGreaterThan(0)
    expect(ficha.pedidos.some(p => p.token)).toBe(true)

    const fechas = ficha.pedidos.map(p => Date.parse(p.created_at ?? ''))
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas)
  })

  // El número de pedido es con lo que el vendedor distingue un pedido de otro
  // del mismo cliente: sin él, la lista son cuatro filas parecidas.
  it('todos los pedidos traen su número, y ninguno se repite', async () => {
    const ficha = (await fichaDemoDeCliente(t.clientes.find(c => c.pedidos >= 3)!.id))!
    for (const p of ficha.pedidos) expect(p.order_id).toMatch(/^ORD-\d+$/)
    const numeros = ficha.pedidos.map(p => p.order_id)
    expect(new Set(numeros).size).toBe(numeros.length)
  })

  it('el historial no finge tener chat', async () => {
    const ficha = (await fichaDemoDeCliente(t.clientes.find(c => c.pedidos >= 3)!.id))!
    for (const p of ficha.pedidos.filter(p => !p.token)) {
      expect(p.stage).toBe('entregado')
    }
  })
})

describe('quién está en línea', () => {
  // Un tablero de mil pedidos al día donde ningún cliente está conectado no
  // enseña la herramienta: enseña un dato apagado.
  it('hay compradores conectados, pero no todos', () => {
    expect(t.enLinea.length).toBeGreaterThan(3)
    expect(t.enLinea.length).toBeLessThan(t.pedidos.length)
  })

  it('los conectados son compradores que existen en la ventana viva', () => {
    const deLaVentana = new Set(t.pedidos.map(p => p.buyer_id))
    for (const id of t.enLinea) expect(deLaVentana.has(id)).toBe(true)
  })

  it('no se repiten', () => {
    expect(new Set(t.enLinea).size).toBe(t.enLinea.length)
  })
})
