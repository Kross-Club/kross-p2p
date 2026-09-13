import { describe, it, expect, beforeEach } from 'vitest'
import { anotarReferido, referidoActual, olvidarReferido, VENTANA_DIAS } from './referido'

const DIA = 86_400_000
const T0 = Date.parse('2026-09-12T12:00:00Z')

beforeEach(() => { localStorage.clear() })

describe('el toque del enlace de afiliado', () => {
  it('anota el id del enlace y lo sostiene al navegar', () => {
    expect(anotarReferido('https://krossclub.app/u/48291733', T0)).toBe('48291733')
    // La siguiente página ya no lleva el `/u/`, y la referencia tiene que seguir.
    expect(anotarReferido('https://krossclub.app/servicios', T0 + 1000)).toBe('48291733')
    expect(referidoActual(T0 + 1000)).toBe('48291733')
  })

  it('el enlace NO lleva nada legible: ni slug ni nombre de tienda', () => {
    // Es la razón de existir de §53. Un enlace con el slug publica el
    // subdominio de la tienda a todo el que lo recibe.
    const ref = anotarReferido('https://krossclub.app/u/48291733', T0)
    expect(ref).toBe('48291733')
    expect(ref).not.toMatch(/[a-z]/i)
  })

  it('último toque gana: el enlace nuevo pisa al anterior', () => {
    anotarReferido('https://krossclub.app/u/48291733', T0)
    expect(anotarReferido('https://krossclub.app/u/90000001', T0 + 3 * DIA)).toBe('90000001')
    expect(referidoActual(T0 + 3 * DIA)).toBe('90000001')
  })

  it('a los 30 días el toque vence', () => {
    anotarReferido('https://krossclub.app/u/48291733', T0)
    expect(VENTANA_DIAS).toBe(30)
    expect(referidoActual(T0 + (VENTANA_DIAS - 1) * DIA)).toBe('48291733')
    expect(referidoActual(T0 + (VENTANA_DIAS + 1) * DIA)).toBe(null)
  })

  it('sin enlace y sin toque previo, no hay referido', () => {
    expect(anotarReferido('https://krossclub.app/', T0)).toBe(null)
    expect(referidoActual(T0)).toBe(null)
  })

  it('sigue aceptando el `?ref=` de la forma anterior', () => {
    // Los enlaces que alguien ya tenga guardados no pueden dejar de atribuir.
    expect(anotarReferido('https://krossclub.app/?ref=Jhoann', T0)).toBe('jhoann')
    expect(anotarReferido('https://krossclub.app/?ref=48291733', T0 + 1)).toBe('48291733')
  })

  it('una ruta que no es un id no se anota', () => {
    expect(anotarReferido('https://krossclub.app/u/monoshop', T0)).toBe(null)
    expect(referidoActual(T0)).toBe(null)
  })

  it('se olvida cuando el lead ya se mandó', () => {
    // Si no, el siguiente pedido desde el mismo navegador —otro comerciante, la
    // misma laptop del contador— arrastraría un afiliado que no lo trajo.
    anotarReferido('https://krossclub.app/u/48291733', T0)
    olvidarReferido()
    expect(referidoActual(T0)).toBe(null)
  })

  it('lee el toque guardado por la versión anterior, que usaba `codigo`', () => {
    localStorage.setItem('kross-ref', JSON.stringify({ codigo: 'jhoann', at: T0 }))
    expect(referidoActual(T0 + DIA)).toBe('jhoann')
  })

  it('un storage corrupto no rompe la web: es «sin referido»', () => {
    localStorage.setItem('kross-ref', 'no soy json')
    expect(referidoActual(T0)).toBe(null)
    expect(anotarReferido('https://krossclub.app/u/48291733', T0)).toBe('48291733')

    localStorage.setItem('kross-ref', JSON.stringify({ ref: 'x' }))   // sin `at`
    expect(referidoActual(T0)).toBe(null)
  })
})
