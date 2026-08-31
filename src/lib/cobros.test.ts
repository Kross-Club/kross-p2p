import { describe, it, expect } from 'vitest'
import { entro, vive, cobrosVivos, sePuedeBorrar, columnasDe } from '../../supabase/functions/_shared/cobros.ts'
import type { FilaDeCobro } from '../../supabase/functions/_shared/cobros.ts'

const fila = (p: Partial<FilaDeCobro>): FilaDeCobro =>
  ({ id: 'c1', tipo: 'extra', monto: 50, estado: 'PENDING', ...p })

describe('cuándo un cobro es plata', () => {
  it('solo cruzado por la pasarela', () => {
    expect(entro(fila({ estado: 'MATCHED' }))).toBe(true)
    expect(entro(fila({ estado: 'matched' }))).toBe(true)
    // Un cupón emitido NO es plata. Confundirlos es despachar sin haber cobrado.
    expect(entro(fila({ estado: 'PENDING' }))).toBe(false)
    expect(entro(fila({ estado: '' }))).toBe(false)
  })

  it('un anulado no está: ni cobrado ni pendiente', () => {
    expect(vive(fila({ estado: 'ANULADO' }))).toBe(false)
    expect(vive(fila({ estado: 'PENDING' }))).toBe(true)
  })
})

describe('el orden de los cobros', () => {
  // No es estético: el banco cobra SIEMPRE el cupón pendiente más antiguo, así
  // que la lista tiene que leerse en el orden en que se va a cobrar.
  it('adelanto, saldo, y los extra al final por fecha', () => {
    const lista = cobrosVivos([
      fila({ id: 'x2', tipo: 'extra', created_at: '2026-08-31' }),
      fila({ id: 's', tipo: 'saldo' }),
      fila({ id: 'x1', tipo: 'extra', created_at: '2026-08-30' }),
      fila({ id: 'a', tipo: 'adelanto' }),
    ])
    expect(lista.map(c => c.id)).toEqual(['a', 's', 'x1', 'x2'])
  })

  // Dejarlos obligaría a cada pantalla a acordarse de filtrarlos, y la que se
  // olvide contará plata que no existe.
  it('los anulados no salen', () => {
    expect(cobrosVivos([fila({ id: 'z', estado: 'ANULADO' })])).toEqual([])
    expect(cobrosVivos(null)).toEqual([])
  })
})

describe('qué cobro se puede borrar', () => {
  it('solo los que hizo una persona, y solo sin pagar', () => {
    expect(sePuedeBorrar(fila({ tipo: 'extra', estado: 'PENDING' }))).toBe(true)
    // Plata con rastro bancario. Lo que corresponde es un reembolso, que es
    // otra cosa y no vive en este panel.
    expect(sePuedeBorrar(fila({ tipo: 'extra', estado: 'MATCHED' }))).toBe(false)
  })

  // No son del vendedor: el adelanto lo genera el checkout y el saldo la guía.
  // Borrarlos dejaría un pedido diciendo que no debe nada sobre plata cobrada.
  it('el adelanto y el saldo no se borran nunca', () => {
    expect(sePuedeBorrar(fila({ tipo: 'adelanto', estado: 'PENDING' }))).toBe(false)
    expect(sePuedeBorrar(fila({ tipo: 'saldo', estado: 'PENDING' }))).toBe(false)
  })
})

// ─── El espejo con las columnas viejas ───────────────────────────────────────
//
// Mientras dura la mudanza se escribe en los dos sitios. Que la traducción viva
// en UNA función es lo que impide que la tabla y las columnas se separen por un
// descuido en cualquiera de los veinte archivos que las tocan.

describe('las columnas equivalentes a un cobro', () => {
  it('el adelanto va a sus columnas', () => {
    expect(columnasDe('adelanto', { monto: 90, estado: 'MATCHED' }))
      .toEqual({ advance_amount: 90, payment_verification: 'MATCHED' })
  })

  it('y el saldo a las suyas, que son otras', () => {
    expect(columnasDe('saldo', { monto: 90, estado: 'PENDING', coupon_expires_at: '2026-09-30' }))
      .toEqual({ saldo_amount: 90, saldo_verification: 'PENDING', pay360_saldo_coupon_expires_at: '2026-09-30' })
  })

  // Ahí está la razón de la mudanza entera: el tercer cobro no cabía en las
  // columnas. Se guarda SOLO en la tabla.
  it('un `extra` no tiene columna que espejar', () => {
    expect(columnasDe('extra', { monto: 20, estado: 'PENDING' })).toEqual({})
  })

  // Lo que no se pasa no se pisa: un update parcial no puede borrar el cupón
  // por no haberlo mencionado.
  it('solo escribe lo que se le da', () => {
    expect(columnasDe('adelanto', { estado: 'MATCHED' })).toEqual({ payment_verification: 'MATCHED' })
  })
})
