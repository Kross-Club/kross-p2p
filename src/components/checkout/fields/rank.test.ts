// Tests del ranking del selector. El caso que lo motivó: tecleando "santiago"
// salían 24 coincidencias con Santiago de Surco en el puesto 23, porque el
// filtro era un `includes` plano sobre el dataset en orden alfabético de
// departamentos (Amazonas primero) y además sensible a tildes.

import { describe, expect, it } from 'vitest'
import { fold, matchTier, rankOptions } from './rank'

const opt = (label: string, detail?: string) => ({ value: label, label, detail })

describe('fold · tildes y mayúsculas', () => {
  it('quita tildes y baja a minúsculas', () => {
    expect(fold('Áncash')).toBe('ancash')
    expect(fold('María')).toBe('maria')
    expect(fold('Huánuco')).toBe('huanuco')
  })

  it('la ñ pliega a n: quien teclea "canete" encuentra Cañete', () => {
    // Decisión deliberada: NFD descompone ñ en n + virgulilla y el rango de
    // diacríticos que se borra la incluye. En un buscador eso es lo correcto
    // — muchos teclados/autocorrectores comen la ñ — y ningún par de
    // distritos se distingue solo por ella.
    expect(fold('Cañete')).toBe('canete')
  })
})

describe('matchTier · cómo coincide manda', () => {
  const surco = opt('Santiago de Surco', 'Lima, Lima')

  it('empieza-con gana a palabra interna', () => {
    expect(matchTier(opt('Surco', 'Huarochirí, Lima'), 'surco')).toBe(0)
    expect(matchTier(surco, 'surco')).toBe(1)
  })

  it('el nombre gana al detail', () => {
    expect(matchTier(opt('Cusco', 'Cusco, Cusco'), 'cusco')).toBe(0)
    expect(matchTier(opt('Wanchaq', 'Cusco, Cusco'), 'cusco')).toBe(3)
  })

  it('sin coincidencia devuelve -1', () => {
    expect(matchTier(surco, 'arequipa')).toBe(-1)
  })

  it('ignora tildes en los dos sentidos', () => {
    expect(matchTier(opt('María', 'Luya, Amazonas'), 'maria')).toBe(0)
    expect(matchTier(opt('Bagua', 'Bagua, Amazonas'), 'bágua')).toBe(0)
  })
})

describe('rankOptions · el caso reportado', () => {
  // Miniatura del dataset real: homónimos rurales por delante en el orden de
  // entrada, y el orden de entrada como prior (aquí, Lima primero).
  const pool = [
    opt('Santiago de Surco', 'Lima, Lima'),
    opt('Surquillo', 'Lima, Lima'),
    opt('Santiago de Chilcas', 'Ocros, Áncash'),
    opt('Santiago de Cao', 'Ascope, La Libertad'),
    opt('Santiago', 'Cusco, Cusco'),
    opt('Surco', 'Huarochirí, Lima'),
  ]

  it('"santiago" pone primero a los que empiezan igual, respetando el prior', () => {
    const r = rankOptions(pool, 'santiago', 50).map(o => o.label)
    expect(r[0]).toBe('Santiago de Surco')
    expect(r).toEqual(['Santiago de Surco', 'Santiago de Chilcas', 'Santiago de Cao', 'Santiago'])
  })

  it('"surco" muestra el exacto y el compuesto arriba, en ese orden', () => {
    expect(rankOptions(pool, 'surco', 50).map(o => o.label))
      .toEqual(['Surco', 'Santiago de Surco'])
  })

  it('el nombre completo tecleado da un único resultado', () => {
    expect(rankOptions(pool, 'santiago de surco', 50).map(o => o.label))
      .toEqual(['Santiago de Surco'])
  })

  it('sin query devuelve el orden de entrada recortado al límite', () => {
    expect(rankOptions(pool, '  ', 2).map(o => o.label))
      .toEqual(['Santiago de Surco', 'Surquillo'])
  })

  it('respeta el límite después de ordenar, no antes', () => {
    // Si el slice corriera antes del sort, el mejor match podría quedar fuera.
    const r = rankOptions(pool, 'santiago', 2).map(o => o.label)
    expect(r).toEqual(['Santiago de Surco', 'Santiago de Chilcas'])
  })
})
