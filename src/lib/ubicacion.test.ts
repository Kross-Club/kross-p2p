import { describe, it, expect } from 'vitest'
import { formatoUbicacion, ubicacionDeDireccion } from './ubicacion'

describe('cómo se escribe de dónde es un pedido', () => {
  it('junta las partes con separador', () => {
    expect(formatoUbicacion(['Aramango', 'Bagua', 'Amazonas'])).toBe('Aramango · Bagua · Amazonas')
  })

  // En Perú la ciudad, la provincia y el departamento coinciden muy seguido.
  // "Arequipa · Arequipa · Arequipa" no informa más y ocupa el triple.
  it('no repite lo que ya dijo', () => {
    expect(formatoUbicacion(['Arequipa', 'Arequipa', 'Arequipa'])).toBe('Arequipa')
    expect(formatoUbicacion(['AREQUIPA', 'Arequipa'])).toBe('AREQUIPA')
    expect(formatoUbicacion(['La Victoria', 'Chiclayo', 'Lambayeque'])).toBe('La Victoria · Chiclayo · Lambayeque')
  })

  // Solo las SEGUIDAS: un distrito que se llama igual que su departamento pero
  // con otra provincia en medio son tres datos distintos.
  it('solo colapsa repeticiones seguidas', () => {
    expect(formatoUbicacion(['Lima', 'Huaura', 'Lima'])).toBe('Lima · Huaura · Lima')
  })

  it('ignora lo vacío en vez de dejar separadores sueltos', () => {
    expect(formatoUbicacion(['Miraflores', '', null, 'Lima'])).toBe('Miraflores · Lima')
    expect(formatoUbicacion([' ', null, undefined])).toBeNull()
    expect(formatoUbicacion([])).toBeNull()
  })

  it('lee la dirección del pedido tal como la guarda el checkout', () => {
    expect(ubicacionDeDireccion('Aramango, Bagua, Amazonas')).toBe('Aramango · Bagua · Amazonas')
    expect(ubicacionDeDireccion('  San Borja , Lima , Lima ')).toBe('San Borja · Lima')
    expect(ubicacionDeDireccion(null)).toBeNull()
    expect(ubicacionDeDireccion('')).toBeNull()
  })
})
