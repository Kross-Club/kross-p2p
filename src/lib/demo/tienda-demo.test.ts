import { describe, it, expect } from 'vitest'
import { cobradoDelPedido } from '../order-money'
import { tiendaDemo, fichaDemoDeCliente, marcarRespondidoDemo, PEDIDOS_POR_DIA, pedidoDemoPorToken, esTokenDemo, AUDIO_DEMO } from './tienda-demo'
import { columnaDelPedido, COLUMNAS } from '../order-tracking'
import { avanceDelPago, cobrosDelPedido, saldoDelPedido } from '../order-money'
import { conCambios, reiniciarDemo } from './cambios-demo'
import { estaVivo } from '../store-orders'
import { mensajeDeClave, mensajeDeOrigen } from '../../../supabase/functions/_shared/mensaje-de-guia.ts'
import { soles, textoDeCobro } from '../../../supabase/functions/_shared/cobro-por-chat.ts'
import { esPickupCodeValido } from '../../../supabase/functions/_shared/shalom-orders.ts'

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

  // La comisión es lo que separa el monto que pagó el cliente del que entra a
  // la cuenta, y es la línea nueva de la tarjeta. Sin esto el demo enseñaría el
  // panel de antes.
  it('los cobros que entraron llevan su comisión, y los pendientes no', () => {
    const todos = t.pedidos.flatMap(p => cobrosDelPedido(p))
    const entraron = todos.filter(c => c.verificado)
    const pendientes = todos.filter(c => !c.verificado)

    expect(entraron.length).toBeGreaterThan(10)
    expect(entraron.every(c => c.comision != null && c.neto != null)).toBe(true)
    // Un cupón emitido y sin pagar no tiene comisión: nadie descontó nada.
    expect(pendientes.every(c => c.comision == null)).toBe(true)
  })

  it('y el neto es el monto menos la comisión, que es la resta que se ve', () => {
    for (const c of t.pedidos.flatMap(p => cobrosDelPedido(p)).filter(c => c.verificado)) {
      expect(c.neto).toBeCloseTo(c.monto - (c.comision ?? 0), 2)
      // El piso de la tarifa: nunca deja al comercio con más de lo que pagó.
      expect(c.comision).toBeGreaterThanOrEqual(1.20)
    }
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


// ─── La columna CONFIRMADO es la vitrina del cobro ───────────────────────────
//
// Ahí se enseñan el comprobante del adelanto y la pre-guía: el pedido recién
// cobrado, listo para registrar su envío. Por eso todos sus pedidos adelantan
// LA MITAD — un "pagó todo" en esa columna no deja saldo que cobrar ni flujo
// que mostrar. (La tirada del azar se hace igual, se use o no: quitarla
// correría el azar de todos los pedidos siguientes.)

describe('en confirmado todos adelantaron la mitad', () => {
  it('ninguno pagó el total: siempre queda saldo que enseñar', () => {
    const confirmados = t.pedidos.filter(p => p.stage === 'confirmado' && estaVivo(p))
    expect(confirmados.length).toBeGreaterThan(0)
    for (const p of confirmados) {
      expect(saldoDelPedido(p)).toBeGreaterThan(0)
      expect(cobrosDelPedido(p).map(c => c.tipo)).toContain('adelanto')
    }
  })
})


// ─── El hilo cuenta lo del envío ─────────────────────────────────────────────
//
// Un pedido con guía la ANUNCIÓ en su momento: el hilo lleva la tarjeta de la
// guía —la misma copy que manda `registrarGuia`— antes de que el courier
// reporte nada. Y los que no tienen guía, no: una guía anunciada que el panel
// no conoce sería un hilo mintiendo.

describe('la guía en los hilos del generador', () => {
  // Y la de Shalom abre el PDF de muestra (el voucher real autorizado): el
  // botón del demo enseña el documento formal, igual que la tienda real. Olva
  // no tiene documento que enseñar, así que su tarjeta va sin PDF y el botón
  // cae a la hoja de la app.
  it('la guía de Shalom lleva el PDF de muestra; la de Olva no', () => {
    const conGuia = t.pedidos.filter(p => (p.stage === 'en_camino' || p.stage === 'entregado') && p.tracking_numero)
    const shalom = conGuia.find(p => String(p.tracking_courier).toUpperCase() === 'SHALOM')
    expect(shalom).toBeTruthy()
    const msg = (shalom?.chat_messages ?? []).find(m => m.type === 'guia')
    expect(msg?.media_url).toContain('.pdf')
    const olva = conGuia.find(p => String(p.tracking_courier).toUpperCase() === 'OLVA')
    if (olva) {
      expect((olva.chat_messages ?? []).find(m => m.type === 'guia')?.media_url ?? null).toBeNull()
    }
  })

  // Con el vocabulario del voucher (`idsDeGuia`): en Shalom el número es el
  // "Nro. de orden" y va con su código; en Olva la guía se llama guía.
  it('los pedidos con guía llevan su tarjeta, con sus identificadores', () => {
    const conGuia = t.pedidos.filter(p => (p.stage === 'en_camino' || p.stage === 'entregado') && p.tracking_numero)
    expect(conGuia.length).toBeGreaterThan(0)
    for (const p of conGuia.slice(0, 20)) {
      const guia = (p.chat_messages ?? []).find(m => m.type === 'guia')
      if (String(p.tracking_courier).toUpperCase() === 'OLVA') {
        expect(guia?.body).toContain(`Guía ${p.tracking_numero}`)
      } else {
        expect(guia?.body).toContain(`Nro. de orden ${p.tracking_numero} · Código ${p.tracking_codigo}`)
      }
    }
  })

  it('los que no tienen guía, no la anuncian', () => {
    const sinGuia = t.pedidos.filter(p => p.stage === 'confirmado')
    expect(sinGuia.length).toBeGreaterThan(0)
    for (const p of sinGuia.slice(0, 20)) {
      expect((p.chat_messages ?? []).some(m => m.type === 'guia')).toBe(false)
    }
  })

  // Los identificadores de la guía Shalom, completos y con el formato real: el
  // código de 4 alfanuméricos del voucher y una clave que pasa por el MISMO
  // validador que usa `shalom-order` al emitir. Olva no lleva ninguno.
  it('toda guía Shalom trae código y una clave que Shalom aceptaría', () => {
    const shalom = t.pedidos.filter(p => p.tracking_numero && String(p.tracking_courier).toUpperCase() === 'SHALOM')
    expect(shalom.length).toBeGreaterThan(0)
    for (const p of shalom) {
      expect(p.tracking_codigo).toMatch(/^[A-Z0-9]{4}$/)
      expect(esPickupCodeValido(String(p.shalom_pickup_code))).toBe(true)
    }
    for (const p of t.pedidos.filter(x => String(x.tracking_courier).toUpperCase() === 'OLVA')) {
      expect(p.shalom_pickup_code ?? null).toBeNull()
    }
  })
})

// ─── La clave de recojo se entrega contra el saldo pagado — y solo entonces ──
//
// Es la regla de seguridad del recojo (quien tiene la clave se lleva el
// paquete) y el demo la enseña igual que la vive la tienda real: el hilo que ya
// pagó su saldo lleva el acuse con su comprobante y la clave; el que debe, Nada.

describe('la clave de recojo en los hilos del generador', () => {
  const shalomConGuia = () => t.pedidos.filter(p =>
    p.tracking_numero && String(p.tracking_courier).toUpperCase() === 'SHALOM')

  it('el hilo que pagó su saldo lleva el acuse —con comprobante— y la clave', () => {
    const pagados = shalomConGuia().filter(p => p.saldo_verification === 'MATCHED')
    expect(pagados.length).toBeGreaterThan(0)
    for (const p of pagados) {
      const msgs = p.chat_messages ?? []
      const acuse = msgs.find(m => /¡Recibimos tu saldo de/.test(m.body ?? ''))
      expect(acuse?.cobro_id).toBe(p.cobros?.find(c => c.tipo === 'saldo')?.id)
      expect(msgs.some(m => m.body === mensajeDeClave(String(p.shalom_pickup_code)))).toBe(true)
    }
  })

  it('el que pagó TODO por adelantado la recibe junto con la guía', () => {
    const total = shalomConGuia().filter(p => saldoDelPedido(p) === 0 && !p.saldo_verification)
    expect(total.length).toBeGreaterThan(0)
    for (const p of total.slice(0, 10)) {
      expect((p.chat_messages ?? []).some(m => m.body === mensajeDeClave(String(p.shalom_pickup_code)))).toBe(true)
    }
  })

  // EL invariante entero, sin excepciones — el reporte fue una captura: un
  // pedido con "Saldo sin pagar S/ 180" en el panel y la clave ya entregada en
  // el chat. Era el upsell: el generador calculaba el saldo de la guía con el
  // precio BASE, así que a quien pagó el total base le soltaba la clave aunque
  // el upsell —que viaja EN el paquete, o sea que existía antes de registrar
  // la guía— le dejara deuda. La clave entregada implica que hoy no se debe
  // nada, o que el saldo cruzó.
  it('ningún hilo con la clave entregada sigue debiendo', () => {
    const conClave = t.pedidos.filter(p =>
      (p.chat_messages ?? []).some(m => (m.body ?? '').includes('Tu clave de recojo es')))
    expect(conClave.length).toBeGreaterThan(0)
    for (const p of conClave) {
      expect(saldoDelPedido(p) === 0 || p.saldo_verification === 'MATCHED').toBe(true)
    }
  })

  // La mitad que importa: a quien la guía le dijo "apenas lo pagues te
  // entregamos tu clave" y no pagó, la entrega NO está en el hilo. Se pregunta
  // por lo que la guía DIJO —"Tu saldo de S/…"—, que con el upsell contado en
  // la guía (arriba) es lo mismo que el saldo de hoy sin cruzar. No se barre
  // por los 4 dígitos sueltos: aparecen por coincidencia en montos y
  // operaciones — lo que revela la clave es el mensaje que la entrega.
  it('el que todavía debe el saldo que la guía le cobró NO tiene la clave', () => {
    const deben = shalomConGuia().filter(p =>
      p.saldo_verification !== 'MATCHED'
      && (p.chat_messages ?? []).some(m => m.type === 'guia' && (m.body ?? '').includes('Tu saldo de S/')))
    expect(deben.length).toBeGreaterThan(0)
    for (const p of deben) {
      expect((p.chat_messages ?? []).some(m => (m.body ?? '').includes('Tu clave de recojo es'))).toBe(false)
    }
  })
})

// ─── La cobranza empieza en origen ───────────────────────────────────────────
//
// Cuando el paquete entra a la agencia de origen, el tracking real anuncia el
// momento (la pre-guía se volvió oficial) y —si el pedido debe su saldo— manda
// solo LA TARJETA DE PAGO, la misma que mandaría el vendedor. Los hilos del
// generador cuentan esa misma historia.

describe('la tarjeta del saldo que manda el tracking, en los hilos', () => {
  const pasaronPorOrigen = () => t.pedidos.filter(p => p.tracking_numero && p.tracking_phase)

  it('todo hilo que pasó por origen lleva el aviso, y la tarjeta si debía', () => {
    const conFase = pasaronPorOrigen()
    expect(conFase.length).toBeGreaterThan(0)
    for (const p of conFase.slice(0, 20)) {
      const msgs = p.chat_messages ?? []
      const courier = String(p.tracking_courier).toUpperCase() === 'OLVA' ? 'OLVA' as const : 'SHALOM' as const
      expect(msgs.some(m => m.body === mensajeDeOrigen(courier))).toBe(true)
      // La guía dice si al registrarse había deuda; la tarjeta va solo entonces.
      const debia = msgs.some(m => m.type === 'guia' && (m.body ?? '').includes('Tu saldo de S/'))
      expect(msgs.some(m => m.type === 'cobro' && m.sender_role === 'system')).toBe(debia)
    }
  })

  // Con la MISMA copy que la tarjeta del vendedor — dos cobros que no se
  // parecen para la misma deuda es lo que la definición única evita.
  it('la tarjeta dice la copy del vendedor, con el saldo de ese momento', () => {
    const p = pasaronPorOrigen().find(x =>
      (x.chat_messages ?? []).some(m => m.type === 'cobro' && m.sender_role === 'system'))
    const tarjeta = (p?.chat_messages ?? []).find(m => m.type === 'cobro')
    const guia = (p?.chat_messages ?? []).find(m => m.type === 'guia')
    const saldo = Number(/Tu saldo de S\/(\d+)/.exec(guia?.body ?? '')?.[1])
    expect(tarjeta?.body).toBe(textoDeCobro(soles(saldo)))
  })

  // El orden es el de la vida real: se cobra primero, la plata entra después.
  it('en los hilos que pagaron, la tarjeta va antes del acuse', () => {
    const pagados = pasaronPorOrigen().filter(p => p.saldo_verification === 'MATCHED')
    expect(pagados.length).toBeGreaterThan(0)
    for (const p of pagados) {
      const msgs = p.chat_messages ?? []
      const iTarjeta = msgs.findIndex(m => m.type === 'cobro')
      const iAcuse = msgs.findIndex(m => /¡Recibimos tu saldo de/.test(m.body ?? ''))
      expect(iTarjeta).toBeGreaterThanOrEqual(0)
      expect(iAcuse).toBeGreaterThan(iTarjeta)
    }
  })

  // Sin reporte del courier no hay cobranza automática: el paquete todavía no
  // entró a origen, y una tarjeta del sistema ahí sería cobrar antes de tiempo.
  it('el hilo sin fase reportada no lleva tarjeta del sistema', () => {
    const sinFase = t.pedidos.filter(p => p.tracking_numero && !p.tracking_phase)
    expect(sinFase.length).toBeGreaterThan(0)
    for (const p of sinFase) {
      expect((p.chat_messages ?? []).some(m => m.type === 'cobro')).toBe(false)
    }
  })
})

// Y la contradicción que se vio en producción no vuelve: NINGÚN pedido de
// confirmado en adelante tiene el adelanto sin cruzar. "Está en Confirmado
// PORQUE la plata entró" — el 8% que el sorteo dejaba en ámbar era un pedido
// diciendo dos cosas a la vez.
describe('de confirmado en adelante la plata entró', () => {
  it('ni un solo adelanto sin pagar después de validando', () => {
    const cobrados = t.pedidos.filter(p => !['nuevo', 'validando'].includes(String(p.stage)))
    expect(cobrados.length).toBeGreaterThan(0)
    for (const p of cobrados) expect(p.payment_verification).toBe('MATCHED')
  })

  // Y al revés TAMPOCO: el webhook escribe `stage: 'confirmado'` en el mismo
  // acto de cruzar el adelanto, así que un pedido en `nuevo` o `validando` con
  // la plata cruzada no puede existir. Era la captura de "Wilder Flores":
  // Pedido creado con el adelanto pagado, cobrado hace días, y el anillo
  // apagado — el pedido diciendo dos cosas a la vez.
  it('ni un solo adelanto cruzado antes de confirmado', () => {
    const tempranos = t.pedidos.filter(p => ['nuevo', 'validando'].includes(String(p.stage)))
    expect(tempranos.length).toBeGreaterThan(0)
    for (const p of tempranos) expect(p.payment_verification).not.toBe('MATCHED')
  })

  // `validando` es "hay un yapeo que todavía no cuadra": su hilo decía
  // "Adelanto verificado" con el panel en ámbar.
  it('el hilo de validando no anuncia un adelanto que no cruzó', () => {
    const validando = t.pedidos.filter(p => p.stage === 'validando')
    expect(validando.length).toBeGreaterThan(0)
    for (const p of validando) {
      expect((p.chat_messages ?? []).some(m => m.body === 'Adelanto verificado')).toBe(false)
    }
  })

  // El expediente `shalom_order_status` lo escribe `shalom-order`, que descarta
  // los pedidos de Olva antes de reclamar nada: un FAILED de Shalom en un
  // pedido Olva es un estado que la tienda real no puede producir.
  it('el expediente de la guía automática solo existe en pedidos Shalom', () => {
    const olva = t.pedidos.filter(p => String(p.agency_name).toUpperCase() === 'OLVA')
    expect(olva.length).toBeGreaterThan(0)
    for (const p of olva) expect(p.shalom_order_status ?? null).toBeNull()
    // Y los FAILED que se enseñan (la alerta "Guía manual") siguen existiendo.
    expect(t.pedidos.some(p => p.shalom_order_status === 'FAILED')).toBe(true)
  })
})
