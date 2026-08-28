import { describe, it, expect } from 'vitest'
import { puedePagarSaldo } from './order-money'
import type { PedidoConSaldo } from '../components/PagarSaldo'

const MITAD: PedidoConSaldo = {
  token: 't', product_price: 180, advance_amount: 90,
  payment_verification: 'MATCHED', payment_provider: '360PAY',
}

describe('cuándo se le puede ofrecer pagar el saldo', () => {
  it('adelantó la mitad, con el adelanto cruzado: sí', () => {
    expect(puedePagarSaldo(MITAD)).toBe(true)
  })

  it('pagó todo de una: no hay saldo que cobrar', () => {
    expect(puedePagarSaldo({ ...MITAD, advance_amount: 180 })).toBe(false)
  })

  // No es orden por orden: el código de pago identifica al CLIENTE y el banco
  // cobra siempre el cupón pendiente más antiguo. Con el adelanto sin pagar,
  // quien viene a pagar el saldo terminaría pagando el adelanto, por otro monto.
  it('con el adelanto sin cruzar, NO — pagaría el cupón equivocado', () => {
    expect(puedePagarSaldo({ ...MITAD, payment_verification: 'PENDING' })).toBe(false)
    expect(puedePagarSaldo({ ...MITAD, payment_verification: null })).toBe(false)
  })

  it('el saldo ya pagado no se vuelve a ofrecer', () => {
    expect(puedePagarSaldo({ ...MITAD, saldo_verification: 'MATCHED' })).toBe(false)
  })

  // Prometer un botón que no cobra es peor que no ponerlo: sin cobro en línea el
  // saldo lo coordina el asesor por el chat.
  it('sin cobro en línea conectado, no se ofrece', () => {
    expect(puedePagarSaldo({ ...MITAD, payment_provider: null })).toBe(false)
  })

  it('un cupón de saldo emitido y sin pagar se puede reintentar', () => {
    expect(puedePagarSaldo({ ...MITAD, saldo_verification: 'PENDING' })).toBe(true)
  })
})
