import { describe, it, expect } from 'vitest'
import { valorDelPedido, cobradoDelPedido, saldoDelPedido, plataDe, soles, avanceDelPago, cobrosDelPedido, puedePagarSaldo } from './order-money'
import { sePuedeBorrar } from '../../supabase/functions/_shared/cobros.ts'

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
    // `toMatchObject` y no `toEqual`: al `Cobro` le van creciendo campos —id,
    // vencimiento, concepto— y una comparación exacta convierte cada campo
    // nuevo en una prueba rota que no descubrió nada.
    expect(c).toMatchObject([{ tipo: 'adelanto', monto: 90, verificado: true }])
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
    expect(c[1]).toMatchObject({ tipo: 'saldo', monto: 90, verificado: false })
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

// ─── Las dos formas de leer lo mismo (bloque §36) ────────────────────────────
//
// Un pedido tenía DOS cobros y vivían como columnas; ahora son N filas. Durante
// la mudanza `cobrosDelPedido` acepta las dos entradas, y esta prueba es la que
// impide que se conviertan en dos definiciones distintas: los mismos datos por
// los dos caminos tienen que dar el mismo resultado. El día que ninguna fila
// venga sin lista, sobra la mitad de la función — y esta prueba lo dirá.

describe('la lista de cobros dice lo mismo que las columnas', () => {
  const casos = [
    { nombre: 'medio adelanto sin saldo', valor: 180, adelanto: 90, adelantoOk: true, saldo: 0, saldoOk: false },
    { nombre: 'pago total', valor: 180, adelanto: 180, adelantoOk: true, saldo: 0, saldoOk: false },
    { nombre: 'adelanto y saldo cobrados', valor: 180, adelanto: 90, adelantoOk: true, saldo: 90, saldoOk: true },
    { nombre: 'saldo emitido sin pagar', valor: 180, adelanto: 90, adelantoOk: true, saldo: 90, saldoOk: false },
    { nombre: 'nada cobrado', valor: 180, adelanto: 90, adelantoOk: false, saldo: 0, saldoOk: false },
  ]

  for (const c of casos) {
    it(c.nombre, () => {
      const porColumnas = {
        product_price: c.valor,
        advance_amount: c.adelanto || null,
        payment_verification: c.adelantoOk ? 'MATCHED' : 'PENDING',
        saldo_amount: c.saldo || null,
        saldo_verification: c.saldo ? (c.saldoOk ? 'MATCHED' : 'PENDING') : null,
      }
      const porLista = {
        product_price: c.valor,
        cobros: [
          ...(c.adelanto ? [{ id: 'a', tipo: 'adelanto' as const, monto: c.adelanto, estado: c.adelantoOk ? 'MATCHED' : 'PENDING' }] : []),
          ...(c.saldo ? [{ id: 's', tipo: 'saldo' as const, monto: c.saldo, estado: c.saldoOk ? 'MATCHED' : 'PENDING' }] : []),
        ],
      }
      const quita = (x: ReturnType<typeof cobrosDelPedido>) =>
        x.map(({ tipo, monto, verificado }) => ({ tipo, monto, verificado }))

      expect(quita(cobrosDelPedido(porLista))).toEqual(quita(cobrosDelPedido(porColumnas)))
      expect(cobradoDelPedido(porLista)).toBe(cobradoDelPedido(porColumnas))
      expect(saldoDelPedido(porLista)).toBe(saldoDelPedido(porColumnas))
      expect(avanceDelPago(porLista).fraccion).toBeCloseTo(avanceDelPago(porColumnas).fraccion)
    })
  }
})

// ─── Lo que solo puede el modelo nuevo ───────────────────────────────────────

