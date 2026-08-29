import { describe, it, expect } from 'vitest'
import {
  esResponsable, puedeEscribir, puedeInvitar, puedeReasignar, puedeQuitar,
} from '../../supabase/functions/_shared/equipo-pedido.ts'
import type { EquipoDelPedido } from '../../supabase/functions/_shared/equipo-pedido.ts'

// ─── Quién manda en un pedido ────────────────────────────────────────────────
//
// Milagros lleva el pedido; Kevin y Renzo entraron invitados por ella; Andrea
// supervisa la tienda. Es el reparto real de una operación de ecommerce y por
// eso es el de las pruebas.

const PEDIDO: EquipoDelPedido = {
  assigned_seller_id: 'mila',
  writer_seller_ids: ['mila', 'kevin', 'renzo'],
  invited_by: { kevin: 'mila', renzo: 'kevin' },
}

const mila = { id: 'mila', available: true }
const kevin = { id: 'kevin', available: true }
const renzo = { id: 'renzo', available: true }
const andrea = { id: 'andrea', is_admin: true, available: true }
const ajeno = { id: 'otro', available: true }
const nadie = { id: null }

describe('escribir en el pedido', () => {
  it('el responsable y los invitados; quien administra, siempre', () => {
    expect(puedeEscribir(PEDIDO, mila)).toBe(true)
    expect(puedeEscribir(PEDIDO, kevin)).toBe(true)
    expect(puedeEscribir(PEDIDO, andrea)).toBe(true)
    expect(puedeEscribir(PEDIDO, ajeno)).toBe(false)
    expect(puedeEscribir(PEDIDO, nadie)).toBe(false)
  })

  // El turno lo pone el admin de la tienda: es lo que evita que un pedido caiga
  // en alguien que hoy no está.
  it('fuera de turno no se escribe, pero administrando sí', () => {
    expect(puedeEscribir(PEDIDO, { ...mila, available: false })).toBe(false)
    expect(puedeEscribir(PEDIDO, { ...andrea, available: false })).toBe(true)
  })

  // Sin la columna `available` no se puede concluir que alguien esté fuera.
  it('sin dato de turno se asume en turno', () => {
    expect(puedeEscribir(PEDIDO, { id: 'kevin' })).toBe(true)
  })
})

describe('invitar', () => {
  // Quien atiende es quien descubre que necesita a Logística. Obligarlo a
  // pedírselo al supervisor añade un salto que se hace por WhatsApp.
  it('puede cualquiera que escriba, no solo el responsable', () => {
    expect(puedeInvitar(PEDIDO, mila)).toBe(true)
    expect(puedeInvitar(PEDIDO, kevin)).toBe(true)
    expect(puedeInvitar(PEDIDO, ajeno)).toBe(false)
  })
})

describe('pasar el pedido a otro', () => {
  // El responsable puede soltarlo; el supervisor puede quitárselo. Un invitado
  // entró a ayudar, no a quedarse con el pedido de otro.
  it('el responsable y quien administra; un invitado no', () => {
    expect(puedeReasignar(PEDIDO, mila)).toBe(true)
    expect(puedeReasignar(PEDIDO, andrea)).toBe(true)
    expect(puedeReasignar(PEDIDO, kevin)).toBe(false)
    expect(puedeReasignar(PEDIDO, ajeno)).toBe(false)
  })

  // Reasignar es del pedido, no del turno: un supervisor cubre justamente
  // cuando el equipo no está.
  it('se puede aunque el supervisor esté fuera de turno', () => {
    expect(puedeReasignar(PEDIDO, { ...andrea, available: false })).toBe(true)
  })
})

describe('sacar a alguien del pedido', () => {
  it('quien lo invitó', () => {
    expect(puedeQuitar(PEDIDO, mila, 'kevin')).toBe(true)   // mila invitó a kevin
    expect(puedeQuitar(PEDIDO, kevin, 'renzo')).toBe(true)  // kevin invitó a renzo
  })

  // El que faltaba: sin esto, un invitado por alguien que ya no está en la
  // empresa se quedaba dentro para siempre — el único que podía sacarlo era
  // justo el que se fue.
  it('el responsable, aunque no lo haya invitado él', () => {
    expect(puedeQuitar(PEDIDO, mila, 'renzo')).toBe(true)
  })

  it('y quien administra', () => {
    expect(puedeQuitar(PEDIDO, andrea, 'renzo')).toBe(true)
  })

  it('pero no un invitado a otro invitado que no trajo', () => {
    expect(puedeQuitar(PEDIDO, renzo, 'kevin')).toBe(false)
  })

  // Al responsable no se le saca: para eso se pasa el pedido. Sacarlo dejaría
  // un pedido sin nadie que responda por él.
  it('al responsable no se le saca: se reasigna', () => {
    expect(puedeQuitar(PEDIDO, andrea, 'mila')).toBe(false)
    expect(puedeQuitar(PEDIDO, mila, 'mila')).toBe(false)
  })
})

describe('esResponsable', () => {
  it('mira el pedido, no el rol', () => {
    expect(esResponsable(PEDIDO, mila)).toBe(true)
    expect(esResponsable(PEDIDO, andrea)).toBe(false)
    expect(esResponsable(PEDIDO, nadie)).toBe(false)
  })

  // Un pedido sin responsable no hace responsable a quien no tiene id.
  it('un pedido sin asignar no es de nadie', () => {
    expect(esResponsable({}, nadie)).toBe(false)
    expect(esResponsable({}, mila)).toBe(false)
  })
})
