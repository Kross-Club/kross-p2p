import { describe, it, expect, beforeEach } from 'vitest'
import {
  conCambios, listaConCambios, guardarCambio, agregarMensajeDemo, reiniciarDemo,
  hayCambiosDemo, cambiosDemo, ejecutarEnDemo, avanzarEnDemo, ofertaAceptadaEnDemo,
  ofertaEnviadaEnDemo, cobroEnviadoEnDemo, saldoPagadoEnDemo, invitarEnDemo, reasignarEnDemo, quitarEnDemo,
  cobroExtraEnDemo, cobroExtraPagadoEnDemo,
} from './cambios-demo'
import type { PedidoDemo } from './cambios-demo'
import { avanceDelPago, cobrosDelPedido, cobradoDelPedido, saldoPorCobrar } from '../order-money'
import { columnaDelPedido } from '../order-tracking'
import { acuseDePago } from '../../../supabase/functions/_shared/acuse-de-pago.ts'
import { mensajeDeClave, mensajeDeOrigen } from '../../../supabase/functions/_shared/mensaje-de-guia.ts'
import { textoDeCobro } from '../../../supabase/functions/_shared/cobro-por-chat.ts'
import { esPickupCodeValido } from '../../../supabase/functions/_shared/shalom-orders.ts'

// ─── Un demo que se deja tocar ───────────────────────────────────────────────
//
// Enseñando la herramienta hay que poder mover un pedido de etapa, agregarle un
// producto y escribir en el chat. Nada de eso existe en el servidor —los
// pedidos `demo-…` no están en ninguna tabla—, así que vive en el dispositivo.

const pedido = (p: Partial<PedidoDemo> = {}): PedidoDemo => ({
  id: 'demo-ped-1',
  token: 'demo-1',
  product_name: 'Faja Reductora Premium',
  product_price: 150,
  advance_amount: 75,
  payment_verification: 'MATCHED',
  dispatch_type: 'AGENCIA_PROVINCIA',
  agency_name: 'SHALOM',
  stage: 'confirmado',
  ...p,
})

beforeEach(() => reiniciarDemo())

describe('los cambios del demo', () => {
  it('se aplican encima del generador, sin tocarlo', () => {
    const base = pedido()
    guardarCambio(base.id, { stage: 'entregado' })
    expect(conCambios(base).stage).toBe('entregado')
    // El original sigue como lo armó el generador: es lo que hace que los
    // totales del panel no se contagien de una demo a la siguiente.
    expect(base.stage).toBe('confirmado')
  })

  it('se funden: cambiar la cantidad no borra la etapa que se movió antes', () => {
    guardarCambio('demo-ped-1', { stage: 'entregado' })
    guardarCambio('demo-ped-1', { product_price: 230 })
    const p = conCambios(pedido())
    expect(p.stage).toBe('entregado')
    expect(p.product_price).toBe(230)
  })

  // React compara por referencia: devolver un objeto nuevo para cada pedido
  // repintaría el tablero entero por un cambio en uno.
  it('un pedido sin cambios vuelve tal cual', () => {
    const base = pedido()
    expect(conCambios(base)).toBe(base)
    const lista = [base]
    expect(listaConCambios(lista)).toBe(lista)
  })

  it('salir del demo lo deja como el primer día', () => {
    guardarCambio('demo-ped-1', { stage: 'entregado' })
    expect(hayCambiosDemo()).toBe(true)
    reiniciarDemo()
    expect(hayCambiosDemo()).toBe(false)
    expect(conCambios(pedido()).stage).toBe('confirmado')
  })
})

