// ─── Paridad del adelanto: front y servidor, una sola aritmética ─────────────
// `advanceFor()` (checkout.config.ts) enseña el monto; `advanceForServer()`
// (`_shared/advance.ts`) lo cobra. Si se desalinean, el comprador ve un número
// y paga otro — el peor error posible del checkout. Este archivo es el que el
// comentario de `_shared/advance.ts` promete.
//
// Y las reglas por producto de §56 (`eleccionDeAdelanto`, `ofertaDelProducto`,
// `saneaProducto`), que también comparten las dos puntas.
//
// Y desde set-2026, la escalera por pack de Kross Form (`docs/18-KROSS-FORM.md`
// §5), que es otro par front/servidor con el mismo riesgo y la misma cura.

import { describe, expect, it } from 'vitest'
import { ADVANCE_HALF_SHARE, advanceFor } from './checkout.config'
import {
  ADVANCE_HALF_SHARE as SERVER_HALF_SHARE,
  DESCUENTO_MAXIMO_PEN,
  adelantoDelPedido,
  adelantoEsperadoDeLaFila,
  adelantoFromPacks,
  adelantoSaneado,
  advanceForServer,
  saneaPacks,
  esContraentregaPorDestino,
  descuentoSaneado,
  eleccionDeAdelanto,
  ofertaDelProducto,
  priceFromPacks,
  saneaProducto,
} from '../../../supabase/functions/_shared/advance.ts'
import {
  adelantoDelPedido as adelantoDelPedidoFront,
  adelantoFromPacks as adelantoFromPacksFront,
  adelantoSaneado as adelantoSaneadoFront,
  esContraentregaPorDestino as esContraentregaPorDestinoFront,
} from './adelanto-pack'

describe('paridad front ↔ servidor', () => {
  it('la proporción de la mitad es la misma constante', () => {
    expect(ADVANCE_HALF_SHARE).toBe(SERVER_HALF_SHARE)
  })

  it('el monto es idéntico para todo precio y elección', () => {
    for (const precio of [1, 5, 69.5, 70.5, 140, 189, 300, 999.99]) {
      for (const eleccion of ['HALF', 'FULL'] as const) {
        expect(advanceForServer(precio, eleccion)).toBe(advanceFor(precio, eleccion))
      }
    }
  })

  it('el default del front es el TOTAL (§56)', () => {
    expect(advanceFor(140)).toBe(140)
    expect(advanceFor(140)).toBe(advanceFor(140, 'FULL'))
  })

  it('sin precio no hay adelanto, en las dos puntas', () => {
    for (const p of [0, -5, NaN, Infinity]) {
      expect(advanceFor(p, 'FULL')).toBe(0)
      expect(advanceForServer(p, 'FULL')).toBe(0)
    }
  })
})

describe('eleccionDeAdelanto · la mitad la permite el producto', () => {
  it('HALF con permiso → HALF', () => {
    expect(eleccionDeAdelanto('HALF', true)).toBe('HALF')
  })
  it('HALF sin permiso → FULL (dirección segura, no bloquea la venta)', () => {
    expect(eleccionDeAdelanto('HALF', false)).toBe('FULL')
  })
  it('FULL siempre es FULL', () => {
    expect(eleccionDeAdelanto('FULL', true)).toBe('FULL')
    expect(eleccionDeAdelanto('FULL', false)).toBe('FULL')
  })
  it('basura cae en FULL', () => {
    for (const v of [undefined, null, '', 'half', 'MITAD', 0, {}, true]) {
      expect(eleccionDeAdelanto(v, true)).toBe('FULL')
    }
  })
})

describe('ofertaDelProducto · cuánto descuenta la oferta de salida', () => {
  it('solo descuenta cuando el comprador aceptó la oferta', () => {
    expect(ofertaDelProducto(5, true)).toBe(5)
    expect(ofertaDelProducto(5, false)).toBe(0)
  })
  it('un producto sin oferta no descuenta aunque la acepte', () => {
    expect(ofertaDelProducto(0, true)).toBe(0)
    expect(ofertaDelProducto(null, true)).toBe(0)
    expect(ofertaDelProducto(undefined, true)).toBe(0)
  })
  it('acepta lo que Postgres devuelve (numeric como string)', () => {
    expect(ofertaDelProducto('5', true)).toBe(5)
    expect(ofertaDelProducto('7.50', true)).toBe(7.5)
  })
})

