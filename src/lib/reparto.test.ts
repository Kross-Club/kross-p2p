import { describe, expect, it } from 'vitest'
import {
  NOMBRE_DE_REPARTO, esReparto, ofreceDomicilio, repartoInicial, repartosPosibles,
} from '../../supabase/functions/_shared/reparto.ts'

const PROPIO = { home_delivery_enabled: true, courier_lima_enabled: false }
const COURIER = { home_delivery_enabled: false, courier_lima_enabled: true }
const LAS_DOS = { home_delivery_enabled: true, courier_lima_enabled: true }
const NINGUNA = { home_delivery_enabled: false, courier_lima_enabled: false }

describe('en qué región reparte cada forma', () => {
  it('el motorizado propio vale en todo el país', () => {
    expect(ofreceDomicilio(PROPIO, 'LIMA')).toBe(true)
    expect(ofreceDomicilio(PROPIO, 'PROVINCIA')).toBe(true)
    expect(ofreceDomicilio(PROPIO, null)).toBe(true)
  })

  it('el courier SOLO en Lima y Callao: en provincia no se promete nada', () => {
    // Prometer entrega a la puerta en Arequipa con un courier que solo cubre
    // Lima es prometer algo que nadie va a hacer.
    expect(ofreceDomicilio(COURIER, 'LIMA')).toBe(true)
    expect(ofreceDomicilio(COURIER, 'PROVINCIA')).toBe(false)
  })

  it('sin región todavía manda la bandera general', () => {
    // El comprador aún no eligió distrito: el courier entra recién cuando se
    // sabe que el pedido es de Lima, y el reducer renormaliza ahí.
    expect(ofreceDomicilio(COURIER, null)).toBe(false)
    expect(ofreceDomicilio(PROPIO, null)).toBe(true)
  })

  it('con las dos formas alcanza con una para ofrecer', () => {
    expect(ofreceDomicilio(LAS_DOS, 'LIMA')).toBe(true)
    expect(ofreceDomicilio(LAS_DOS, 'PROVINCIA')).toBe(true)
  })

  it('sin ninguna no hay domicilio en ninguna región', () => {
    for (const r of ['LIMA', 'PROVINCIA', null] as const) expect(ofreceDomicilio(NINGUNA, r)).toBe(false)
  })

  it('un campo ausente (marca vieja, antes de la columna) no enciende nada', () => {
    expect(ofreceDomicilio({}, 'LIMA')).toBe(false)
    expect(ofreceDomicilio({ home_delivery_enabled: true }, 'LIMA')).toBe(true)
    expect(ofreceDomicilio({ courier_lima_enabled: null }, 'LIMA')).toBe(false)
  })
})

describe('con qué reparto nace un pedido', () => {
  it('con una sola forma se fija sola: no hay nada que preguntarle al vendedor', () => {
    expect(repartoInicial(PROPIO)).toBe('PROPIO')
    expect(repartoInicial(COURIER)).toBe('COURIER')
  })

  it('con las dos queda sin decidir: es una decisión del comercio, pedido por pedido', () => {
    expect(repartoInicial(LAS_DOS)).toBeNull()
  })

  it('sin ninguna también es null: ese pedido no va a domicilio', () => {
    expect(repartoInicial(NINGUNA)).toBeNull()
    expect(repartoInicial({})).toBeNull()
  })
})

describe('lo que el panel le ofrece al vendedor', () => {
  it('solo lista lo que la marca tiene contratado', () => {
    expect(repartosPosibles(LAS_DOS)).toEqual(['PROPIO', 'COURIER'])
    expect(repartosPosibles(COURIER)).toEqual(['COURIER'])
    expect(repartosPosibles(NINGUNA)).toEqual([])
  })

  it('cada forma tiene nombre para el panel', () => {
    for (const r of ['PROPIO', 'COURIER'] as const) {
      expect(NOMBRE_DE_REPARTO[r].length).toBeGreaterThan(3)
    }
  })

  it('esReparto rechaza lo que no es una forma', () => {
    expect(esReparto('PROPIO')).toBe(true)
    expect(esReparto('propio')).toBe(false)
    expect(esReparto(null)).toBe(false)
    expect(esReparto('SHALOM')).toBe(false)
  })
})
