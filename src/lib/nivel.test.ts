import { describe, it, expect } from 'vitest'
import {
  nivelDe, banderasDeNivel, faltoAlEscribir, NOMBRE_DE_NIVEL,
} from '../../supabase/functions/_shared/nivel.ts'
import { TIENDA_PLATAFORMA } from '../../supabase/functions/_shared/alcance.ts'

describe('qué es alguien', () => {
  it('sale de las banderas, no de la etiqueta', () => {
    expect(nivelDe({ is_admin: false })).toBe('miembro')
    expect(nivelDe({ is_admin: true, is_operator: true })).toBe('operador')
    expect(nivelDe({ is_admin: true })).toBe('admin')
    expect(nivelDe(null)).toBe('miembro')
  })

  // `is_operator` sin `is_admin` no es media promoción: un operador ES un admin
  // con un límite encima, así que sin lo primero no hay nada que limitar.
  it('operador sin administrar es un miembro', () => {
    expect(nivelDe({ is_admin: false, is_operator: true })).toBe('miembro')
  })
})

describe('qué se escribe para cada nivel', () => {
  it('en una marca, el alcance es esa marca', () => {
    expect(banderasDeNivel('operador', 'st_marca')).toEqual({
      is_admin: true, is_operator: true, is_super_admin: false,
    })
  })

  // El alcance no se pide aparte: se deduce de la tienda. Pedirlo por separado
  // fue justo lo que dejó cuentas a medias.
  it('en la plataforma, administrar es administrar la plataforma', () => {
    expect(banderasDeNivel('operador', TIENDA_PLATAFORMA)).toEqual({
      is_admin: true, is_operator: true, is_super_admin: true,
    })
    expect(banderasDeNivel('admin', TIENDA_PLATAFORMA)).toEqual({
      is_admin: true, is_operator: false, is_super_admin: true,
    })
  })

  it('un miembro no arrastra alcance ni estando en la plataforma', () => {
    expect(banderasDeNivel('miembro', TIENDA_PLATAFORMA)).toEqual({
      is_admin: false, is_operator: false, is_super_admin: false,
    })
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    for (const n of ['miembro', 'operador', 'admin'] as const) {
      expect(nivelDe(banderasDeNivel(n, TIENDA_PLATAFORMA))).toBe(n)
      expect(NOMBRE_DE_NIVEL[n]).toBeTruthy()
    }
  })
})

// ─── El silencio que costó una semana ────────────────────────────────────────
//
// La función desplegada era anterior al panel: recibió `is_operator` y
// `is_super_admin`, no los conocía, los ignoró y respondió `ok`. La cuenta se
// creó con el nombre y el correo bien y sin una sola bandera. Nadie lo vio
// —el alta no falla— hasta que la persona intentó entrar, días después.

describe('lo que se pidió y no quedó', () => {
  it('lo que entró entero no reporta nada', () => {
    expect(faltoAlEscribir(
      { is_admin: true, is_operator: true, is_super_admin: true },
      { is_admin: true, is_operator: true, is_super_admin: true },
    )).toEqual([])
  })

  it('el alta a medias: se guardó la cuenta y ninguna bandera', () => {
    expect(faltoAlEscribir(
      { is_admin: true, is_operator: true, is_super_admin: true },
      { is_admin: false, is_operator: false, is_super_admin: false },
    )).toEqual(['administrar', 'el límite de operador', 'el alcance de la plataforma'])
  })

  // Un miembro raso no pide nada, así que nada puede faltarle.
  it('no reclama lo que no se pidió', () => {
    expect(faltoAlEscribir(
      { is_admin: false, is_operator: false, is_super_admin: false },
      { is_admin: false, is_operator: false, is_super_admin: false },
    )).toEqual([])
  })

  // Bajar de nivel escribe `false` a propósito: eso no es que falte.
  it('quitar un nivel no cuenta como que falte', () => {
    expect(faltoAlEscribir(
      { is_admin: true, is_operator: false, is_super_admin: false },
      { is_admin: true, is_operator: false, is_super_admin: false },
    )).toEqual([])
  })

  it('si la fila no aparece, eso es lo que se dice', () => {
    expect(faltoAlEscribir({ is_admin: true }, null)).toEqual(['la cuenta no aparece en el equipo'])
  })
})