describe('saneaProducto · lo que guarda el panel', () => {
  it('permite_mitad solo con un true de verdad', () => {
    expect(saneaProducto({ permite_mitad: true }).permite_mitad).toBe(true)
    expect(saneaProducto({ permite_mitad: 'true' }).permite_mitad).toBe(false)
    expect(saneaProducto({ permite_mitad: 1 }).permite_mitad).toBe(false)
  })
  it('el descuento es finito, entre 0 y el tope, con dos decimales', () => {
    expect(descuentoSaneado(5)).toBe(5)
    expect(descuentoSaneado('5')).toBe(5)
    expect(descuentoSaneado(7.499)).toBe(7.5)
    expect(descuentoSaneado(-3)).toBe(0)
    expect(descuentoSaneado(NaN)).toBe(0)
    expect(descuentoSaneado('abc')).toBe(0)
    expect(descuentoSaneado(DESCUENTO_MAXIMO_PEN + 1000)).toBe(DESCUENTO_MAXIMO_PEN)
  })
  it('solo devuelve las claves que el body trae: un panel viejo no borra nada', () => {
    expect(saneaProducto({})).toEqual({})
    expect(saneaProducto({ descuento_pen: '5' })).toEqual({ descuento_pen: 5 })
    expect(saneaProducto({ permite_mitad: true, descuento_pen: 0 })).toEqual({ permite_mitad: true, descuento_pen: 0 })
  })
})

// ─── KROSS FORM · la escalera por pack ───────────────────────────────────────

const LIMA = ['MOTORIZADO_LIMA', 'AGENCIA_LIMA'] as const
const PROVINCIA = ['MOTORIZADO_PROVINCIA', 'AGENCIA_PROVINCIA'] as const

describe('esContraentregaPorDestino · Lima y Callao no adelantan', () => {
  it('los dos destinos de Lima van contraentrega', () => {
    for (const d of LIMA) {
      expect(esContraentregaPorDestino(d)).toBe(true)
      expect(esContraentregaPorDestinoFront(d)).toBe(true)
    }
  })
  it('los dos de provincia sí adelantan', () => {
    for (const d of PROVINCIA) {
      expect(esContraentregaPorDestino(d)).toBe(false)
      expect(esContraentregaPorDestinoFront(d)).toBe(false)
    }
  })
  it('un destino que no es de los cuatro cae en contraentrega (dirección segura)', () => {
    for (const d of [undefined, null, '', 'LIMA', 'PROVINCIA', 'MOTORIZADO_LIMA ', 0, {}]) {
      expect(esContraentregaPorDestino(d)).toBe(true)
      expect(esContraentregaPorDestinoFront(d)).toBe(true)
    }
  })
})

describe('adelantoSaneado · el monto que escribió el comerciante', () => {
  it('redondea al sol, como el resto del adelanto', () => {
    for (const [dado, esperado] of [[20, 20], ['20', 20], [20.4, 20], [20.5, 21], ['7.50', 8]] as const) {
      expect(adelantoSaneado(dado)).toBe(esperado)
      expect(adelantoSaneadoFront(dado)).toBe(esperado)
    }
  })
  it('cualquier basura es 0, y 0 significa que este pack no adelanta', () => {
    for (const v of [0, -5, NaN, Infinity, 'abc', '', null, undefined, {}]) {
      expect(adelantoSaneado(v)).toBe(0)
      expect(adelantoSaneadoFront(v)).toBe(0)
    }
  })
})

