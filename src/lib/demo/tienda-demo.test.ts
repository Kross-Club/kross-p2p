import { describe, it, expect } from 'vitest'
import { cobradoDelPedido } from '../order-money'
import { tiendaDemo, fichaDemoDeCliente, marcarRespondidoDemo, PEDIDOS_POR_DIA, pedidoDemoPorToken, esTokenDemo, AUDIO_DEMO } from './tienda-demo'
import { columnaDelPedido, COLUMNAS } from '../order-tracking'
import { avanceDelPago, cobrosDelPedido, saldoDelPedido } from '../order-money'
import { conCambios, reiniciarDemo } from './cambios-demo'
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

  // Las dos mitades: la ventana viva y el historial entregado. Las dos se
  // abren igual — un pedido viejo es un pedido, no un renglón de resumen.
  it('junta los pedidos vivos y el historial, del más nuevo al más viejo', async () => {
    const conVivo = t.pedidos.find(p => p.buyer_id)!
    const ficha = (await fichaDemoDeCliente(conVivo.buyer_id!))!
    expect(ficha.pedidos.length).toBeGreaterThan(0)
    expect(ficha.pedidos.some(p => p.token)).toBe(true)

    const fechas = ficha.pedidos.map(p => Date.parse(p.created_at ?? ''))
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas)
  })

  // Todo pedido nace de un formulario, así que todo pedido tiene chat: un
  // "pedido sin chat" no existe en el producto y el demo no debe inventarlo.
  it('todos sus pedidos se pueden abrir, también los viejos', async () => {
    const ficha = (await fichaDemoDeCliente(t.clientes.find(c => c.pedidos >= 3)!.id))!
    expect(ficha.pedidos.length).toBeGreaterThan(0)
    for (const p of ficha.pedidos) expect(p.token).toBeTruthy()
  })

  it('un pedido viejo se abre entero: con chat, guía y adelanto cruzado', async () => {
    const persona = t.clientes.find(c => c.pedidos >= 3)!
    const ficha = (await fichaDemoDeCliente(persona.id))!
    const viejo = ficha.pedidos.find(p => p.token?.startsWith('demo-h-'))!
    expect(viejo).toBeTruthy()

    const pedido = (await pedidoDemoPorToken(viejo.token!))!
    expect(pedido).not.toBeNull()
    // Es de esta persona, no de cualquiera: la ficha lista SUS pedidos.
    expect(pedido.buyer_id).toBe(persona.id)
    expect(pedido.stage).toBe('entregado')
    expect(pedido.tracking_numero).toBeTruthy()
    expect(pedido.payment_verification).toBe('MATCHED')
    expect((pedido.chat_messages ?? []).length).toBeGreaterThan(2)
  })

  it('abrir el mismo pedido viejo dos veces da lo mismo', async () => {
    const uno = await pedidoDemoPorToken('demo-h-7')
    const otro = await pedidoDemoPorToken('demo-h-7')
    expect(uno).toEqual(otro)
  })
})

