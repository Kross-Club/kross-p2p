import { describe, it, expect } from 'vitest'
import { datosDeRastro, textoParaSoporte } from './rastro-de-pago'

// El primer cobro real de Kross Shop, con la forma que tienen sus datos: el
// código de pago lo escribe el comercio (prefijo KSH), el cupón es el `_id` de
// 360pay y la operación viene del banco por el webhook.
const TRACE = {
  payment_code: 'KSH0042',
  coupon_id: '66d1f0a9c3e14b0012a7bf51',
  operation_number: '00912345',
  bank: 'BCP',
}
const ENTRADA = { orderId: 'ORD-17563450300922', trace: TRACE, cobradoEn: '2026-08-31T21:20:00.000Z' }

const etiquetas = (d: { etiqueta: string }[]) => d.map(x => x.etiqueta)
const valorDe = (d: { etiqueta: string; valor: string }[], e: string) => d.find(x => x.etiqueta === e)?.valor

describe('con qué se sigue un cobro', () => {
  // El orden es el orden en que se busca: se lista por código de pago, se abre
  // el cupón, y solo si hay que escalar aparece el banco.
  it('están los cuatro, en el orden en que se usan', () => {
    expect(etiquetas(datosDeRastro(ENTRADA)))
      .toEqual(['Pedido', 'Código de pago', 'Cupón 360pay', 'Op. bancaria', 'Cobrado'])
  })

  // El que faltaba en pantalla: vivía solo dentro del texto del botón de copiar,
  // así que para leer el dato que pide soporte había que copiar a ciegas.
  it('el cupón se ve, no solo se copia', () => {
    expect(valorDe(datosDeRastro(ENTRADA), 'Cupón 360pay')).toBe('66d1f0a9c3e14b0012a7bf51')
    expect(datosDeRastro(ENTRADA).find(d => d.etiqueta === 'Cupón 360pay')?.largo).toBe(true)
  })

  // Operación y banco son UN dato: el número sin el banco no se busca en
  // ninguna parte, y al revés tampoco.
  it('la operación va con su banco', () => {
    expect(valorDe(datosDeRastro(ENTRADA), 'Op. bancaria')).toBe('00912345 · BCP')
    expect(valorDe(datosDeRastro({ trace: { operation_number: '00912345' } }), 'Op. bancaria')).toBe('00912345')
    expect(valorDe(datosDeRastro({ trace: { bank: 'BCP' } }), 'Op. bancaria')).toBe('BCP')
  })

  // Media línea diciendo "Op. bancaria —" hace dudar de si falta el dato o falló
  // la pantalla. Lo que no existe no se pinta.
  it('lo que no hay no ocupa una línea', () => {
    expect(datosDeRastro({ orderId: 'ORD-1', trace: null })).toEqual([{ etiqueta: 'Pedido', valor: 'ORD-1', largo: false }])
    expect(datosDeRastro({})).toEqual([])
    expect(datosDeRastro({ orderId: '   ', trace: { payment_code: '' } })).toEqual([])
  })

  // Un cupón emitido y sin pagar no tiene operación ni fecha, pero SÍ tiene con
  // qué buscarlo — y es justo cuando hay que buscarlo: el cliente dice que pagó
  // y en el panel no aparece.
  it('un cupón sin pagar igual se puede rastrear', () => {
    expect(etiquetas(datosDeRastro({ trace: { payment_code: 'KSH0042', coupon_id: 'abc123' } })))
      .toEqual(['Código de pago', 'Cupón 360pay'])
  })
})

describe('el texto para soporte', () => {
  // Sale de la MISMA lista que se pinta: es lo que impide que vuelvan a
  // separarse, que es como el cupón terminó visible en un lado y no en el otro.
  it('es lo que se ve, en texto', () => {
    const datos = datosDeRastro(ENTRADA)
    const texto = textoParaSoporte('Adelanto pagado con Yape (360pay)', 'S/ 75', datos)
    expect(texto.split('\n')[0]).toBe('Adelanto pagado con Yape (360pay) — S/ 75')
    for (const d of datos) expect(texto).toContain(`${d.etiqueta}: ${d.valor}`)
    expect(texto.split('\n')).toHaveLength(datos.length + 1)
  })
})
