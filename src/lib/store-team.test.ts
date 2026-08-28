import { describe, it, expect, vi } from 'vitest'

// El módulo abre el cliente de Supabase al importarse, y en Node no hay
// variables de entorno de Vite. Acá solo se prueba la parte pura.
vi.mock('./supabase', () => ({ supabase: {} }))

const { involucradosDe } = await import('./store-team')

describe('quién está metido en un pedido', () => {
  // Primero el asignado: es el dueño de la conversación, y en la lista solo
  // caben dos o tres iniciales.
  it('el asignado va primero', () => {
    expect(involucradosDe({ assigned_seller_id: 'kevin', involved_seller_ids: ['andrea', 'renzo'] }))
      .toEqual(['kevin', 'andrea', 'renzo'])
  })

  it('nadie aparece dos veces', () => {
    expect(involucradosDe({
      assigned_seller_id: 'kevin',
      involved_seller_ids: ['kevin', 'andrea'],
      writer_seller_ids: ['andrea', 'renzo'],
    })).toEqual(['kevin', 'andrea', 'renzo'])
  })

  it('un pedido sin asignar no inventa a nadie', () => {
    expect(involucradosDe({})).toEqual([])
    expect(involucradosDe({ assigned_seller_id: null, involved_seller_ids: null })).toEqual([])
  })
})
