import { describe, expect, it } from 'vitest'
import {
  CODIGO_LARGO, INTENTOS_MAX, desdeLaVentana, enmascararTelefono, esDniValido,
  estadoDeCodigo, generarCodigo, normalizarCodigo, puedeMandarCodigo,
  telefonoWhatsApp, venceEn, venceLaSesion,
} from '../../supabase/functions/_shared/acceso-comprador.ts'

const ahora = new Date('2026-09-09T12:00:00Z')

describe('esDniValido', () => {
  it('ocho dígitos y nada más', () => {
    expect(esDniValido('48296862')).toBe(true)
    expect(esDniValido(' 48296862 ')).toBe(true)
    expect(esDniValido('4829686')).toBe(false)
    expect(esDniValido('482968620')).toBe(false)
    expect(esDniValido('4829686a')).toBe(false)
    expect(esDniValido(null)).toBe(false)
  })
})

describe('normalizarCodigo', () => {
  it('acepta el código con espacios o guiones, y rechaza lo que no mide seis', () => {
    expect(normalizarCodigo('123 456')).toBe('123456')
    expect(normalizarCodigo('123-456')).toBe('123456')
    expect(normalizarCodigo('12345')).toBeNull()
    expect(normalizarCodigo('1234567')).toBeNull()
    expect(normalizarCodigo('')).toBeNull()
  })
})

describe('generarCodigo', () => {
  it('siempre seis dígitos', () => {
    let n = 0
    const codigo = generarCodigo(() => (n++ * 37) & 0xff)
    expect(codigo).toMatch(/^\d{6}$/)
    expect(codigo).toHaveLength(CODIGO_LARGO)
  })

  // 250..255 se descartan: con el resto entre 10 sobre 0..255, los dígitos 0 a 5
  // saldrían más seguido. Un sesgo en un código de acceso reduce el espacio real.
  it('descarta el tramo que sesgaría los dígitos', () => {
    const fuente = [250, 251, 255, 7, 1, 2, 3, 4, 5]
    let i = 0
    expect(generarCodigo(() => fuente[i++])).toBe('712345')
  })

  it('reparte parejo: ningún dígito se lleva más del doble de lo que le toca', () => {
    // mulberry32: un generador determinista decente. Con uno malo lo que se
    // mediría es su sesgo, no el de `generarCodigo`.
    let x = 0x9e3779b9
    const byte = () => {
      x = (x + 0x6d2b79f5) >>> 0
      let t = x
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) & 0xff
    }
    const cuenta: Record<string, number> = {}
    const vueltas = 3000
    for (let i = 0; i < vueltas; i++) {
      for (const d of generarCodigo(byte)) cuenta[d] = (cuenta[d] ?? 0) + 1
    }
    const esperado = vueltas * CODIGO_LARGO / 10
    for (const d of '0123456789') {
      expect(cuenta[d] ?? 0).toBeGreaterThan(esperado * 0.5)
      expect(cuenta[d] ?? 0).toBeLessThan(esperado * 2)
    }
  })
})

describe('telefonoWhatsApp', () => {
  it('normaliza a 51 + nueve dígitos', () => {
    expect(telefonoWhatsApp('924881241')).toBe('51924881241')
    expect(telefonoWhatsApp('+51 924 881 241')).toBe('51924881241')
    expect(telefonoWhatsApp('0924881241')).toBe('51924881241')
    expect(telefonoWhatsApp('51924881241')).toBe('51924881241')
  })

  it('lo que no es un celular peruano no se manda a ningún lado', () => {
    expect(telefonoWhatsApp('12345')).toBeNull()
    expect(telefonoWhatsApp('')).toBeNull()
    expect(telefonoWhatsApp(null)).toBeNull()
  })
})

describe('enmascararTelefono', () => {
  it('deja ver los tres últimos, nada más', () => {
    expect(enmascararTelefono('924881241')).toBe('+51 ••• ••• 241')
    expect(enmascararTelefono('nada')).toBeNull()
  })
})

describe('estadoDeCodigo', () => {
  const vigente = { expires_at: '2026-09-09T12:05:00Z' }

  it('vigente y sin intentos gastados: usable', () => {
    expect(estadoDeCodigo(vigente, ahora)).toBe('usable')
  })

  it('vencido por tiempo', () => {
    expect(estadoDeCodigo({ expires_at: '2026-09-09T11:59:00Z' }, ahora)).toBe('vencido')
  })

  it('ya usado no se vuelve a usar', () => {
    expect(estadoDeCodigo({ ...vigente, used_at: '2026-09-09T12:01:00Z' }, ahora)).toBe('usado')
  })

  it('agotado al llegar al tope de intentos', () => {
    expect(estadoDeCodigo({ ...vigente, attempts: INTENTOS_MAX }, ahora)).toBe('agotado')
    expect(estadoDeCodigo({ ...vigente, attempts: INTENTOS_MAX - 1 }, ahora)).toBe('usable')
  })

  it('sin código, vencido: nunca «usable» por descuido', () => {
    expect(estadoDeCodigo(null, ahora)).toBe('vencido')
    expect(estadoDeCodigo(undefined, ahora)).toBe('vencido')
  })
})

describe('los plazos', () => {
  it('el código dura diez minutos y la ventana mira quince atrás', () => {
    expect(venceEn(ahora).toISOString()).toBe('2026-09-09T12:10:00.000Z')
    expect(desdeLaVentana(ahora).toISOString()).toBe('2026-09-09T11:45:00.000Z')
  })

  it('la sesión dura treinta días', () => {
    expect(venceLaSesion(ahora).toISOString()).toBe('2026-10-09T12:00:00.000Z')
  })
})

describe('puedeMandarCodigo', () => {
  const lista = { wa_enabled: true, wa_phone_number_id: '123', wa_codigo_template: 'codigo_acceso' }

  it('con WhatsApp encendido, número y plantilla: sí', () => {
    expect(puedeMandarCodigo(lista, true)).toBe(true)
  })

  // Configurar la plantilla ES encender la seguridad: cada una de estas piezas
  // que falte deja la puerta del DNI abierta, y por eso se miran todas.
  it('si falta cualquier pieza, no', () => {
    expect(puedeMandarCodigo({ ...lista, wa_enabled: false }, true)).toBe(false)
    expect(puedeMandarCodigo({ ...lista, wa_phone_number_id: '  ' }, true)).toBe(false)
    expect(puedeMandarCodigo({ ...lista, wa_codigo_template: null }, true)).toBe(false)
    expect(puedeMandarCodigo(lista, false)).toBe(false)
    expect(puedeMandarCodigo(null, true)).toBe(false)
  })
})
