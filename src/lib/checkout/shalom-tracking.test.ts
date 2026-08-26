// Tests del tracking de Shalom. Igual que con Olva y 360pay, el dominio del
// proveedor está bloqueado por egress desde estas sesiones: lo que se prueba es
// lo NUESTRO — la validación de identificadores y el mapeo de hitos a fase
// canónica, que decide cuándo se dispara la cobranza del saldo (§3 del módulo).
// A diferencia de Olva, aquí el mapeo es determinista: el proveedor marca los
// hitos, no hay que adivinarlos en textos.

import { describe, expect, it } from 'vitest'
import { derivePhase, isValidCodigo, isValidNumero } from './services/ShalomTrackingService'

describe('identificadores del comprobante', () => {
  it('numero: 8–10 dígitos (la guía)', () => {
    expect(isValidNumero('82100156')).toBe(true)
    expect(isValidNumero('8210015612')).toBe(true)
    expect(isValidNumero('1234567')).toBe(false)
    expect(isValidNumero('12345678901')).toBe(false)
    expect(isValidNumero('')).toBe(false)
    expect(isValidNumero('W79H')).toBe(false)
  })
  it('codigo: 4 alfanuméricos, sin distinguir mayúsculas', () => {
    expect(isValidCodigo('W79H')).toBe(true)
    expect(isValidCodigo('cjtw')).toBe(true)
    expect(isValidCodigo('W79')).toBe(false)
    expect(isValidCodigo('W79H5')).toBe(false)
    expect(isValidCodigo('')).toBe(false)
  })
})

describe('fase canónica del envío', () => {
  // La línea de tiempo del ejemplo de la doc del proveedor, completa.
  const entregado = {
    registrado: { fecha: '2026-04-15 09:12:30' },
    origen: { fecha: '2026-04-15 09:12:30' },
    transito: { fecha: '2026-04-15 14:08:21', completo: true, cargueros: ['964724'] },
    demora: null,
    destino: { fecha: '2026-04-16 01:01:03', completo: true },
    entregado: { fecha: '2026-04-16 11:40:45' },
    reparto: null,
  }

  it('gana el hito más avanzado que venga marcado', () => {
    expect(derivePhase(entregado)).toBe('ENTREGADO')
    expect(derivePhase({ ...entregado, entregado: null })).toBe('EN_DESTINO')
    expect(derivePhase({ ...entregado, entregado: null, destino: null })).toBe('EN_TRANSITO')
    // `registrado` NO es una fase: la guía existe, pero el paquete puede seguir
    // en nuestro almacén. Decir EN_ORIGEN acá borraba el hueco más caro del
    // contraentrega —"emití la guía y nunca fui a dejar el paquete"—, que es
    // justo el que hay que poder ver.
    expect(derivePhase({ registrado: { fecha: 'x' }, origen: null })).toBe(null)
    expect(derivePhase({ registrado: { fecha: 'x' }, origen: { fecha: 'y' } })).toBe('EN_ORIGEN')
  })

  it('reparto (salió a puerta) también es EN_DESTINO', () => {
    expect(derivePhase({
      transito: { fecha: 'x' },
      destino: null,
      reparto: { fecha: 'x' },
      entregado: null,
    })).toBe('EN_DESTINO')
  })

  it('demora no es una fase: no adelanta ni retrocede el estado', () => {
    expect(derivePhase({ transito: { fecha: 'x' }, demora: { fecha: 'y' } })).toBe('EN_TRANSITO')
    expect(derivePhase({ demora: { fecha: 'y' } })).toBe(null)
  })

  it('sin hitos marcados devuelve null, nunca inventa fase', () => {
    expect(derivePhase({})).toBe(null)
    expect(derivePhase({ registrado: null, origen: null, entregado: null })).toBe(null)
  })
})