describe('avanzar en el demo', () => {
  // En la tienda de verdad `registrado` lo enciende la guía y `en origen` lo
  // reporta Shalom, así que el panel no los ofrece. En el demo no hay guía ni
  // courier: los hacemos nosotros, que es lo que hay que poder enseñar.
  it('inventa la guía cuando el paso que sigue es registrarla', () => {
    const p = pedido({ stage: 'confirmado' })
    const r = avanzarEnDemo(p)
    expect(r.ok).toBe(true)
    expect(r.patch?.tracking_numero).toMatch(/^\d{6}$/)
    expect(columnaDelPedido(conCambios(p))).toBe('registrado')
  })

  // Completa, como la emite `shalom-order`: con el código del voucher —que
  // viaja en el mensaje, con el vocabulario de Shalom— y una clave de retiro
  // que su validador aceptaría. La clave NO va en el mensaje: este pedido aún
  // debe su saldo.
  it('la guía inventada trae código y clave, y el chat solo enseña los ids', () => {
    const p = pedido({ stage: 'confirmado' })
    const r = avanzarEnDemo(p)
    expect(r.patch?.tracking_codigo).toMatch(/^[A-Z0-9]{4}$/)
    expect(esPickupCodeValido(String(r.patch?.shalom_pickup_code))).toBe(true)
    const guia = conCambios(p).chat_messages?.find(m => m.type === 'guia')
    expect(guia?.body).toContain(`Nro. de orden ${r.patch?.tracking_numero} · Código ${r.patch?.tracking_codigo}`)
    expect(conCambios(p).chat_messages?.some(m => m.body === mensajeDeClave(String(r.patch?.shalom_pickup_code))))
      .toBe(false)
  })

  // Pero si el pedido ya no debe nada, la clave sale JUNTO con la guía — es lo
  // que hace `registrarGuia` en la tienda real cuando pagaron el total.
  it('con todo pagado, la clave sale junto con la guía', () => {
    const p = pedido({ stage: 'confirmado', advance_amount: 150 })
    const r = avanzarEnDemo(p)
    expect(conCambios(p).chat_messages?.some(m => m.body === mensajeDeClave(String(r.patch?.shalom_pickup_code))))
      .toBe(true)
  })

  it('y después mueve el reloj del courier, paso por paso', () => {
    let p = pedido({ stage: 'en_camino', tracking_numero: '145446' })
    const columnas: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = avanzarEnDemo(p)
      if (!r.ok) break
      p = conCambios(p)
      columnas.push(columnaDelPedido(p))
    }
    expect(columnas).toEqual(['en_origen', 'transito', 'en_agencia', 'entregado'])
  })

  // La cobranza real empieza en origen (`onTransition` de `_shared/tracking.ts`)
  // y el demo enseña ese mismo momento: el aviso de que la pre-guía ya es
  // oficial y, si el pedido debe su saldo, la tarjeta de pago — sola, con la
  // MISMA copy que la del vendedor.
  it('entrar a origen anuncia la guía oficial y manda la tarjeta del saldo', () => {
    const p = pedido({ stage: 'en_camino', tracking_numero: '145446', payment_provider: '360PAY' })
    avanzarEnDemo(p)
    const msgs = conCambios(p).chat_messages ?? []
    expect(msgs.some(m => m.body === mensajeDeOrigen('SHALOM'))).toBe(true)
    const tarjeta = msgs.find(m => m.type === 'cobro')
    expect(tarjeta?.body).toBe(textoDeCobro('S/ 75'))
    expect(tarjeta?.sender_role).toBe('system')
  })

  it('sin deuda no hay tarjeta: el aviso va solo', () => {
    const p = pedido({ stage: 'en_camino', tracking_numero: '145446', payment_provider: '360PAY', advance_amount: 150 })
    avanzarEnDemo(p)
    const msgs = conCambios(p).chat_messages ?? []
    expect(msgs.some(m => m.body === mensajeDeOrigen('SHALOM'))).toBe(true)
    expect(msgs.some(m => m.type === 'cobro')).toBe(false)
  })

  // El vendedor pudo mandarla a mano antes de que el courier reporte:
  // repetírsela es cobrarle dos veces a la vista (misma regla que el tracking).
  it('si la tarjeta ya está en el hilo, no se repite', () => {
    const p = pedido({
      stage: 'en_camino', tracking_numero: '145446', payment_provider: '360PAY',
      chat_messages: [{ id: 'x', sender_role: 'seller', type: 'cobro', body: 'Te queda un saldo de S/ 75.', created_at: '', read_at: null }],
    })
    avanzarEnDemo(p)
    const cambio = cambiosDemo()[p.id]
    expect((cambio?.mensajes ?? []).some(m => m.type === 'cobro')).toBe(false)
  })

  // Y las fases siguientes también hablan, como en los hilos del generador.
  it('en tránsito y en destino dejan su aviso en el hilo', () => {
    let p = pedido({ stage: 'en_camino', tracking_numero: '145446', tracking_phase: 'EN_ORIGEN' })
    avanzarEnDemo(p)
    p = conCambios(p)
    avanzarEnDemo(p)
    const msgs = conCambios(p).chat_messages ?? []
    expect(msgs.some(m => (m.body ?? '').includes('va en camino a tu agencia'))).toBe(true)
    expect(msgs.some(m => (m.body ?? '').includes('ya llegó a tu agencia'))).toBe(true)
  })

  it('un pedido terminado no avanza', () => {
    expect(avanzarEnDemo(pedido({ stage: 'entregado' })).ok).toBe(false)
  })

  // Los cierres van por la misma puerta que avanzar, y no son pasos del eje: se
  // marcan tal cual.
  it('los cierres se marcan directo', () => {
    ejecutarEnDemo(pedido(), { action: 'advance', stage: 'no_entregado' })
    expect(conCambios(pedido()).stage).toBe('no_entregado')
    ejecutarEnDemo(pedido(), { action: 'anular' })
    expect(conCambios(pedido()).status).toBe('anulado')
  })
})