describe('adelantoFromPacks · el monto sale del producto, nunca del navegador', () => {
  const packs = [
    { nombre: '1 unidad', precio: 59, adelanto_pen: 15 },
    { nombre: '2 unidades', precio: 89, adelanto_pen: '20' },  // numeric de Postgres
    { nombre: '3 unidades', precio: 119 },                      // sin adelanto configurado
  ]

  it('empareja por nombre, como priceFromPacks', () => {
    expect(adelantoFromPacks(packs, '2 unidades')).toBe(20)
    expect(adelantoFromPacksFront(packs, '2 unidades')).toBe(20)
  })
  it('un pack sin adelanto configurado no adelanta', () => {
    expect(adelantoFromPacks(packs, '3 unidades')).toBe(0)
    expect(adelantoFromPacksFront(packs, '3 unidades')).toBe(0)
  })
  it('sin nombre, o con un nombre que no existe, no hay pack que mirar', () => {
    for (const n of [null, '', 'inventado']) {
      expect(adelantoFromPacks(packs, n)).toBe(0)
      expect(adelantoFromPacksFront(packs, n)).toBe(0)
    }
  })
  it('packs que no son una lista no rompen', () => {
    for (const p of [null, undefined, {}, 'packs', 5]) {
      expect(adelantoFromPacks(p, '1 unidad')).toBe(0)
      expect(adelantoFromPacksFront(p, '1 unidad')).toBe(0)
    }
  })
})

describe('adelantoDelPedido · la escalera, peldaño por peldaño', () => {
  const base = { precioPack: 89, adelantoPen: 20, dispatchType: 'AGENCIA_PROVINCIA' as unknown }

  it('1 · Lima gana sobre TODO lo que diga el producto', () => {
    for (const d of LIMA) {
      const e = { ...base, dispatchType: d, adelantoPen: 50, cobraCompleto: true, permiteMitad: true }
      expect(adelantoDelPedido(e)).toBe(0)
      expect(adelantoDelPedidoFront(e)).toBe(0)
    }
  })
  it('2 · cobra_completo gana sobre el adelanto del pack', () => {
    const e = { ...base, cobraCompleto: true, permiteMitad: true }
    expect(adelantoDelPedido(e)).toBe(89)
    expect(adelantoDelPedidoFront(e)).toBe(89)
  })
  it('3 · el adelanto del pack gana sobre permite_mitad', () => {
    const e = { ...base, permiteMitad: true }
    expect(adelantoDelPedido(e)).toBe(20)
    expect(adelantoDelPedidoFront(e)).toBe(20)
  })
  it('3 · un adelanto mayor que el pack cobra el pack, nunca más', () => {
    const e = { ...base, adelantoPen: 500 }
    expect(adelantoDelPedido(e)).toBe(89)
    expect(adelantoDelPedidoFront(e)).toBe(89)
  })
  it('4 · sin adelanto por pack, permite_mitad cobra la mitad', () => {
    const e = { ...base, adelantoPen: 0, permiteMitad: true }
    expect(adelantoDelPedido(e)).toBe(advanceForServer(89, 'HALF'))
    expect(adelantoDelPedidoFront(e)).toBe(advanceFor(89, 'HALF'))
  })
  it('5 · sin nada encendido, no adelanta: provincia también puede ir contraentrega', () => {
    const e = { ...base, adelantoPen: 0 }
    expect(adelantoDelPedido(e)).toBe(0)
    expect(adelantoDelPedidoFront(e)).toBe(0)
  })
  it('sin precio verificado no hay adelanto', () => {
    for (const p of [0, -5, NaN, Infinity]) {
      const e = { ...base, precioPack: p }
      expect(adelantoDelPedido(e)).toBe(0)
      expect(adelantoDelPedidoFront(e)).toBe(0)
    }
  })
  it('los toggles solo cuentan con un true de verdad', () => {
    for (const v of ['true', 1, {}, 'sí'] as unknown[]) {
      const e = { ...base, adelantoPen: 0, cobraCompleto: v as boolean, permiteMitad: v as boolean }
      expect(adelantoDelPedido(e)).toBe(0)
      expect(adelantoDelPedidoFront(e)).toBe(0)
    }
  })
})

