import { describe, expect, it } from 'vitest'
import { esGuiaConfirmada, esRotuloDeGuia, pdfDeGuiaAEnsenar, pdfMejorable } from '../../../supabase/functions/_shared/guia-pdf.ts'

const GUIA = 'https://x/shalom-guias/s1/95875014-guia.pdf'
const ROTULO = 'https://x/shalom-guias/s1/95875014-rotulo.pdf'
const VIEJO = 'https://x/shalom-guias/s1/95875014.pdf'

describe('qué es cada PDF de guía', () => {
  it('reconoce el voucher y el rótulo por su sufijo', () => {
    expect(esGuiaConfirmada(GUIA)).toBe(true)
    expect(esRotuloDeGuia(ROTULO)).toBe(true)
    expect(esGuiaConfirmada(VIEJO)).toBe(false)
    expect(esRotuloDeGuia(VIEJO)).toBe(false)
  })
  it('es mejorable todo lo que no es el voucher confirmado', () => {
    expect(pdfMejorable(null)).toBe(true)
    expect(pdfMejorable(ROTULO)).toBe(true)
    expect(pdfMejorable(VIEJO)).toBe(true)
    expect(pdfMejorable(GUIA)).toBe(false)
  })
})

describe('pdfDeGuiaAEnsenar · con varios mensajes de guía', () => {
  it('prefiere el voucher confirmado aunque no sea el último', () => {
    expect(pdfDeGuiaAEnsenar([
      { type: 'guia', media_url: ROTULO },
      { type: 'guia', media_url: GUIA },
      { type: 'guia', media_url: ROTULO },
    ])).toBe(GUIA)
  })
  it('sin voucher confirmado, el más reciente (un reenvío pisa al original)', () => {
    expect(pdfDeGuiaAEnsenar([
      { type: 'guia', media_url: VIEJO },
      { type: 'text', media_url: null },
      { type: 'guia', media_url: ROTULO },
    ])).toBe(ROTULO)
  })
  it('ignora los mensajes de guía sin PDF, y sin ninguno devuelve null', () => {
    expect(pdfDeGuiaAEnsenar([{ type: 'guia', media_url: VIEJO }, { type: 'guia', media_url: null }])).toBe(VIEJO)
    expect(pdfDeGuiaAEnsenar([{ type: 'guia', media_url: null }])).toBeNull()
    expect(pdfDeGuiaAEnsenar([])).toBeNull()
  })
})