describe('el carrito en el demo', () => {
  // Los pedidos del generador no traen `items` —tienen un producto y su
  // precio—, así que el carrito se arma al primer cambio.
  it('subir la cantidad sube el total', () => {
    const r = ejecutarEnDemo(pedido(), { action: 'set_qty', index: 0, qty: 2 })
    expect(r.ok).toBe(true)
    expect(r.total).toBe(300)
    expect(conCambios(pedido()).product_price).toBe(300)
  })

  it('no se puede quitar el único producto', () => {
    expect(ejecutarEnDemo(pedido(), { action: 'remove_item', index: 0 }).ok).toBe(false)
  })

  // Enseñando, una oferta que aparece aceptada en el mismo instante en que se
  // envía se lee como que el panel se lo inventó. Son DOS tiempos, y esa espera
  // es el producto: se mandó, y respondieron.
  it('la oferta se envía primero, sin aceptar', () => {
    const base = pedido()
    const msg = ofertaEnviadaEnDemo(base, { nombre: 'Set de Ollas', precio: 120 }, { nombre: 'Andrea', rol: 'Ventas' })
    // Se mira en los cambios del demo y no en `chat_messages`: ese tipo es el
    // espejo del `select` de `get-store-sessions`, que no trae `offer`.
    expect(cambiosDemo()[base.id].mensajes?.find(m => m.id === msg.id)?.offer?.accepted).toBe(false)
    // Y todavía no toca el pedido: aceptar es lo que lo cambia.
    expect(conCambios(base).product_price).toBe(150)
  })

  it('y al aceptarla sube el total, sin duplicar la oferta en el hilo', () => {
    const base = pedido()
    const oferta = { nombre: 'Set de Ollas', precio: 120 }
    const msg = ofertaEnviadaEnDemo(base, oferta, { nombre: 'Andrea', rol: 'Ventas' })
    const r = ofertaAceptadaEnDemo(base, oferta, { nombre: 'Andrea', rol: 'Ventas' }, msg.id)
    expect(r.total).toBe(270)
    const p = conCambios(base)
    expect(p.product_price).toBe(270)
    // UNA oferta, la que se mandó, ahora aceptada. No dos.
    const ofertas = (cambiosDemo()[base.id].mensajes ?? []).filter(m => m.type === 'offer')
    expect(ofertas).toHaveLength(1)
    expect(ofertas[0].offer?.accepted).toBe(true)
    // El mismo detalle que escribe el servidor: total, abonado y lo que falta.
    const detalle = (p.chat_messages ?? []).find(m => (m.body ?? '').includes('Nuevo total'))?.body ?? ''
    expect(detalle).toContain('💰 Nuevo total: S/ 270')
    expect(detalle).toContain('📌 Saldo pendiente: S/ 195')
  })

  // El segundo tiempo del cobro: mueve la MISMA fila que movería el webhook, así
  // que la tarjeta ámbar del panel se pone verde y el anillo se completa.
  it('el saldo pagado en demo cierra el cobro de verdad', () => {
    const base = pedido({ product_price: 150, advance_amount: 75, saldo_amount: 75, saldo_verification: 'PENDING' })
    cobroEnviadoEnDemo(base, 'Te queda un saldo de S/ 75.', { nombre: 'Andrea', rol: 'Ventas' })
    expect(conCambios(base).chat_messages?.some(m => m.type === 'cobro')).toBe(true)
    saldoPagadoEnDemo(base)
    expect(conCambios(base).saldo_verification).toBe('MATCHED')
  })

  // Y termina como termina de verdad: con el acuse del webhook —la MISMA copy,
  // de `_shared/acuse-de-pago.ts`— apuntando al cobro, que es lo que convierte
  // el aviso en la tarjeta con el botón del comprobante.
  it('el saldo pagado deja el acuse con su comprobante', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75, saldo_amount: 75, saldo_verification: 'PENDING',
      dispatch_type: 'AGENCIA_LIMA',
      cobros: [
        { id: 'a', tipo: 'adelanto', monto: 75, estado: 'MATCHED' },
        { id: 's', tipo: 'saldo', monto: 75, estado: 'PENDING' },
      ],
    })
    saldoPagadoEnDemo(base)
    const acuse = conCambios(base).chat_messages?.find(m => m.type === 'status_update')
    expect(acuse?.body).toBe(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: true }))
    // Y apunta al cobro: sin eso el botón no tendría qué abrir.
    expect(acuse?.cobro_id).toBe('s')
  })

  // El acuse promete "Te enviamos tu clave de recojo por acá" — y el demo
  // cumple igual que el webhook: la clave sale sola, DESPUÉS del acuse, solo si
  // el pedido la tiene. Una guía registrada a mano no eligió clave, y ahí no
  // hay nada que mandar.
  it('el saldo pagado suelta la clave de recojo, después del acuse', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75, saldo_amount: 75, saldo_verification: 'PENDING',
      tracking_courier: 'SHALOM', tracking_numero: '260368', shalom_pickup_code: '2415',
    })
    saldoPagadoEnDemo(base)
    const msgs = conCambios(base).chat_messages ?? []
    const iAcuse = msgs.findIndex(m => /¡Recibimos tu saldo de/.test(m.body ?? ''))
    const iClave = msgs.findIndex(m => m.body === mensajeDeClave('2415'))
    expect(iClave).toBeGreaterThan(iAcuse)
  })

  it('sin clave guardada no se inventa ninguna', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75, saldo_amount: 75, saldo_verification: 'PENDING',
      tracking_courier: 'SHALOM', tracking_numero: '260368',
    })
    saldoPagadoEnDemo(base)
    expect(conCambios(base).chat_messages?.some(m => (m.body ?? '').includes('clave de recojo es'))).toBe(false)
  })

  // ─── El caso que se rompió en producción ───────────────────────────────────
  //
  // Un pedido con el adelanto cruzado y el saldo SIN CUPÓN: no tiene fila de
  // saldo ni `saldo_amount`, porque ese cupón lo emite el comprador al tocar
  // pagar. Desde que el panel puede mandarle la tarjeta igual, el demo pasa por
  // acá — y pasaba mal por partida doble: anunciaba "¡Recibimos tu saldo de
  // S/0!" y la tarjeta del saldo, en vez de ponerse verde, DESAPARECÍA.
  it('el saldo sin cupón: se crea su fila, con su monto, y la tarjeta se pone verde', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      cobros: [{ id: 'a', tipo: 'adelanto', monto: 75, estado: 'MATCHED' }],
    })
    // Antes de pagar: no es una fila, pero el panel lo enseña igual.
    expect(saldoPorCobrar(base)).toMatchObject({ tipo: 'saldo', monto: 75 })

    saldoPagadoEnDemo(base)
    const p = conCambios(base)

    // Ahora SÍ es una fila, cobrada, y por el monto que era.
    const suyo = cobrosDelPedido(p).find(c => c.tipo === 'saldo')
    expect(suyo).toMatchObject({ monto: 75, verificado: true })
    expect(cobradoDelPedido(p)).toBe(150)
    // Y deja de ser "lo que falta", porque ya no falta.
    expect(saldoPorCobrar(p)).toBeNull()
  })

  it('y el acuse dice el monto de verdad, con su comprobante', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      dispatch_type: 'AGENCIA_PROVINCIA',
      cobros: [{ id: 'a', tipo: 'adelanto', monto: 75, estado: 'MATCHED' }],
    })
    saldoPagadoEnDemo(base)
    const acuse = conCambios(base).chat_messages?.find(m => m.type === 'status_update')
    // No "S/0": el monto sale del pedido, no de una columna que aún no existe.
    expect(acuse?.body).toBe(acuseDePago({ tipo: 'saldo', pagado: 75, total: 150, esRecojo: true }))
    // Y apunta al cobro recién creado, que es lo que pinta el botón.
    const suyo = conCambios(base).cobros?.find(c => c.tipo === 'saldo')
    expect(acuse?.cobro_id).toBe(suyo?.id)
    expect(acuse?.cobro_id).toBeTruthy()
  })

  // Un cobro que entró se sigue por su código de pago — es lo que se enseña.
  // El generador siembra el rastro del saldo en `saldo_trace` con la serie
  // KSH6xxx (`rastroDemo` con i+5000); el pago del demo usa la misma convención,
  // y sin esto la tarjeta verde salía sin "Código de pago".
  it('el saldo pagado deja su código de pago, con la serie del generador', () => {
    const base = pedido({
      id: 'demo-ped-13', product_price: 150, advance_amount: 75,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      cobros: [{ id: 'a', tipo: 'adelanto', monto: 75, estado: 'MATCHED' }],
    })
    saldoPagadoEnDemo(base)
    const p = conCambios(base)
    expect(p.saldo_trace?.payment_code).toBe('KSH6013')
    expect(p.saldo_trace?.operation_number).toBeTruthy()
  })

  // Y el extra pagado lleva el código del COMPRADOR, que es el que usa en la
  // tienda real: `pay360-coupon` emite sus cupones con el código estable del
  // cliente, no con uno propio.
  it('el extra pagado lleva el código de pago del comprador', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75,
      payment_verification: 'MATCHED', payment_provider: '360PAY',
      payment_trace: { payment_code: 'KSH1042', coupon_id: null, operation_number: '1', bank: 'BCP' },
    })
    const { id } = cobroExtraEnDemo(base, 50, 'Flete')
    cobroExtraPagadoEnDemo(conCambios(base), id)
    const suyo = conCambios(base).cobros?.find(c => c.id === id)
    expect(suyo).toMatchObject({ estado: 'MATCHED', pay360_consumer_code: 'KSH1042' })
  })

  // Y en la LISTA, que es de donde lee el panel desde el bloque §36. El
  // generador manda `cobros` en todos sus pedidos, así que tocar solo las
  // columnas dejaba la fila del saldo en PENDING: el comprador "pagaba" y la
  // tarjeta seguía ámbar. El fixture de arriba no lo veía porque no trae lista.
  it('el saldo pagado también mueve la fila de cobros', () => {
    const base = pedido({
      product_price: 150, advance_amount: 75, saldo_amount: 75, saldo_verification: 'PENDING',
      cobros: [
        { id: 'a', tipo: 'adelanto', monto: 75, estado: 'MATCHED' },
        { id: 's', tipo: 'saldo', monto: 75, estado: 'PENDING' },
      ],
    })
    saldoPagadoEnDemo(base)
    const p = conCambios(base)
    expect(p.cobros?.find(c => c.tipo === 'saldo')?.estado).toBe('MATCHED')
    expect(cobrosDelPedido(p).every(c => c.verificado)).toBe(true)
    expect(cobradoDelPedido(p)).toBe(150)
  })

  // Lo que el upsell tiene que poder ENSEÑAR: el adelanto ya no cubre el pedido,
  // así que el anillo baja aunque no se haya tocado la plata.
  it('el anillo baja al crecer el pedido', () => {
    const base = pedido({ product_price: 150, advance_amount: 150 })
    expect(avanceDelPago(base).completo).toBe(true)
    const msg = ofertaEnviadaEnDemo(base, { nombre: 'Set de Ollas', precio: 120 }, { nombre: 'Andrea', rol: 'Ventas' })
    ofertaAceptadaEnDemo(base, { nombre: 'Set de Ollas', precio: 120 }, { nombre: 'Andrea', rol: 'Ventas' }, msg.id)
    const p = conCambios(base)
    expect(avanceDelPago(p).completo).toBe(false)
    expect(avanceDelPago(p).fraccion).toBeCloseTo(150 / 270)
  })
})

