import { describe, it, expect } from 'vitest'
import { EMPRESA, etiquetaTitular, formatoTelefono, whatsappLink } from './empresa'

// Estos datos se imprimen en los términos, en la política de devoluciones y en
// la Hoja de Reclamación que se le entrega al consumidor. Un dígito mal
// tecleado en el RUC no lo nota nadie al mirar la web: lo nota INDECOPI. El
// test vigila el archivo, no el diseño.

/** Dígito verificador del RUC (módulo 11, tabla de SUNAT). */
function rucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(ruc[i]), 0)
  const resto = 11 - (suma % 11)
  const esperado = resto === 10 ? 0 : resto === 11 ? 1 : resto
  return esperado === Number(ruc[10])
}

describe('datos del comercio', () => {
  it('el RUC tiene 11 dígitos y pasa el dígito verificador', () => {
    expect(rucValido(EMPRESA.ruc)).toBe(true)
  })

  it('el RUC empieza por un tipo de contribuyente que existe', () => {
    // 10/15/17 persona natural con negocio · 20 persona jurídica.
    expect(['10', '15', '17', '20']).toContain(EMPRESA.ruc.slice(0, 2))
  })

  it('llama al titular como corresponde al tipo de RUC', () => {
    expect(etiquetaTitular()).toBe(EMPRESA.ruc.startsWith('20') ? 'Razón social' : 'Titular')
  })

  it('el WhatsApp es un móvil peruano con código de país', () => {
    expect(EMPRESA.whatsapp).toMatch(/^519\d{8}$/)
  })

  it('los correos tienen forma de correo', () => {
    for (const correo of [EMPRESA.email, EMPRESA.emailReclamos]) {
      expect(correo).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)
    }
  })

  it('las redes apuntan a una URL https real', () => {
    for (const red of EMPRESA.redes) {
      expect(red.url).toMatch(/^https:\/\/\S+\.\S+/)
      expect(red.url).not.toMatch(/…|ejemplo|example/)
    }
  })

  it('formatea el teléfono en vez de mostrar el pegote de dígitos', () => {
    expect(formatoTelefono('51925951393')).toBe('+51 925 951 393')
    expect(formatoTelefono('')).toBe('')
  })

  it('el enlace de WhatsApp lleva el número y el mensaje', () => {
    const url = whatsappLink('Hola')
    expect(url).toBe(`https://wa.me/${EMPRESA.whatsapp}?text=Hola`)
  })
})
