import { describe, it, expect } from 'vitest'
import { mensajePanel } from './panel-errors'

describe('traducir el error de una función', () => {
  it('sin código, la frase de siempre', () => {
    expect(mensajePanel(null, 'No se pudo guardar.')).toBe('No se pudo guardar.')
    expect(mensajePanel('   ', 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })

  // Los dos casos que no son bugs sino producción a medias, y que desde el panel
  // se ven exactamente igual que un botón roto.
  it('una columna que no existe = falta correr el SQL', () => {
    expect(mensajePanel('column "saldo_amount" does not exist', 'x'))
      .toContain('setup-kross.sql')
  })

  it('una acción que la función no conoce = falta desplegarla', () => {
    expect(mensajePanel('Unknown action', 'x')).toContain('versión anterior al panel')
    expect(mensajePanel('unknown action', 'x')).toContain('Despliégala')
  })

  // "Unknown action" dentro de otro texto es otra cosa: solo cuenta cuando ES
  // la respuesta entera, que es como la manda la función.
  it('no confunde un texto que lo menciona de pasada', () => {
    expect(mensajePanel('handler failed: unknown action id', 'x')).toBe('handler failed: unknown action id')
  })

  it('un código desconocido se dice tal cual: es un panel de administración', () => {
    expect(mensajePanel('slug_en_uso', 'x')).toBe('slug_en_uso')
  })
})
