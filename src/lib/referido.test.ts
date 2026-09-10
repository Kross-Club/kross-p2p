import { describe, it, expect, beforeEach } from 'vitest'
import { anotarReferido, referidoActual, olvidarReferido, VENTANA_DIAS } from './referido'

const DIA = 86_400_000
const T0 = Date.parse('2026-09-10T12:00:00Z')

beforeEach(() => { localStorage.clear() })

describe('el toque del enlace de afiliado', () => {
  it('anota el código que trae la URL y lo sostiene al navegar', () => {
    expect(anotarReferido('https://krossclub.app/?ref=jhoann', T0)).toBe('jhoann')
    // La siguiente página ya no lleva el `?ref=`, y el código tiene que seguir.
    expect(anotarReferido('https://krossclub.app/servicios', T0 + 1000)).toBe('jhoann')
    expect(referidoActual(T0 + 1000)).toBe('jhoann')
  })

  it('primer toque gana: otro enlace no le roba el referido al que lo trajo', () => {
    anotarReferido('https://krossclub.app/?ref=jhoann', T0)
    expect(anotarReferido('https://krossclub.app/?ref=otro', T0 + 30 * DIA)).toBe('jhoann')
    expect(referidoActual(T0 + 30 * DIA)).toBe('jhoann')
  })

  it('a los 90 días el toque vence y el siguiente empieza de cero', () => {
    anotarReferido('https://krossclub.app/?ref=jhoann', T0)
    expect(referidoActual(T0 + (VENTANA_DIAS - 1) * DIA)).toBe('jhoann')
    expect(referidoActual(T0 + (VENTANA_DIAS + 1) * DIA)).toBe(null)
    // Y vencido, el enlace nuevo sí entra.
    expect(anotarReferido('https://krossclub.app/?ref=otro', T0 + (VENTANA_DIAS + 1) * DIA)).toBe('otro')
  })

  it('sin enlace y sin toque previo, no hay referido', () => {
    expect(anotarReferido('https://krossclub.app/', T0)).toBe(null)
    expect(referidoActual(T0)).toBe(null)
  })

  it('normaliza en la puerta: el mismo afiliado escrito de dos formas es uno', () => {
    expect(anotarReferido('https://krossclub.app/?ref=Jhoann', T0)).toBe('jhoann')
  })

  it('se olvida cuando el lead ya se mandó', () => {
    // Si no, el siguiente pedido desde el mismo navegador —otro comerciante, la
    // misma laptop del contador— arrastraría un afiliado que no lo trajo.
    anotarReferido('https://krossclub.app/?ref=jhoann', T0)
    olvidarReferido()
    expect(referidoActual(T0)).toBe(null)
  })

  it('un storage corrupto no rompe la web: es «sin referido»', () => {
    localStorage.setItem('kross-ref', 'no soy json')
    expect(referidoActual(T0)).toBe(null)
    expect(anotarReferido('https://krossclub.app/?ref=jhoann', T0)).toBe('jhoann')

    localStorage.setItem('kross-ref', JSON.stringify({ codigo: 'x' }))   // sin `at`
    expect(referidoActual(T0)).toBe(null)
  })
})