describe('paridad de la escalera · front y servidor, valor por valor', () => {
  it('coinciden en toda la matriz', () => {
    const destinos = [...LIMA, ...PROVINCIA, 'BASURA', '', null, undefined]
    for (const precioPack of [1, 59, 69.5, 89, 119, 300, 999.99]) {
      for (const adelantoPen of [0, 1, 15, 20.5, 89, 500, -3, NaN]) {
        for (const dispatchType of destinos) {
          for (const cobraCompleto of [true, false]) {
            for (const permiteMitad of [true, false]) {
              const e = { precioPack, adelantoPen, dispatchType, cobraCompleto, permiteMitad }
              expect(adelantoDelPedidoFront(e)).toBe(adelantoDelPedido(e))
            }
          }
        }
      }
    }
  })

  it('el adelanto nunca supera el pedido, en ninguna combinación', () => {
    for (const precioPack of [1, 59, 89, 300]) {
      for (const adelantoPen of [0, 20, 500]) {
        for (const dispatchType of [...LIMA, ...PROVINCIA]) {
          for (const cobraCompleto of [true, false]) {
            for (const permiteMitad of [true, false]) {
              const monto = adelantoDelPedido({ precioPack, adelantoPen, dispatchType, cobraCompleto, permiteMitad })
              expect(monto).toBeGreaterThanOrEqual(0)
              expect(monto).toBeLessThanOrEqual(Math.round(precioPack))
            }
          }
        }
      }
    }
  })
})

describe('krossform.com no toca krossclub.app', () => {
  it('la escalera del embed no altera el adelanto de la PWA', () => {
    // La PWA llama `advanceForServer`/`advanceFor` y nada más. Si alguien mete
    // la escalera del embed dentro de ellas, esto se cae.
    for (const precio of [1, 5, 69.5, 89, 140, 300]) {
      expect(advanceForServer(precio, 'FULL')).toBe(Math.round(precio))
      expect(advanceForServer(precio, 'HALF')).toBe(Math.round(precio * 0.5))
      expect(advanceFor(precio, 'FULL')).toBe(Math.round(precio))
      expect(advanceFor(precio, 'HALF')).toBe(Math.round(precio * 0.5))
    }
  })

  it('un producto sin nada de Kross Form se comporta como siempre', () => {
    // packs de la PWA: sin `adelanto_pen` por ningún lado.
    const packsPWA = [{ nombre: '1 unidad', precio: 140 }, { nombre: '2 unidades', precio: 240 }]
    expect(adelantoFromPacks(packsPWA, '1 unidad')).toBe(0)
    expect(priceFromPacks(packsPWA, 140, '1 unidad')).toBe(140)
  })
})

describe('saneaPacks · lo que el panel guarda en cada pack', () => {
  it('un pack de krossclub.app sale TAL CUAL: misma referencia, no una copia', () => {
    // La prueba fuerte de §10: si algún día alguien normaliza el pack entero,
    // esto se cae aunque el contenido siga siendo equivalente.
    const pack = { nombre: '2 unidades', descripcion: 'Envío gratis', precio: 89, image: 'x.jpg' }
    const salida = saneaPacks([pack])
    expect(salida[0]).toBe(pack)
  })

  it('normaliza adelanto_pen solo en los packs que lo traen', () => {
    const packs = [
      { nombre: 'a', precio: 59, adelanto_pen: '20' },
      { nombre: 'b', precio: 89 },
      { nombre: 'c', precio: 119, adelanto_pen: -5 },
      { nombre: 'd', precio: 149, adelanto_pen: 20.5 },
    ]
    expect(saneaPacks(packs)).toEqual([
      { nombre: 'a', precio: 59, adelanto_pen: 20 },
      { nombre: 'b', precio: 89 },
      { nombre: 'c', precio: 119, adelanto_pen: 0 },
      { nombre: 'd', precio: 149, adelanto_pen: 21 },
    ])
  })

  it('el 0 se conserva: es una respuesta, no la ausencia de una', () => {
    const [p] = saneaPacks([{ nombre: 'a', precio: 59, adelanto_pen: 0 }]) as { adelanto_pen?: number }[]
    expect(p.adelanto_pen).toBe(0)
    expect('adelanto_pen' in p).toBe(true)
  })

  it('no pierde ningún otro campo del pack', () => {
    const [p] = saneaPacks([
      { nombre: 'a', descripcion: 'd', precio: 59, image: 'i.jpg', adelanto_pen: 'basura' },
    ]) as Record<string, unknown>[]
    expect(p).toEqual({ nombre: 'a', descripcion: 'd', precio: 59, image: 'i.jpg', adelanto_pen: 0 })
  })

  it('lo que no es una lista de packs es una lista vacía', () => {
    for (const v of [null, undefined, {}, 'packs', 5]) expect(saneaPacks(v)).toEqual([])
  })

  it('una entrada que no es un objeto pasa sin tocarse', () => {
    expect(saneaPacks([null, 'x', 5])).toEqual([null, 'x', 5])
  })
})

