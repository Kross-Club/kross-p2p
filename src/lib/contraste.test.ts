// El color del texto sobre el color de cada marca. Es aritmética, no gusto:
// el comerciante elige su color y el título tiene que leerse igual.

import { describe, expect, it } from 'vitest'
import { textoSobre, textoSuaveSobre } from './contraste'

describe('qué texto se lee sobre el color de la marca', () => {
  it('sobre un naranja saturado, texto oscuro', () => {
    expect(textoSobre('#FD4F01')).toBe('#0F1115')
  })

  it('sobre el celeste por defecto de la plataforma, texto oscuro', () => {
    expect(textoSobre('#55C8F5')).toBe('#0F1115')
  })

  it('sobre un amarillo, texto oscuro — el blanco desaparecería', () => {
    expect(textoSobre('#FFD400')).toBe('#0F1115')
  })

  it('sobre un azul casi negro, texto blanco', () => {
    expect(textoSobre('#060C1A')).toBe('#FFFFFF')
  })

  it('sobre negro y sobre blanco, lo obvio', () => {
    expect(textoSobre('#000000')).toBe('#FFFFFF')
    expect(textoSobre('#FFFFFF')).toBe('#0F1115')
  })

  it('acepta 3 dígitos y sin almohadilla', () => {
    expect(textoSobre('000')).toBe('#FFFFFF')
    expect(textoSobre('#fff')).toBe('#0F1115')
  })

  it('un color que no se entiende cae al ink, que es lo seguro', () => {
    expect(textoSobre('rojo')).toBe('#0F1115')
    expect(textoSobre('')).toBe('#0F1115')
  })

  it('la línea secundaria acompaña a la principal', () => {
    expect(textoSuaveSobre('#060C1A')).toContain('255,255,255')
    expect(textoSuaveSobre('#FD4F01')).toContain('15,17,21')
  })
})
