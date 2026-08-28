import { describe, it, expect } from 'vitest'
import { datosDeFila, esperaRespuesta, verBandeja, VISTAS, esVista } from './bandeja'
import type { FilaBandeja, Vista } from './bandeja'
import type { StoreOrder } from './store-orders'

const MIN = 60_000
const H = 60 * MIN
const AHORA = new Date(2026, 7, 28, 15, 0).getTime()

const hace = (ms: number) => new Date(AHORA - ms).toISOString()

const msg = (rol: string, ms: number, extra: Record<string, unknown> = {}) => ({
  id: `m-${rol}-${ms}`, sender_role: rol, type: 'text', body: 'hola',
  created_at: hace(ms), read_at: null, ...extra,
})

const pedido = (p: Partial<StoreOrder>): StoreOrder => ({ id: 'x', created_at: hace(3 * H), ...p })

describe('lo que la bandeja sabe de un pedido', () => {
  it('espera respuesta cuando el último en hablar fue el comprador', () => {
    const f = datosDeFila(pedido({ chat_messages: [msg('seller', 2 * H), msg('buyer', 1 * H)] }), AHORA, 0)
    expect(f.esperando).toBe(true)
    expect(f.esperaMs).toBe(H)
  })

  it('no espera cuando el último en hablar fue la tienda', () => {
    const f = datosDeFila(pedido({ chat_messages: [msg('buyer', 2 * H), msg('seller', 1 * H)] }), AHORA, 0)
    expect(f.esperando).toBe(false)
    expect(f.esperaMs).toBe(0)
  })

  // No toda respuesta pasa por el chat: se le llamó, se le contestó por
  // WhatsApp, o la pregunta no necesitaba respuesta.
  it('marcarlo como respondido lo saca de la deuda', () => {
    const o = pedido({ chat_messages: [msg('buyer', 2 * H)], answered_at: hace(1 * H) })
    expect(esperaRespuesta(o)).toBe(false)
  })

  // Y si el comprador vuelve a escribir DESPUÉS, vuelve solo: no hay nada que
  // reabrir, porque la comparación es contra la fecha y no contra una bandera.
  it('un mensaje posterior lo devuelve a la deuda solo', () => {
    const o = pedido({ chat_messages: [msg('buyer', 30 * MIN)], answered_at: hace(2 * H) })
    expect(esperaRespuesta(o)).toBe(true)
  })

  it('sin marca de respondido, la deuda es la de siempre', () => {
    expect(esperaRespuesta(pedido({ chat_messages: [msg('buyer', H)] }))).toBe(true)
    expect(esperaRespuesta(pedido({ chat_messages: [msg('buyer', H)], answered_at: 'cualquier cosa' }))).toBe(true)
  })

  // "Tú:" para todo lo que sale de la tienda es justo lo que no se puede saber
  // de un vistazo en un equipo de seis.
  it('dice QUIÉN escribió, con nombre', () => {
    const quien = (m: Record<string, unknown>) =>
      datosDeFila(pedido({ chat_messages: [m as never] }), AHORA, 0).quienEscribio
    expect(quien(msg('buyer', H))).toBe('Cliente')
    expect(quien(msg('seller', H, { sender_name: 'Milagros Cruz' }))).toBe('Milagros')
    expect(quien(msg('system', H))).toBe('Sistema')
    expect(quien(msg('bot', H))).toBe('Bot')
    // Un mensaje viejo, de antes de que se guardara el nombre.
    expect(quien(msg('seller', H))).toBe('Tienda')
    expect(datosDeFila(pedido({}), AHORA, 0).quienEscribio).toBeNull()
  })

  it('sin mensajes, el hilo se movió cuando entró el pedido', () => {
    const f = datosDeFila(pedido({ created_at: hace(5 * H) }), AHORA, 0)
    expect(f.vistaPrevia).toBe('Sin mensajes')
    expect(f.ultimoEn).toBe(AHORA - 5 * H)
    expect(f.creadoEn).toBe(AHORA - 5 * H)
  })

  it('escribe lo que no es texto en vez de dejar la fila vacía', () => {
    const previa = (m: Record<string, unknown>) =>
      datosDeFila(pedido({ chat_messages: [m as never] }), AHORA, 0).vistaPrevia
    expect(previa({ ...msg('buyer', H), type: 'audio', body: null })).toBe('🎵 Audio')
    expect(previa({ ...msg('system', H), type: 'call_log', body: 'Llamada de voz · 3:20' })).toBe('📞 Llamada de voz · 3:20')
  })

  it('una fecha ilegible no rompe la fila', () => {
    expect(datosDeFila(pedido({ created_at: 'ayer', chat_messages: [] }), AHORA, 0).ultimoEn).toBe(AHORA)
  })
})

describe('las cuatro vistas de la bandeja', () => {
  const fila = (p: Partial<FilaBandeja>): FilaBandeja => ({
    vistaPrevia: '', quienEscribio: null, ultimoDe: null, ultimoEn: AHORA, creadoEn: AHORA,
    esperando: false, esperaMs: 0, sinLeer: 0, demorado: false, diasParado: 0, favorito: false, ...p,
  })
  const items = (...fs: FilaBandeja[]) => fs.map((f, i) => ({ id: String(i), f }))
  const ver = (xs: { id: string; f: FilaBandeja }[], v: Vista) =>
    verBandeja(xs, v, x => x.f).map(x => x.id)

  // Recorta, no solo ordena: la lista tiene que dar SOLO los que deben respuesta.
  it('sin responder: solo los que deben, el que más espera arriba', () => {
    const xs = items(
      fila({ ultimoEn: AHORA }),
      fila({ esperando: true, esperaMs: 30 * MIN }),
      fila({ esperando: true, esperaMs: 5 * H }),
    )
    expect(ver(xs, 'sin_responder')).toEqual(['2', '1'])
  })

  it('favoritos: solo los marcados', () => {
    const xs = items(
      fila({ favorito: true, ultimoEn: AHORA - H }),
      fila({}),
      fila({ favorito: true, ultimoEn: AHORA }),
    )
    expect(ver(xs, 'favoritos')).toEqual(['2', '0'])
  })

  // Los dos ejes son distintos a propósito: un pedido de hace un mes puede
  // tener el chat más nuevo de la lista.
  it('chats y pedidos ordenan por ejes distintos', () => {
    const xs = items(
      fila({ ultimoEn: AHORA, creadoEn: AHORA - 30 * 24 * H }),   // chat nuevo, pedido viejo
      fila({ ultimoEn: AHORA - 5 * H, creadoEn: AHORA }),          // chat viejo, pedido nuevo
    )
    expect(ver(xs, 'chats')).toEqual(['0', '1'])
    expect(ver(xs, 'pedidos')).toEqual(['1', '0'])
  })

  it('los que ordenan no recortan', () => {
    const xs = items(fila({}), fila({}), fila({}))
    expect(ver(xs, 'chats')).toHaveLength(3)
    expect(ver(xs, 'pedidos')).toHaveLength(3)
  })

  it('no toca la lista original', () => {
    const xs = items(fila({ ultimoEn: AHORA - H }), fila({ ultimoEn: AHORA }))
    const antes = xs.map(x => x.id)
    verBandeja(xs, 'chats', x => x.f)
    expect(xs.map(x => x.id)).toEqual(antes)
  })

  it('cada vista responde una pregunta distinta', () => {
    expect(new Set(VISTAS.map(v => v.pregunta)).size).toBe(VISTAS.length)
    expect(esVista('favoritos')).toBe(true)
    expect(esVista('sin_leer')).toBe(false)
    expect(esVista(null)).toBe(false)
  })
})
