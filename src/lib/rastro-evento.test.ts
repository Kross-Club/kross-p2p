import { describe, it, expect } from 'vitest'
import { rastroDelEvento, rastroSinEvento } from '../../supabase/functions/_shared/rastro.ts'

// ─── Cómo se lee el rastro de un pago ────────────────────────────────────────
//
// Vive en `_shared/` porque lo leen DOS funciones —`get-session`, para el panel,
// y `get-comprobante`, para la constancia del comprador— y tienen que decir el
// mismo número de operación. Se escribió dos veces una vez y la segunda salió
// distinta: `raw.coupon.bank` en vez de `raw.bank_tx_id`, o sea un comprobante
// sin banco sin que nada fallara.

describe('el rastro sin evento', () => {
  // Un cupón EMITIDO y sin pagar: existe con qué buscarlo aunque no haya
  // ocurrido ningún movimiento bancario. Y es justo cuando hay que buscarlo —
  // el cliente dice "ya pagué" y en el panel no aparece.
  it('devuelve el cupón y el código, sin rastro bancario', () => {
    expect(rastroSinEvento('cup_1', 'KSH347')).toEqual({
      operation_number: null, bank: null, coupon_id: 'cup_1', payment_code: 'KSH347',
    })
  })

  it('sin cupón ni código no hay nada que devolver', () => {
    expect(rastroSinEvento(null, null)).toBeNull()
  })
})

describe('el rastro con el evento del webhook', () => {
  const raw = JSON.stringify({ operation_number: '00912345', bank_tx_id: 'BCP', code: 'KSH999', fees: 1.5 })

  it('saca la operación, el banco y el código del raw', () => {
    expect(rastroDelEvento({ raw }, 'cup_1', null)).toEqual({
      operation_number: '00912345', bank: 'BCP', coupon_id: 'cup_1', payment_code: 'KSH999',
    })
  })

  // La columna del evento manda sobre el `raw`: es la que el webhook normaliza.
  it('la columna del evento gana sobre el raw', () => {
    expect(rastroDelEvento({ raw, operation_number: '777' }, null, null)?.operation_number).toBe('777')
  })

  // Y la fila del pedido manda sobre las dos para el código: el `raw` es el
  // respaldo para pedidos que pagaron pese a que la emisión no llegó a guardar
  // su columna.
  it('el código de la fila gana sobre el del raw', () => {
    expect(rastroDelEvento({ raw }, null, 'KSH111')?.payment_code).toBe('KSH111')
  })

  // Eventos viejos del flujo manual: el `raw` no siempre es JSON. Que un
  // comprobante no se pueda pintar porque un evento de hace meses trae texto
  // suelto sería perder el dato bueno por el malo.
  it('un raw que no es JSON no rompe: devuelve lo que sí se sabe', () => {
    expect(rastroDelEvento({ raw: 'yape 90 soles' }, 'cup_1', 'KSH347')).toEqual({
      operation_number: null, bank: null, coupon_id: 'cup_1', payment_code: 'KSH347',
    })
  })

  it('sin evento cae en lo que se sabe sin él', () => {
    expect(rastroDelEvento(null, 'cup_1', 'KSH347')?.coupon_id).toBe('cup_1')
    expect(rastroDelEvento(undefined, null, null)).toBeNull()
  })
})