describe('saneaProducto · cobra_completo, el tercer interruptor', () => {
  it('solo con un true de verdad', () => {
    expect(saneaProducto({ cobra_completo: true }).cobra_completo).toBe(true)
    expect(saneaProducto({ cobra_completo: 'true' }).cobra_completo).toBe(false)
    expect(saneaProducto({ cobra_completo: 1 }).cobra_completo).toBe(false)
  })

  it('un panel que no lo manda no toca la columna', () => {
    // El panel de una marca sin Kross Form no incluye la clave, así que un
    // guardado suyo no puede apagar lo que otro encendió.
    expect('cobra_completo' in saneaProducto({ permite_mitad: true })).toBe(false)
    expect(saneaProducto({ permite_mitad: true })).toEqual({ permite_mitad: true })
  })

  it('convive con los dos de §56 sin pisarlos', () => {
    expect(saneaProducto({ permite_mitad: true, descuento_pen: '5', cobra_completo: true }))
      .toEqual({ permite_mitad: true, descuento_pen: 5, cobra_completo: true })
  })
})

describe('adelantoEsperadoDeLaFila · la re-derivación al cobrar', () => {
  const producto = {
    packs: [{ nombre: '2 unidades', precio: 89, adelanto_pen: 20 }],
    permite_mitad: false, cobra_completo: false,
  }

  it('sin embed_key devuelve EXACTAMENTE la línea vieja de flow-order', () => {
    // El invariante que protege a krossclub.app: mientras no haya llave, esta
    // función tiene que ser indistinguible de `advanceForServer(precio, choice)`.
    for (const precio of [1, 5, 69.5, 89, 140, 300, 999.99]) {
      for (const advance_choice of ['HALF', 'FULL', null, undefined, 'basura']) {
        const fila = { advance_choice, pack_name: '2 unidades', dispatch_type: 'AGENCIA_PROVINCIA' }
        expect(adelantoEsperadoDeLaFila(fila, precio, producto))
          .toBe(advanceForServer(precio, String(advance_choice ?? 'HALF')))
      }
    }
  })

  it('una embed_key vacía o no-texto sigue siendo un pedido de la PWA', () => {
    for (const embed_key of ['', '   ', null, undefined, 0, {}]) {
      expect(adelantoEsperadoDeLaFila({ embed_key, advance_choice: 'FULL' }, 89, producto)).toBe(89)
    }
  })

  it('con llave usa la escalera del pack, no la proporción', () => {
    const fila = { embed_key: 'pub_1', advance_choice: 'FULL', pack_name: '2 unidades', dispatch_type: 'AGENCIA_PROVINCIA' }
    // Ésta es la regresión que se arregló: la línea vieja daba 89 y flow-order
    // cortaba el cobro con amount_mismatch.
    expect(advanceForServer(89, 'FULL')).toBe(89)
    expect(adelantoEsperadoDeLaFila(fila, 89, producto)).toBe(20)
  })

  it('con llave y destino Lima, no hay adelanto que cobrar', () => {
    const fila = { embed_key: 'pub_1', pack_name: '2 unidades', dispatch_type: 'MOTORIZADO_LIMA' }
    expect(adelantoEsperadoDeLaFila(fila, 89, producto)).toBe(0)
  })

  it('con llave y sin el producto devuelve 0: no se emite lo que no se puede justificar', () => {
    const fila = { embed_key: 'pub_1', pack_name: '2 unidades', dispatch_type: 'AGENCIA_PROVINCIA' }
    expect(adelantoEsperadoDeLaFila(fila, 89, null)).toBe(0)
  })

  it('con llave, el producto manda sobre lo que diga la fila', () => {
    // La fila puede haber sido tocada; el producto es la fuente.
    const fila = { embed_key: 'pub_1', advance_choice: 'HALF', pack_name: '2 unidades', dispatch_type: 'AGENCIA_PROVINCIA' }
    expect(adelantoEsperadoDeLaFila(fila, 89, { ...producto, cobra_completo: true })).toBe(89)
    expect(adelantoEsperadoDeLaFila(fila, 89, producto)).toBe(20)
  })
})
