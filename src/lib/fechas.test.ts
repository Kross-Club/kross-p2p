import { describe, it, expect } from 'vitest'
import { horaOFecha, diaMes, fechaCorta, hace } from './fechas'

// Las fechas se construyen en hora local a propósito: es la que ve el vendedor,
// y es la que decide si algo "es de hoy".
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

describe('fechas del panel', () => {
  it('lo de hoy va con hora, lo demás con fecha', () => {
    const ahora = local(2026, 8, 27, 18).getTime()
    expect(horaOFecha(local(2026, 8, 27, 7).toISOString(), ahora)).toMatch(/\d{2}:\d{2}/)
    expect(horaOFecha(local(2026, 8, 20).toISOString(), ahora)).toMatch(/20/)
  })

  // El mismo día de OTRO mes o de otro año no es hoy. Comparar solo el número
  // del día es el error clásico.
  it('no confunde el mismo número de día de otro mes o año', () => {
    const ahora = local(2026, 8, 27, 18).getTime()
    expect(horaOFecha(local(2026, 7, 27).toISOString(), ahora)).toMatch(/27/)
    expect(horaOFecha(local(2025, 8, 27).toISOString(), ahora)).toMatch(/27/)
  })

  it('una fecha ilegible no rompe la tarjeta', () => {
    expect(horaOFecha(null, Date.now())).toBe('')
    expect(horaOFecha('cualquier cosa', Date.now())).toBe('')
    expect(diaMes(undefined)).toBe('')
    expect(fechaCorta('')).toBe('—')
  })

  it('día y mes, y la versión con año', () => {
    expect(diaMes(local(2026, 8, 27).toISOString())).toMatch(/27/)
    expect(fechaCorta(local(2026, 8, 27).toISOString())).toMatch(/26/)
  })
})

describe('cuánto hace', () => {
  const MIN = 60_000
  const H = 60 * MIN

  it('lo de hace un momento no se cuenta', () => {
    expect(hace(0)).toBe('recién')
    expect(hace(59_000)).toBe('recién')
  })

  // La unidad sube en cuanto el número deja de caber: 90 minutos se leen mejor
  // como "1 h" que como "90 min".
  it('sube de unidad cuando el número deja de caber', () => {
    expect(hace(5 * MIN)).toBe('hace 5 min')
    expect(hace(59 * MIN)).toBe('hace 59 min')
    expect(hace(90 * MIN)).toBe('hace 1 h')
    expect(hace(23 * H)).toBe('hace 23 h')
    expect(hace(50 * H)).toBe('hace 2 d')
  })

  it('un número imposible no rompe la fila', () => {
    expect(hace(NaN)).toBe('recién')
    expect(hace(-1000)).toBe('recién')
  })
})
