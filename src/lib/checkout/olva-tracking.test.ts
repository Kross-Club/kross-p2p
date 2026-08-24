// Tests del tracking de Olva. Igual que con 360pay, el dominio del proveedor
// está bloqueado por egress desde estas sesiones: lo que se prueba es lo NUESTRO
// — la validación del número de guía y el mapeo de eventos a fase canónica, que
// es quien decide cuándo se dispara la cobranza del saldo (§3 del módulo).

import { describe, expect, it } from 'vitest'
import { derivePhase, isValidTrack } from './services/OlvaTrackingService'

describe('número de guía', () => {
  it('acepta el formato típico de Olva (8 dígitos) y tolera 6–15', () => {
    expect(isValidTrack('17491234')).toBe(true)
    expect(isValidTrack('123456')).toBe(true)
    expect(isValidTrack('123456789012345')).toBe(true)
  })
  it('rechaza vacío, corto, largo o con letras', () => {
    expect(isValidTrack('')).toBe(false)
    expect(isValidTrack('12345')).toBe(false)
    expect(isValidTrack('1234567890123456')).toBe(false)
    expect(isValidTrack('ABC12345')).toBe(false)
  })
})

describe('fase canónica del envío', () => {
  it('gana la fase más avanzada, venga en el orden que venga', () => {
    const events = [
      { estado: 'REGISTRADO EN ORIGEN' },
      { estado: 'EN TRANSITO A DESTINO' },
      { estado: 'ENTREGADO AL CONSIGNADO' },
    ]
    expect(derivePhase(events)).toBe('ENTREGADO')
    expect(derivePhase(events.reverse())).toBe('ENTREGADO')
  })

  it('distingue tránsito de destino', () => {
    expect(derivePhase([{ estado: 'SALIDA DE AGENCIA' }, { d: 'TRASLADO EN RUTA' }])).toBe('EN_TRANSITO')
    expect(derivePhase([{ estado: 'DISPONIBLE PARA RECOJO EN AGENCIA' }])).toBe('EN_DESTINO')
  })

  it('lee cualquier campo string del evento, con o sin tildes', () => {
    expect(derivePhase([{ descripcion: 'En tránsito hacia Arequipa' }])).toBe('EN_TRANSITO')
    expect(derivePhase([{ x: 'ADMITIDO', otra: 42 }])).toBe('EN_ORIGEN')
  })

  it('sin calce devuelve null, nunca inventa fase', () => {
    expect(derivePhase([])).toBe(null)
    expect(derivePhase([{ estado: 'PROCESO INTERNO XYZ' }])).toBe(null)
  })
})