describe('los cobros extra', () => {
  const conFlete = {
    product_price: 150,
    cobros: [
      { id: 'a', tipo: 'adelanto' as const, monto: 150, estado: 'MATCHED' },
      { id: 'x', tipo: 'extra' as const, monto: 20, estado: 'MATCHED', concepto: 'Flete a Piura' },
    ],
  }

  it('un tercer cobro existe, cosa que con dos columnas no podía', () => {
    expect(cobrosDelPedido(conFlete).map(c => c.tipo)).toEqual(['total', 'extra'])
    expect(cobrosDelPedido(conFlete)[1].concepto).toBe('Flete a Piura')
  })

  // El tope contra el precio es solo del primero: un `extra` es plata ADEMÁS del
  // valor del pedido —un flete no abarata el producto—, así que recortarlo
  // contra el precio sería perderlo.
  it('no se recorta contra el precio del pedido', () => {
    expect(cobrosDelPedido(conFlete)[1].monto).toBe(20)
  })

  // Y no cierra ni abre el pedido: el anillo mide el PRECIO cobrado.
  it('no infla el anillo por encima del pedido', () => {
    expect(avanceDelPago(conFlete).fraccion).toBe(1)
    expect(cobradoDelPedido(conFlete)).toBe(150)
  })

  // Un anulado no está: ni cobrado ni pendiente.
  it('un cobro anulado desaparece', () => {
    const anulado = { ...conFlete, cobros: [{ id: 'x', tipo: 'extra' as const, monto: 20, estado: 'ANULADO' }] }
    expect(cobrosDelPedido(anulado)).toEqual([])
  })

  // El cobro se lleva su fila para que el panel pregunte la REGLA en vez de
  // volver a escribirla. Sin esto, "solo se borran los extra sin pagar" viviría
  // en dos sitios —el modelo y el botón— y sería cuestión de tiempo que uno de
  // los dos se quedara viejo.
  it('carga su fila, para poder preguntarle al modelo si se puede dar de baja', () => {
    const pendiente = {
      product_price: 150,
      cobros: [
        { id: 'a', tipo: 'adelanto' as const, monto: 150, estado: 'MATCHED' },
        { id: 'x', tipo: 'extra' as const, monto: 20, estado: 'PENDING', concepto: 'Flete' },
      ],
    }
    const [adelanto, flete] = cobrosDelPedido(pendiente)
    expect(sePuedeBorrar(flete.fila!)).toBe(true)
    expect(sePuedeBorrar(adelanto.fila!)).toBe(false)
    // Y uno que ya entró tampoco: eso se reembolsa, no se borra de una lista.
    expect(sePuedeBorrar(cobrosDelPedido(conFlete)[1].fila!)).toBe(false)
  })

  // Los pedidos que todavía se leen de las columnas no traen fila, y por eso no
  // ofrecen dar de baja: un cobro sin identidad no es una cosa que se pueda
  // señalar.
  it('lo derivado de columnas no trae fila', () => {
    const viejo = { product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' }
    expect(cobrosDelPedido(viejo)[0].fila).toBeUndefined()
  })
})

// ─── Vacío no es cero ────────────────────────────────────────────────────────
//
// El filo más peligroso de la mudanza, y se veía solo mirando el código con la
// migración ya viva: una lista VACÍA es truthy. Sin esta distinción, un pedido
// con plata en las columnas y sin fila en `cobros` —una que no alcanzó a
// escribirse, un pedido creado entre el SQL y el deploy— se vería SIN COBRAR.

describe('una lista vacía no significa "no cobró nada"', () => {
  const conPlata = { product_price: 180, advance_amount: 90, payment_verification: 'MATCHED' }

  it('sin filas se lee de las columnas', () => {
    expect(cobradoDelPedido({ ...conPlata, cobros: [] })).toBe(90)
    expect(cobradoDelPedido({ ...conPlata, cobros: null })).toBe(90)
    expect(cobrosDelPedido({ ...conPlata, cobros: [] })).toHaveLength(1)
  })

  // Y con filas manda la lista, incluso si dice menos que las columnas: es el
  // modelo nuevo, y para eso se migró.
  it('con filas manda la lista', () => {
    const p = { ...conPlata, cobros: [{ id: 'a', tipo: 'adelanto' as const, monto: 45, estado: 'MATCHED' }] }
    expect(cobradoDelPedido(p)).toBe(45)
  })

  // Todo anulado sí es cero cobros — pero por la lista, no por estar vacía.
  it('una lista de puros anulados es cero, y eso sí lo decide la lista', () => {
    const p = { ...conPlata, cobros: [{ id: 'a', tipo: 'adelanto' as const, monto: 90, estado: 'ANULADO' }] }
    expect(cobradoDelPedido(p)).toBe(0)
  })
})
