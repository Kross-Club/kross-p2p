import { describe, it, expect } from 'vitest'
import { MODOS, modoDeUrl, urlDeModo, esModo, pedidoDeUrl, urlConPedido } from './pedidos-modos'

const url = (q: string) => new URLSearchParams(q)

describe('los modos de Pedidos', () => {
  it('sin parámetro entra por la lista', () => {
    expect(modoDeUrl(url(''))).toBe('lista')
  })

  it('cada modo se puede enlazar', () => {
    for (const m of MODOS) expect(modoDeUrl(new URLSearchParams(urlDeModo(m.key)))).toBe(m.key)
  })

  // `?modo=` llega de fuera: un enlace viejo, alguien tecleando. Una pantalla
  // en blanco por un parámetro mal escrito es peor que mostrar la lista.
  it('un modo desconocido no rompe la pantalla', () => {
    expect(modoDeUrl(url('modo=inventado'))).toBe('lista')
    expect(modoDeUrl(url('modo='))).toBe('lista')
    expect(esModo(null)).toBe(false)
  })

  it('la lista deja la URL limpia', () => {
    expect(urlDeModo('lista')).toEqual({})
    expect(urlDeModo('tablero')).toEqual({ modo: 'tablero' })
  })

  // "En vivo" se eliminó: pintaba una posición inventada sobre una línea recta
  // que no es una ruta. Los enlaces que quedaron dando vueltas caen en la
  // lista, como cualquier valor desconocido — no en una pantalla en blanco.
  it('el enlace viejo a En vivo cae en la lista', () => {
    expect(esModo('mapa')).toBe(false)
    expect(modoDeUrl(url('modo=mapa'))).toBe('lista')
  })

  // Si dos modos respondieran la misma pregunta, uno de los dos sobra.
  it('cada modo responde una pregunta distinta', () => {
    const preguntas = MODOS.map(m => m.pregunta)
    expect(new Set(preguntas).size).toBe(MODOS.length)
  })

  it('el pedido abierto viaja en la URL', () => {
    expect(pedidoDeUrl(url(''))).toBeNull()
    expect(pedidoDeUrl(url('pedido='))).toBeNull()
    expect(pedidoDeUrl(url('modo=tablero&pedido=abc123'))).toBe('abc123')
  })

  // El bug que evita: `urlDeModo` solo devuelve el modo, así que cambiar de
  // modo con un pedido abierto lo cerraba sin que nadie lo pidiera.
  it('cambiar de modo no cierra el pedido abierto', () => {
    expect(urlConPedido('tablero', 'abc123')).toEqual({ modo: 'tablero', pedido: 'abc123' })
    expect(urlConPedido('lista', 'abc123')).toEqual({ pedido: 'abc123' })
    expect(urlConPedido('lista', null)).toEqual({})
    expect(urlConPedido('resumen', null)).toEqual({ modo: 'resumen' })
  })

  it('ida y vuelta: lo que se escribe es lo que se lee', () => {
    for (const m of MODOS) {
      const p = new URLSearchParams(urlConPedido(m.key, 'tok-9'))
      expect(modoDeUrl(p)).toBe(m.key)
      expect(pedidoDeUrl(p)).toBe('tok-9')
    }
  })
})
