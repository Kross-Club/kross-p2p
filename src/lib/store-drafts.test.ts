import { describe, it, expect } from 'vitest'
import { nombreDeCurioso, zonaDeCurioso } from './store-drafts'
import type { Curioso } from './store-drafts'

const base: Curioso = { order_id: 'd1' }

// ─── Lo que se sabe de un curioso, y lo que no ───────────────────────────────
//
// Un curioso se fue a la mitad del formulario, así que la mitad de sus campos
// están vacíos por definición. La columna tiene que decir eso —"sin distrito"—
// en vez de rellenarlo: el área comercial lo completa a mano, y para eso
// necesita saber a quién le falta.
describe('lo que se muestra de un curioso', () => {
  it('sin nombre lo dice, no inventa uno', () => {
    expect(nombreDeCurioso(base)).toBe('Sin nombre')
    expect(nombreDeCurioso({ ...base, buyer_name: '   ' })).toBe('Sin nombre')
    expect(nombreDeCurioso({ ...base, buyer_name: 'Rosa Medina' })).toBe('Rosa Medina')
  })

  it('sin ubicación devuelve null: quien se fue antes del distrito no lo dejó', () => {
    expect(zonaDeCurioso(base)).toBeNull()
    expect(zonaDeCurioso({ ...base, location_type: null, district: null })).toBeNull()
  })

  it('con distrito y zona los junta', () => {
    expect(zonaDeCurioso({ ...base, district: 'Comas', location_type: 'LIMA' })).toBe('Comas · Lima')
    expect(zonaDeCurioso({ ...base, district: 'Trujillo', location_type: 'PROVINCIA' }))
      .toBe('Trujillo · Provincia')
  })

  it('con solo una de las dos no deja el separador colgando', () => {
    expect(zonaDeCurioso({ ...base, district: 'Ate' })).toBe('Ate')
    expect(zonaDeCurioso({ ...base, location_type: 'LIMA' })).toBe('Lima')
  })

  // Un valor raro de la BD no debe convertirse en una etiqueta rara en pantalla.
  it('un location_type desconocido se ignora en vez de mostrarse crudo', () => {
    expect(zonaDeCurioso({ ...base, location_type: 'MARTE' })).toBeNull()
    expect(zonaDeCurioso({ ...base, district: 'Ate', location_type: 'MARTE' })).toBe('Ate')
  })
})
