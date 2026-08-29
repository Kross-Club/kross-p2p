import { describe, it, expect, beforeEach } from 'vitest'
import {
  conCambios, listaConCambios, guardarCambio, agregarMensajeDemo, reiniciarDemo,
  hayCambiosDemo, cambiosDemo, ejecutarEnDemo, avanzarEnDemo, ofertaAceptadaEnDemo, invitarEnDemo, reasignarEnDemo, quitarEnDemo,
} from './cambios-demo'
import type { PedidoDemo } from './cambios-demo'
import { avanceDelPago } from '../order-money'
import { columnaDelPedido } from '../order-tracking'

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

  it('agregar un producto sube el total y deja el chat contándolo', () => {
    const base = pedido()
    const r = ofertaAceptadaEnDemo(base, { nombre: 'Set de Ollas', precio: 120 }, { nombre: 'Andrea', rol: 'Ventas' })
    expect(r.total).toBe(270)
    const p = conCambios(base)
    expect(p.product_price).toBe(270)
    // Los dos mensajes que escribiría el servidor: la oferta y el "ya te lo
    // agregué", para que la conversación se lea igual que una de verdad.
    const nuevos = p.chat_messages ?? []
    expect(nuevos.some(m => m.type === 'offer')).toBe(true)
    expect(nuevos.some(m => (m.body ?? '').includes('Nuevo total: S/270'))).toBe(true)
  })

  // Lo que el upsell tiene que poder ENSEÑAR: el adelanto ya no cubre el pedido,
  // así que el anillo baja aunque no se haya tocado la plata.
  it('el anillo baja al crecer el pedido', () => {
    const base = pedido({ product_price: 150, advance_amount: 150 })
    expect(avanceDelPago(base).completo).toBe(true)
    ofertaAceptadaEnDemo(base, { nombre: 'Set de Ollas', precio: 120 }, { nombre: 'Andrea', rol: 'Ventas' })
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
