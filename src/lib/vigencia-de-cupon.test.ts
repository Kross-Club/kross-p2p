import { describe, it, expect } from 'vitest'
import { vigenciaDeCupon, sePuedeEnviarCobro, avisoDeVigencia } from './vigencia-de-cupon'

const AHORA = Date.parse('2026-08-31T12:00:00.000Z')
const enDias = (d: number) => new Date(AHORA + d * 86_400_000).toISOString()

describe('si el cupón sigue vivo', () => {
  it('con fecha por delante, vigente', () => {
    expect(vigenciaDeCupon(enDias(5), AHORA)).toBe('vigente')
  })

  it('con fecha pasada, vencido', () => {
    expect(vigenciaDeCupon(enDias(-1), AHORA)).toBe('vencido')
  })

  // Los cupones emitidos antes de que se guardara la fecha (bloque §35).
  it('sin fecha, desconocido — que no es lo mismo que vencido', () => {
    expect(vigenciaDeCupon(null, AHORA)).toBe('desconocido')
    expect(vigenciaDeCupon('', AHORA)).toBe('desconocido')
    expect(vigenciaDeCupon('no es una fecha', AHORA)).toBe('desconocido')
  })
})

describe('cuándo se deja mandar la tarjeta de pago', () => {
  it('vigente sí, vencido no', () => {
    expect(sePuedeEnviarCobro('vigente')).toBe(true)
    expect(sePuedeEnviarCobro('vencido')).toBe(false)
  })

  // La decisión que más cuesta explicar: no saber si algo caducó no es saber
  // que caducó. Bloquear por una columna vacía dejaría sin cobrar pedidos con
  // el cupón vivo — un error silencioso y del lado caro. Si resulta vencido, el
  // comprador lo ve al pagar; si se bloquea, no se entera nadie.
  it('desconocido deja mandar', () => {
    expect(sePuedeEnviarCobro('desconocido')).toBe(true)
  })
})

describe('lo que dice la tarjeta', () => {
  it('avisa cuándo vence, y cuándo venció', () => {
    expect(avisoDeVigencia(enDias(5), AHORA)).toMatch(/^El código vence el /)
    expect(avisoDeVigencia(enDias(-2), AHORA)).toMatch(/^El código venció el /)
  })

  // Sin fecha no se inventa una frase: media línea vaga sobre el vencimiento
  // hace dudar de todas las demás.
  it('sin fecha no dice nada', () => {
    expect(avisoDeVigencia(null, AHORA)).toBe(null)
  })
})
