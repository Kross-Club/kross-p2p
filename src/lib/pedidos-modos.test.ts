import { describe, it, expect } from 'vitest'
import { MODOS, modoDeUrl, urlDeModo, esModo } from './pedidos-modos'

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
    expect(urlDeModo('mapa')).toEqual({ modo: 'mapa' })
  })

  // Si dos modos respondieran la misma pregunta, uno de los dos sobra.
  it('cada modo responde una pregunta distinta', () => {
    const preguntas = MODOS.map(m => m.pregunta)
    expect(new Set(preguntas).size).toBe(MODOS.length)
  })
})