describe('el chat del demo', () => {
  it('lo que escribe el vendedor se queda escrito', () => {
    const base = pedido({ chat_messages: [] })
    agregarMensajeDemo(base.id, {
      id: 'demo-msg-1', session_id: base.id, sender_role: 'seller', sender_name: 'Andrea',
      type: 'text', body: 'Te mando la guía en un momento', created_at: new Date().toISOString(), read_at: null,
    })
    expect(conCambios(base).chat_messages).toHaveLength(1)
    // Y sigue ahí después de recargar: los cambios se leen del guardado, no de
    // un estado en memoria que se pierde al cerrar la pestaña.
    expect(cambiosDemo()[base.id]?.mensajes).toHaveLength(1)
  })

  it('se pegan al final de la conversación del generador, no la reemplazan', () => {
    const previo = {
      id: 'm0', session_id: 'demo-ped-1', sender_role: 'buyer', type: 'text',
      body: 'Hola', created_at: new Date().toISOString(), read_at: null,
    }
    const base = pedido({ chat_messages: [previo] })
    agregarMensajeDemo(base.id, { ...previo, id: 'm1', sender_role: 'seller', body: 'Hola!' })
    const msgs = conCambios(base).chat_messages ?? []
    expect(msgs.map(m => m.id)).toEqual(['m0', 'm1'])
  })
})

