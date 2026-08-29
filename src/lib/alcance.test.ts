import { describe, it, expect } from 'vitest'
import {
  TIENDA_PLATAFORMA, esDeLaPlataforma, administraLaPlataforma,
} from '../../supabase/functions/_shared/alcance.ts'

// ─── Quién entra por krossclub.app y quién por su marca ──────────────────────
//
// Uxbriel es el dueño; Paolo opera la plataforma; Andrea administra UNA marca y
// Kevin atiende sus pedidos. Es el reparto real y por eso es el de las pruebas.

const uxbriel = { store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: true }
const paolo = { store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: false }
const andrea = { store_id: 'st_marca', is_admin: true, is_super_admin: false }
const kevin = { store_id: 'st_marca', is_admin: false }

describe('de dónde es alguien', () => {
  it('la plataforma es una tienda, y se pregunta por su id', () => {
    expect(esDeLaPlataforma(uxbriel)).toBe(true)
    expect(esDeLaPlataforma(andrea)).toBe(false)
    expect(esDeLaPlataforma(null)).toBe(false)
    expect(esDeLaPlataforma({})).toBe(false)
  })
})

describe('hasta dónde llega', () => {
  it('el dueño, por su bandera', () => {
    expect(administraLaPlataforma(uxbriel)).toBe(true)
  })

  // El caso que rompía: el operador se creó cuando la función desplegada
  // todavía no leía `is_super_admin`, así que su fila quedó con la bandera en
  // false. Está EN la plataforma y administra: eso alcanza.
  it('el operador de la plataforma, aunque le falte la bandera', () => {
    expect(administraLaPlataforma(paolo)).toBe(true)
  })

  it('el admin de una marca no: su alcance es su marca', () => {
    expect(administraLaPlataforma(andrea)).toBe(false)
    expect(administraLaPlataforma(kevin)).toBe(false)
    expect(administraLaPlataforma(null)).toBe(false)
  })

  // Estar en la plataforma sin administrar no da alcance. Hoy no existe —en
  // `platform` no hay pedidos que atender— pero la regla no se apoya en eso.
  it('estar en la plataforma sin administrar no alcanza', () => {
    expect(administraLaPlataforma({ store_id: TIENDA_PLATAFORMA, is_admin: false })).toBe(false)
  })

  // Entrar a una marca es dejar el alcance de plataforma a propósito: el panel
  // actúa con el `store_id` de esa tienda, y así los botones que ahí no van
  // —apagarla, cambiarle el subdominio— no se ofrecen desde dentro.
  it('entrar a una marca baja el alcance a esa marca', () => {
    expect(administraLaPlataforma({ ...uxbriel, store_id: 'st_marca', is_super_admin: false })).toBe(false)
  })
})
