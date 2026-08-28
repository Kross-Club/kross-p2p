import { describe, it, expect } from 'vitest'
import { datosDeFila, ordenarBandeja, PRIORIDADES, esPrioridad } from './bandeja'
import type { FilaBandeja } from './bandeja'
import type { StoreOrder } from './store-orders'

const MIN = 60_000
const H = 60 * MIN
const AHORA = new Date(2026, 7, 28, 15, 0).getTime()

const hace = (ms: number) => new Date(AHORA - ms).toISOString()

const msg = (rol: string, ms: number, body = 'hola', type = 'text') => ({
  id: `m-${rol}-${ms}`, sender_role: rol, type, body,
  created_at: hace(ms), read_at: null,
})

const pedido = (p: Partial<StoreOrder>): StoreOrder => ({ id: 'x', created_at: hace(3 * H), ...p })

describe('lo que la bandeja sabe de un pedido', () => {
  // "Esperando" no es lo mismo que "sin leer": un mensaje leído y no contestado
  // sigue siendo una deuda, y es justo el que se olvida.
  it('espera respuesta cuando el último en hablar fue el comprador', () => {
    const f = datosDeFila(pedido({ chat_messages: [msg('seller', 2 * H), msg('buyer', 1 * H)] }), AHORA, 0)
    expect(f.esperando).toBe(true)
    expect(f.esperaMs).toBe(H)
    expect(f.sinLeer).toBe(0)
  })

  it('no espera cuando el último en hablar fue la tienda', () => {
    const f = datosDeFila(pedido({ chat_messages: [msg('buyer', 2 * H), msg('seller', 1 * H)] }), AHORA, 0)
    expect(f.esperando).toBe(false)
    expect(f.esperaMs).toBe(0)
  })

  it('sin mensajes, el hilo se movió cuando entró el pedido', () => {
    const f = datosDeFila(pedido({ created_at: hace(5 * H) }), AHORA, 0)
    expect(f.vistaPrevia).toBe('Sin mensajes')
    expect(f.ultimoEn).toBe(AHORA - 5 * H)
    expect(f.esperando).toBe(false)
  })

  it('escribe lo que no es texto en vez de dejar la fila vacía', () => {
    expect(datosDeFila(pedido({ chat_messages: [msg('buyer', H, null as unknown as string, 'audio')] }), AHORA, 0).vistaPrevia).toBe('🎵 Audio')
    expect(datosDeFila(pedido({ chat_messages: [msg('system', H, 'Llamada de voz · 3:20', 'call_log')] }), AHORA, 0).vistaPrevia).toBe('📞 Llamada de voz · 3:20')
  })

  it('una fecha ilegible no rompe la fila', () => {
    const f = datosDeFila(pedido({ created_at: 'ayer', chat_messages: [] }), AHORA, 0)
    expect(f.ultimoEn).toBe(AHORA)
  })
})

describe('el orden de la bandeja', () => {
  const fila = (p: Partial<FilaBandeja>): FilaBandeja => ({
    vistaPrevia: '', ultimoDe: null, ultimoEn: AHORA, esperando: false,
    esperaMs: 0, sinLeer: 0, demorado: false, diasParado: 0, ...p,
  })
  const items = (...fs: FilaBandeja[]) => fs.map((f, i) => ({ id: String(i), f }))
  const orden = (xs: { id: string; f: FilaBandeja }[], p: Parameters<typeof ordenarBandeja>[1]) =>
    ordenarBandeja(xs, p, x => x.f).map(x => x.id)

  it('sin responder: primero quien más lleva esperando', () => {
    const xs = items(
      fila({ ultimoEn: AHORA }),                          // 0 · no espera, reciente
      fila({ esperando: true, esperaMs: 30 * MIN }),       // 1 · espera poco
      fila({ esperando: true, esperaMs: 5 * H }),          // 2 · espera mucho
    )
    expect(orden(xs, 'sin_responder')).toEqual(['2', '1', '0'])
  })

  it('sin leer: primero lo que nadie abrió, y de eso lo que más se acumuló', () => {
    const xs = items(
      fila({ ultimoEn: AHORA }),
      fila({ sinLeer: 1 }),
      fila({ sinLeer: 4 }),
    )
    expect(orden(xs, 'sin_leer')).toEqual(['2', '1', '0'])
  })

  // La demora que reporta el courier manda sobre el conteo de días: es el único
  // atraso que no estamos infiriendo nosotros.
  it('parados: la demora del courier manda sobre los días', () => {
    const xs = items(
      fila({ diasParado: 9 }),
      fila({ demorado: true, diasParado: 2 }),
      fila({ diasParado: 4 }),
    )
    expect(orden(xs, 'demorados')).toEqual(['1', '0', '2'])
  })

  it('recientes: lo último que se movió', () => {
    const xs = items(
      fila({ ultimoEn: AHORA - 5 * H }),
      fila({ ultimoEn: AHORA }),
      fila({ ultimoEn: AHORA - H }),
    )
    expect(orden(xs, 'recientes')).toEqual(['1', '2', '0'])
  })

  // La lista la comparten cuatro pantallas: ordenarla en el sitio le cambiaría
  // el orden a las otras tres.
  it('no toca la lista original', () => {
    const xs = items(fila({ ultimoEn: AHORA - H }), fila({ ultimoEn: AHORA }))
    const antes = xs.map(x => x.id)
    ordenarBandeja(xs, 'recientes', x => x.f)
    expect(xs.map(x => x.id)).toEqual(antes)
  })

  it('cada prioridad responde una pregunta distinta', () => {
    const preguntas = PRIORIDADES.map(p => p.pregunta)
    expect(new Set(preguntas).size).toBe(PRIORIDADES.length)
    expect(esPrioridad('sin_leer')).toBe(true)
    expect(esPrioridad('inventada')).toBe(false)
    expect(esPrioridad(null)).toBe(false)
  })
})