// ─── Invitar en el demo ──────────────────────────────────────────────────────
//
// El invitador salía VACÍO en la tienda de ejemplo: consultaba `sellers` por
// `store_id = 'demo'`, que no existe — el equipo del demo lo arma el generador.
// Y sin nadie a quien invitar, invitar-con-nota no se podía enseñar.

const RENZO = { id: 'demo-auth-3', nombre: 'Renzo Aguilar', role_label: 'Despacho' }
const YO = { nombre: 'Uxbriel', rol: 'Admin' }

describe('invitar en el demo', () => {
  it('lo suma a los participantes y deja el aviso en el chat', () => {
    const base = pedido({ seller_name: 'Andrea Quiroz', seller_role: 'Admin', assigned_seller_id: 'demo-auth-0' })
    const r = invitarEnDemo(base, RENZO, '', YO)
    expect(r.ok).toBe(true)
    const p = conCambios(base)
    expect(p.participants?.map(x => x.nombre)).toEqual(['Andrea Quiroz', 'Renzo Aguilar'])
    expect((p.chat_messages ?? []).some(m => (m.body ?? '').includes('Renzo (Despacho) se unió al chat'))).toBe(true)
  })

  // Si se guardaran solo los invitados, invitar a alguien haría DESAPARECER de
  // "Asignado" a quien lleva el pedido.
  it('el asignado no se pierde al invitar', () => {
    const base = pedido({ seller_name: 'Andrea Quiroz', assigned_seller_id: 'demo-auth-0' })
    invitarEnDemo(base, RENZO, '', YO)
    const p = conCambios(base)
    expect(p.participants?.[0].is_owner).toBe(true)
    expect(p.participants?.[0].nombre).toBe('Andrea Quiroz')
  })

  // La gracia de invitar con nota es que el otro llegue sabiendo qué le toca.
  it('la nota queda en el chat, interna y etiquetándolo', () => {
    const base = pedido({ seller_name: 'Andrea Quiroz', assigned_seller_id: 'demo-auth-0' })
    invitarEnDemo(base, RENZO, 'revisa el pago antes de despachar', YO)
    const nota = (conCambios(base).chat_messages ?? []).find(m => m.visibility === 'sellers')
    expect(nota?.body).toBe('@Renzo Aguilar revisa el pago antes de despachar')
    expect(nota?.mentions).toEqual([RENZO.id])
  })

  it('sin nota no inventa una nota vacía', () => {
    const base = pedido({ assigned_seller_id: 'demo-auth-0' })
    invitarEnDemo(base, RENZO, '   ', YO)
    expect((conCambios(base).chat_messages ?? []).some(m => m.visibility === 'sellers')).toBe(false)
  })

  it('no se invita dos veces a la misma persona', () => {
    const base = pedido({ assigned_seller_id: 'demo-auth-0' })
    invitarEnDemo(base, RENZO, '', YO)
    expect(invitarEnDemo(conCambios(base), RENZO, '', YO).ok).toBe(false)
  })
})