describe('la bandeja del demo', () => {
  // Sin esto NINGÚN pedido de ejemplo quedaba "sin responder": todas las
  // conversaciones cerraban con la tienda o con un aviso del sistema, así que
  // la vista salía siempre en cero y el botón de cerrarla no se veía nunca.
  it('hay chats donde el último en escribir es el cliente', () => {
    const ultimoDelCliente = t.pedidos.filter(p => {
      const m = p.chat_messages ?? []
      return m.length > 0 && m[m.length - 1].sender_role === 'buyer'
    })
    expect(ultimoDelCliente.length).toBeGreaterThan(5)
    expect(ultimoDelCliente.length).toBeLessThan(t.pedidos.length)
  })

  // Los dos casos, porque piden cosas distintas: una pregunta hay que
  // contestarla; un "gracias" se cierra a mano.
  it('los hay que piden respuesta y los hay que no', () => {
    const ultimos = t.pedidos
      .map(p => (p.chat_messages ?? []).slice(-1)[0])
      .filter(m => m?.sender_role === 'buyer')
      .map(m => m.body ?? '')
    expect(ultimos.some(b => b.includes('?'))).toBe(true)
    expect(ultimos.some(b => /Gracias|Ok|Buenísimo/.test(b))).toBe(true)
  })

  // El caso que motivó separar turnos de avisos: el cliente pregunta, después
  // entra el pago y el sistema lo anuncia. El turno sigue siendo del cliente.
  it('hay hilos donde el cliente habló último aunque el sistema cerrara', () => {
    const conAviso = t.pedidos.filter(p => {
      const m = p.chat_messages ?? []
      if (!m.length || m[m.length - 1].sender_role !== 'system') return false
      const humano = [...m].reverse().find(x => x.sender_role === 'buyer' || x.sender_role === 'seller')
      return humano?.sender_role === 'buyer'
    })
    expect(conAviso.length).toBeGreaterThan(0)
  })

  it('algunos ya vienen cerrados a mano', () => {
    const cerrados = t.pedidos.filter(p => p.answered_at)
    expect(cerrados.length).toBeGreaterThan(5)
    expect(cerrados.length).toBeLessThan(t.pedidos.length)
  })

  // Se anota como cualquier otro cambio del demo (cambios-demo.ts) en vez de
  // mutar el generador: así sobrevive a recargar la página y se va al apagar el
  // demo, igual que mover de etapa o cambiar una cantidad. El generador queda
  // intacto —es lo que hace que dos pantallas sigan comparando lo mismo—, y el
  // cambio se ve al leerlo.
  it('marcar como respondido en demo se anota como cambio, no muta el generador', async () => {
    const sinCerrar = t.pedidos.find(p => !p.answered_at)!
    const cuando = await marcarRespondidoDemo(sinCerrar.id)
    expect(cuando).toBeTruthy()
    expect(conCambios(sinCerrar).answered_at).toBe(cuando)
    const otra = await tiendaDemo()
    expect(otra.pedidos.find(p => p.id === sinCerrar.id)?.answered_at).toBeFalsy()
    reiniciarDemo()
    expect(conCambios(sinCerrar).answered_at).toBeFalsy()
  })

  it('un pedido que no existe no se marca', async () => {
    expect(await marcarRespondidoDemo('demo-ped-999999')).toBeNull()
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

// ─── Las dos operaciones de cobro ────────────────────────────────────────────
//
// Sin pedidos que hayan pagado el saldo, media pantalla no se puede enseñar: el
// segundo recuadro verde, el anillo lleno y el filtro de pagos quedarían vacíos
// en la única tienda que se usa para enseñar la herramienta.

describe('el saldo en la tienda de ejemplo', () => {
  const dobles = t.pedidos.filter(p => {
    const c = cobrosDelPedido(p)
    return c.length === 2 && c.every(x => x.verificado)
  })

  it('hay pedidos que hicieron los dos pagos, el adelanto y el saldo', () => {
    expect(dobles.length).toBeGreaterThan(10)
    expect(dobles.every(p => p.buyers?.document_number)).toBe(true)
  })

  // Los tres caminos, porque el desplegable de pagos ofrece solo los que existen:
  // sin uno de ellos, la opción no aparecería y el demo enseñaría de menos.
  it('enseña los tres cobros: adelanto, pago total y saldo', () => {
    const tipos = new Set(t.pedidos.flatMap(p => cobrosDelPedido(p).filter(c => c.verificado).map(c => c.tipo)))
    expect([...tipos].sort()).toEqual(['adelanto', 'saldo', 'total'])
  })

  // El cupón emitido y sin pagar es el estado ámbar. Tiene que existir para que
  // se vea que un cupón NO es plata que entró.
  it('tiene cupones de saldo emitidos y sin pagar', () => {
    expect(t.pedidos.some(p => p.saldo_verification === 'PENDING')).toBe(true)
  })

  // El banco cobra siempre el cupón pendiente más antiguo: con el adelanto sin
  // cruzar, quien paga su saldo termina pagando el adelanto por otro monto. Un
  // demo que generara esa combinación enseñaría una pantalla imposible.
  it('nunca hay saldo sin un adelanto ya cruzado, ni saldo sobre un pago total', () => {
    for (const p of t.pedidos.filter(x => x.saldo_amount)) {
      expect(p.payment_verification).toBe('MATCHED')
      expect(Number(p.advance_amount)).toBeLessThan(Number(p.product_price))
      expect(Number(p.saldo_amount)).toBe(Number(p.product_price) - Number(p.advance_amount))
    }
  })

  it('el saldo llena el anillo, y no pagarlo lo deja a medias', () => {
    expect(dobles.every(p => avanceDelPago(p).completo)).toBe(true)
    const aMedias = t.pedidos.filter(p => p.saldo_verification === 'PENDING')
    expect(aMedias.every(p => !avanceDelPago(p).completo)).toBe(true)
  })

  // El contraste es el punto: si todos los entregados tuvieran el anillo lleno,
  // el anillo no distinguiría nada. Los que cobraron por fuera y solo movieron
  // la etapa existen, y así se ven.
  it('hay entregados con el anillo a medias: cobraron por fuera', () => {
    const entregados = t.pedidos.filter(p => p.stage === 'entregado')
    expect(entregados.some(p => avanceDelPago(p).completo)).toBe(true)
    expect(entregados.some(p => !avanceDelPago(p).completo)).toBe(true)
  })
})

// ─── El upsell ───────────────────────────────────────────────────────────────

describe('los pedidos con upsell', () => {
  // Sin ninguno, el anillo parecería tener solo tres posiciones —vacío, mitad,
  // lleno— y lo que enseña es justamente que mide una proporción.
  it('hay pedidos donde el adelanto no es ni la mitad ni el total', () => {
    const raros = t.pedidos.filter(p => {
      const f = avanceDelPago(p).fraccion
      return f > 0 && Math.abs(f - 0.5) > 0.02 && f < 0.99
    })
    expect(raros.length).toBeGreaterThan(3)
  })

  // El adelanto se cobró sobre el total de ANTES, así que sobre el de ahora
  // queda corto: el anillo baja y aparece un saldo que antes no existía.
  it('el anillo de un upsell nunca está lleno, y deja saldo', () => {
    for (const p of t.pedidos.filter(x => avanceDelPago(x).fraccion > 0 && !avanceDelPago(x).completo)) {
      expect(saldoDelPedido(p)).toBeGreaterThan(0)
    }
  })

  // El saldo se cobra contra el total del momento. Un pedido de ejemplo con las
  // dos cosas mezcladas enseñaría una cuenta que no cuadra.
  it('ningún pedido mezcla upsell con saldo cobrado', () => {
    for (const p of t.pedidos.filter(x => x.saldo_amount)) {
      expect(Number(p.advance_amount) + Number(p.saldo_amount)).toBe(Number(p.product_price))
    }
  })
})

// ─── La lista de cobros y las columnas dicen lo mismo (bloque §36) ───────────
//
// El demo genera las dos formas mientras dura la mudanza. Si dijeran cosas
// distintas, enseñaría un pedido que no cuadra consigo mismo — y quien mira
// concluiría, con razón, que el panel no sabe cuánto cobró.

describe('los cobros del demo', () => {
  it('cada pedido trae su lista, y coincide con sus columnas', async () => {
    const t = await tiendaDemo()
    for (const p of t.pedidos.slice(0, 200)) {
      const lista = p.cobros ?? []
      const adelanto = lista.find(c => c.tipo === 'adelanto')
      expect(Number(adelanto?.monto)).toBe(Number(p.advance_amount))
      expect(adelanto?.estado).toBe(p.payment_verification)
      expect(adelanto?.matched_at ?? null).toBe(p.payment_matched_at ?? null)

      const saldo = lista.find(c => c.tipo === 'saldo')
      if (p.saldo_amount) {
        expect(Number(saldo?.monto)).toBe(Number(p.saldo_amount))
        expect(saldo?.estado).toBe(p.saldo_verification)
        expect(saldo?.matched_at ?? null).toBe(p.saldo_matched_at ?? null)
      } else {
        expect(saldo).toBeUndefined()
      }
    }
  })

  // Y lo que de verdad importa: que las dos lecturas den la misma plata.
  it('lo cobrado sale igual por los dos caminos', async () => {
    const t = await tiendaDemo()
    for (const p of t.pedidos.slice(0, 200)) {
      // Sin la lista, `cobrosDelPedido` cae en las columnas: es el otro camino.
      const soloColumnas = { ...p, cobros: null }
      expect(cobradoDelPedido(p)).toBe(cobradoDelPedido(soloColumnas))
    }
  })
})
