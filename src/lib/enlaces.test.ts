// Las dos puertas del pedido y la mudanza de subdominio.

import { describe, expect, it } from 'vitest'
import { enlaceDelChat, enlaceDeMiPedido, hostConSlug } from './enlaces'

describe('los enlaces del pedido', () => {
  it('mirar y hablar son dos rutas distintas', () => {
    expect(enlaceDeMiPedido('abc')).toBe('/pedido/abc')
    expect(enlaceDelChat('abc')).toBe('/p/abc')
  })

  it('el token se escapa: viaja en la URL y no lo escribimos nosotros', () => {
    expect(enlaceDeMiPedido('a b/c')).toBe('/pedido/a%20b%2Fc')
  })
})

// El subdominio viejo tiene que llevar al nuevo (§47), pero SIN inventarse
// dominios: la parte que importa de esta función es cuándo dice que no.
describe('mudar un host a otro subdominio', () => {
  it('cambia el subdominio y respeta el resto del dominio', () => {
    expect(hostConSlug('kross-shop.krossclub.app', 'gadicaf')).toBe('gadicaf.krossclub.app')
  })

  it('el desarrollo con subdominio también cuenta', () => {
    expect(hostConSlug('kross-shop.localhost', 'gadicaf')).toBe('gadicaf.localhost')
  })

  it('SIN subdominio no se toca nada: `krossclub.app` no puede volverse `gadicaf.app`', () => {
    expect(hostConSlug('krossclub.app', 'gadicaf')).toBeNull()
    expect(hostConSlug('localhost', 'gadicaf')).toBeNull()
  })

  it('si ya está en el subdominio bueno, no hay a dónde mudarse', () => {
    expect(hostConSlug('gadicaf.krossclub.app', 'gadicaf')).toBeNull()
  })

  it('sin datos, no se redirige', () => {
    expect(hostConSlug('', 'gadicaf')).toBeNull()
    expect(hostConSlug('kross-shop.krossclub.app', '')).toBeNull()
  })
})