// ─── Pasar el pedido a otro ──────────────────────────────────────────────────
//
// No existía en ninguna parte: el responsable solo cambiaba SOLO, al avanzar de
// etapa. Rotar turnos o cubrir una baja obligaba a mentir sobre la etapa.

describe('reasignar en el demo', () => {
  const base = () => pedido({
    seller_name: 'Milagros Pinto', seller_role: 'Ventas', assigned_seller_id: 'demo-auth-2',
  })

  it('cambia el responsable y lo dice en el chat', () => {
    const p0 = base()
    const r = reasignarEnDemo(p0, RENZO, 'sale de vacaciones, sigue tú', YO)
    expect(r.ok).toBe(true)
    const p = conCambios(p0)
    expect(p.assigned_seller_id).toBe(RENZO.id)
    expect(p.seller_name).toBe('Renzo Aguilar')
    expect(p.participants?.[0]).toMatchObject({ id: RENZO.id, is_owner: true })
    expect((p.chat_messages ?? []).some(m => (m.body ?? '').includes('Ahora te atiende Renzo'))).toBe(true)
  })

  // El anterior lleva el contexto del pedido, y lo normal es que el nuevo le
  // pregunte algo. Sacarlo al pasarle el pedido es perder eso justo cuando hace
  // más falta.
  it('el anterior se queda dentro, ya no como responsable', () => {
    const p0 = base()
    reasignarEnDemo(p0, RENZO, 'sale de vacaciones, sigue tú', YO)
    const p = conCambios(p0)
    const mila = p.participants?.find(x => x.nombre === 'Milagros Pinto')
    expect(mila).toBeTruthy()
    expect(mila?.is_owner).toBe(false)
  })

  it('la nota es obligatoria', () => {
    expect(reasignarEnDemo(base(), RENZO, '   ', YO).ok).toBe(false)
  })

  it('pasárselo a quien ya lo tiene no hace nada', () => {
    const p = pedido({ assigned_seller_id: RENZO.id })
    expect(reasignarEnDemo(p, RENZO, 'toma', YO).ok).toBe(false)
  })
})

describe('sacar del pedido, en el demo', () => {
  it('quita al invitado', () => {
    const p0 = pedido({ seller_name: 'Milagros Pinto', assigned_seller_id: 'demo-auth-2' })
    invitarEnDemo(p0, RENZO, 'ayuda con el despacho', YO)
    expect(quitarEnDemo(conCambios(p0), RENZO.id).ok).toBe(true)
    expect(conCambios(p0).participants?.some(x => x.id === RENZO.id)).toBe(false)
  })

  // Sacarlo dejaría un pedido sin nadie que responda por él.
  it('al responsable no se le saca', () => {
    const p = pedido({ assigned_seller_id: 'demo-auth-2' })
    expect(quitarEnDemo(p, 'demo-auth-2').ok).toBe(false)
  })
})
