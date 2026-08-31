import { describe, it, expect } from 'vitest'
import { TIPO_COBRO, textoDeCobro, etiquetaDePago } from './cobro-por-chat'

describe('el mensaje que vuelve a pedir el saldo', () => {
  // Se basta solo porque este MISMO texto sale en la push y en WhatsApp, donde
  // no hay botón que tocar. Sin el monto, el aviso no da razones para abrir.
  it('lleva el monto y a cambio de qué', () => {
    const t = textoDeCobro('S/ 60')
    expect(t).toContain('S/ 60')
    expect(t).toContain('clave de recojo')
  })

  // Nada de "toca el botón de abajo": en una notificación no hay abajo.
  it('no se apoya en algo que en una notificación no existe', () => {
    expect(textoDeCobro('S/ 60').toLowerCase()).not.toMatch(/bot[óo]n|aqu[íi] abajo|m[áa]s abajo/)
  })

  it('el botón nombra la acción con su monto', () => {
    expect(etiquetaDePago('S/ 60')).toBe('Pagar S/ 60 con Yape')
  })

  it('el tipo es uno solo para quien lo manda y quien lo pinta', () => {
    expect(TIPO_COBRO).toBe('cobro')
  })
})
