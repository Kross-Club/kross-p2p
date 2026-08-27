import { describe, it, expect } from 'vitest'
import { horaOFecha, diaMes, fechaCorta } from './fechas'

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
