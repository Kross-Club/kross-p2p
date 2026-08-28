import { describe, it, expect } from 'vitest'
import { valorDelPedido, cobradoDelPedido, saldoDelPedido, plataDe, soles, avanceDelPago, cobrosDelPedido, puedePagarSaldo } from './order-money'

describe('la plata de un pedido', () => {
  it('el valor es el precio, y nunca negativo', () => {
    expect(valorDelPedido({ product_price: 150 })).toBe(150)
    expect(valorDelPedido({ product_price: '180' })).toBe(180)
    expect(valorDelPedido({})).toBe(0)
    expect(valorDelPedido({ product_price: -50 })).toBe(0)
    expect(valorDelPedido({ product_price: 'gratis' })).toBe(0)
  })

  // La regla cara: adelanto declarado ≠ plata en caja. Solo cuenta lo cruzado.
  it('solo cuenta como cobrado el adelanto que 360pay cruzó', () => {
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75 })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'PENDING' })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'UNMATCHED' })).toBe(0)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' })).toBe(75)
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'matched' })).toBe(75)
  })

  it('un adelanto mayor al precio no infla la columna', () => {
    expect(cobradoDelPedido({ product_price: 150, advance_amount: 900, payment_verification: 'MATCHED' })).toBe(150)
  })

  it('el saldo es lo que falta cobrar', () => {
    expect(saldoDelPedido({ product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' })).toBe(75)
    expect(saldoDelPedido({ product_price: 150, advance_amount: 150, payment_verification: 'MATCHED' })).toBe(0)
    // Sin cruzar, el pedido entero sigue por cobrar.
    expect(saldoDelPedido({ product_price: 150, advance_amount: 75 })).toBe(150)
  })

  it('suma un grupo entero', () => {
    const plata = plataDe([
      { product_price: 150, advance_amount: 75, payment_verification: 'MATCHED' },
      { product_price: 120, advance_amount: 120, payment_verification: 'MATCHED' },
      { product_price: 180, advance_amount: 90 },
    ])
    expect(plata.valor).toBe(450)
    expect(plata.cobrado).toBe(195)
    expect(plata.saldo).toBe(255)
  })

  it('un grupo vacío es cero, no NaN', () => {
    expect(plataDe([])).toEqual({ valor: 0, cobrado: 0, saldo: 0 })
  })

  it('escribe soles peruanos, redondeados al sol', () => {
    expect(soles(1234)).toBe('S/ 1,234')
    expect(soles(150.6)).toBe('S/ 151')
    expect(soles(0)).toBe('S/ 0')
    expect(soles(null)).toBe('S/ 0')
    expect(soles('180')).toBe('S/ 180')
  })
})

describe('cuánto del pedido ya está pagado', () => {
  it('la mitad es media vuelta', () => {
    const a = avanceDelPago({ product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' })
    expect(a.fraccion).toBeCloseTo(0.5)
    expect(a.completo).toBe(false)
    expect(a.vacio).toBe(false)
  })

  it('pagado entero cierra el anillo', () => {
    const a = avanceDelPago({ product_price: 180, advance_amount: 180, payment_verification: 'MATCHED' })
    expect(a.fraccion).toBe(1)
    expect(a.completo).toBe(true)
  })

  // La mentira más cara sería un anillo lleno con un adelanto que nadie cruzó:
  // es justo la que hace despachar.
  it('lo declarado y no cruzado no llena nada', () => {
    const a = avanceDelPago({ product_price: 180, advance_amount: 90 })
    expect(a.fraccion).toBe(0)
    expect(a.vacio).toBe(true)
  })

  it('un precio raro no rompe el anillo', () => {
    expect(avanceDelPago({}).fraccion).toBe(0)
    expect(avanceDelPago({ product_price: 0, advance_amount: 50, payment_verification: 'MATCHED' }).completo).toBe(true)
    expect(avanceDelPago({ product_price: 100, advance_amount: 900, payment_verification: 'MATCHED' }).fraccion).toBe(1)
  })
})

// ─── Adelanto, pago total y saldo son tres cosas ─────────────────────────────
//
// Al empezar el comprador o adelanta o paga todo; el SALDO es una segunda
// operación, días después, cuando ya existe la guía. Cada una tiene su cupón y
// su rastro bancario, así que se cuentan y se muestran por separado.
describe('las operaciones de cobro', () => {
  it('media parte es un adelanto', () => {
    const c = cobrosDelPedido({ product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' })
    expect(c).toEqual([{ tipo: 'adelanto', monto: 90, verificado: true }])
  })

  // Llamarlo adelanto haría buscar un saldo que no existe.
  it('pagar el precio entero de una NO es un adelanto', () => {
    const c = cobrosDelPedido({ product_price: 180, advance_amount: 180, payment_verification: 'MATCHED' })
    expect(c[0].tipo).toBe('total')
  })

  it('el saldo entra como una segunda operación', () => {
    const c = cobrosDelPedido({
      product_price: 180, advance_amount: 90, payment_verification: 'MATCHED',
      saldo_amount: 90, saldo_verification: 'MATCHED',
    })
    expect(c.map(x => x.tipo)).toEqual(['adelanto', 'saldo'])
    expect(c.every(x => x.verificado)).toBe(true)
  })

  it('un cupón emitido y sin pagar aparece, pero sin verificar', () => {
    const c = cobrosDelPedido({
      product_price: 180, advance_amount: 90, payment_verification: 'MATCHED',
      saldo_amount: 90, saldo_verification: 'PENDING',
    })
    expect(c[1]).toEqual({ tipo: 'saldo', monto: 90, verificado: false })
  })

  it('sin cobros no inventa ninguno', () => {
    expect(cobrosDelPedido({ product_price: 180 })).toEqual([])
  })
})

describe('el anillo solo se llena con plata que pasó por la pasarela', () => {
  const MITAD = { product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' }

  it('con el adelanto cruzado va a la mitad', () => {
    expect(avanceDelPago(MITAD).fraccion).toBeCloseTo(0.5)
    expect(avanceDelPago(MITAD).completo).toBe(false)
  })

  it('se completa cuando el saldo también se cobra por la pasarela', () => {
    const a = avanceDelPago({ ...MITAD, saldo_amount: 90, saldo_verification: 'MATCHED' })
    expect(a.completo).toBe(true)
    expect(saldoDelPedido({ ...MITAD, saldo_amount: 90, saldo_verification: 'MATCHED' })).toBe(0)
  })

  // LA REGLA QUE PIDIÓ LA MARCA. El comercio puede cobrar por fuera —efectivo,
  // transferencia, un acuerdo por el chat— y mover el pedido a "Entregado". De
  // esa plata no tenemos rastro, así que el anillo NO se llena: decir que la
  // tenemos es la única mentira que este archivo no se puede permitir.
  it('entregar el pedido no lo cobra: cobrar lo cobra', () => {
    const entregado = { ...MITAD, stage: 'entregado' }
    expect(avanceDelPago(entregado).completo).toBe(false)
    expect(avanceDelPago(entregado).fraccion).toBeCloseTo(0.5)
  })

  it('un cupón de saldo emitido y sin pagar tampoco lo llena', () => {
    const a = avanceDelPago({ ...MITAD, saldo_amount: 90, saldo_verification: 'PENDING' })
    expect(a.completo).toBe(false)
    expect(a.fraccion).toBeCloseTo(0.5)
  })
})

// ─── El upsell mueve el anillo ───────────────────────────────────────────────
//
// Si al pedido se le agrega un producto —en el chat, o armándolo en logística—
// el total sube y lo ya cobrado deja de ser lo mismo en proporción. No hay nada
// que recalcular a mano: el servidor reescribe `product_price` con la suma del
// carrito y todo lo de acá se acomoda solo.

describe('un upsell cambia el total, y el anillo lo refleja', () => {
  const PAGADO_ENTERO = { product_price: 150, advance_amount: 150, payment_verification: 'MATCHED' }

  it('antes del upsell está pagado entero', () => {
    expect(avanceDelPago(PAGADO_ENTERO).completo).toBe(true)
    expect(cobrosDelPedido(PAGADO_ENTERO)[0].tipo).toBe('total')
    expect(saldoDelPedido(PAGADO_ENTERO)).toBe(0)
  })

  // S/150 sobre un pedido de S/230 ya no es el 100%. El anillo baja solo.
  it('agregar S/80 lo deja a dos tercios y abre un saldo', () => {
    const conUpsell = { ...PAGADO_ENTERO, product_price: 230 }
    expect(avanceDelPago(conUpsell).completo).toBe(false)
    expect(avanceDelPago(conUpsell).fraccion).toBeCloseTo(150 / 230)
    expect(saldoDelPedido(conUpsell)).toBe(80)
  })

  // Y deja de ser un "pago total": el pedido volvió a deber algo, así que la
  // tarjeta pasa a decir adelanto. Seguir llamándolo total sería decir que no
  // falta cobrar nada.
  it('el pago total pasa a ser un adelanto', () => {
    const conUpsell = { ...PAGADO_ENTERO, product_price: 230 }
    expect(cobrosDelPedido(conUpsell).map(c => c.tipo)).toEqual(['adelanto'])
    expect(cobrosDelPedido(conUpsell)[0].monto).toBe(150)
  })

  // Y el saldo se le puede cobrar solo, por el mismo botón del chat: es la
  // diferencia contra el total NUEVO.
  it('el botón de saldo aparece por la diferencia nueva', () => {
    const conUpsell = { ...PAGADO_ENTERO, product_price: 230, payment_provider: '360PAY' }
    expect(puedePagarSaldo({ ...PAGADO_ENTERO, payment_provider: '360PAY' })).toBe(false)
    expect(puedePagarSaldo(conUpsell)).toBe(true)
  })

  // Sobre un pedido a medias, el upsell aleja la meta: lo cobrado no cambia,
  // pero el anillo baja porque el total subió.
  it('sobre un adelanto, el anillo baja al subir el total', () => {
    const medio = { product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' }
    expect(avanceDelPago(medio).fraccion).toBeCloseTo(0.5)
    expect(avanceDelPago({ ...medio, product_price: 260 }).fraccion).toBeCloseTo(90 / 260)
    expect(saldoDelPedido({ ...medio, product_price: 260 })).toBe(170)
  })
})
