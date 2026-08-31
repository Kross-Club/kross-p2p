import { describe, it, expect } from 'vitest'
import { nombreDelCobro, lineasDelComprobante, enlaceDeComprobante } from './comprobante'
import type { DatosDeComprobante } from '../../supabase/functions/_shared/comprobante.ts'
import { tieneComprobante } from '../../supabase/functions/_shared/comprobante.ts'

const base: DatosDeComprobante = {
  cobro_id: 'c1', pedido: 'ORD-17563450000000', tienda: 'Kross Shop', logo: null,
  comprador: 'Ana Quispe', tipo: 'adelanto', concepto: null, monto: 75,
  cobrado_en: '2026-08-30T15:04:00.000Z',
  payment_code: 'KSH34750200669', operation_number: '00912345', bank: 'BCP',
  total: 150, pagado: 75, saldo: 75,
}

// ─── Cómo se llama lo que se pagó ────────────────────────────────────────────

describe('nombreDelCobro', () => {
  it('un adelanto que no cubre el precio es un adelanto', () => {
    expect(nombreDelCobro({ tipo: 'adelanto', monto: 75, total: 150 })).toBe('Adelanto del pedido')
  })

  // "Pagó todo" NO está guardado: es un adelanto que cubre el precio entero, y
  // eso se decide contra el valor de hoy. Misma regla que `order-money.ts`.
  it('el mismo adelanto, si cubre el precio entero, es pago completo', () => {
    expect(nombreDelCobro({ tipo: 'adelanto', monto: 150, total: 150 })).toBe('Pago completo del pedido')
  })

  // Y por eso un upsell lo devuelve a adelanto sin que nadie reescriba nada: el
  // pedido pasó a costar más, así que esos S/150 dejaron de ser el total.
  it('un upsell lo vuelve a convertir en adelanto', () => {
    expect(nombreDelCobro({ tipo: 'adelanto', monto: 150, total: 230 })).toBe('Adelanto del pedido')
  })

  it('el saldo se llama saldo', () => {
    expect(nombreDelCobro({ tipo: 'saldo', monto: 75, total: 150 })).toBe('Saldo del pedido')
  })

  // Para el comprador, "Cobro adicional" no es información: lo que necesita ver
  // es lo que le dijeron cuando le cobraron.
  it('un extra se llama por su concepto', () => {
    expect(nombreDelCobro({ tipo: 'extra', concepto: 'Flete a Piura', monto: 20, total: 150 }))
      .toBe('Flete a Piura')
  })

  it('un extra sin concepto no se queda sin nombre', () => {
    expect(nombreDelCobro({ tipo: 'extra', concepto: '  ', monto: 20, total: 150 }))
      .toBe('Cobro adicional')
  })
})

// ─── Las líneas de la hoja ───────────────────────────────────────────────────
//
// Salen de `datosDeRastro`, la MISMA lista que el panel pinta y que el botón de
// "copiar para soporte" arma. Es lo que hace que el comprador y el vendedor
// estén mirando los mismos campos con los mismos nombres cuando discuten un
// cobro.

describe('lineasDelComprobante', () => {
  it('lleva pedido, cliente, código de pago, operación y fecha', () => {
    expect(lineasDelComprobante(base).map(l => l.etiqueta))
      .toEqual(['Pedido', 'Cliente', 'Código de pago', 'Op. bancaria', 'Cobrado'])
  })

  // Operación y banco son UN dato: el número sin el banco no se busca en ningún
  // lado, y el banco sin el número tampoco.
  it('la operación va junto con el banco', () => {
    const op = lineasDelComprobante(base).find(l => l.etiqueta === 'Op. bancaria')
    expect(op?.valor).toBe('00912345 · BCP')
  })

  // Un campo vacío no se pinta: media línea diciendo "Op. bancaria —" hace dudar
  // de si falta el dato o falló la página.
  it('lo que no existe no se pinta', () => {
    const sinRastro = { ...base, operation_number: null, bank: null, comprador: null }
    expect(lineasDelComprobante(sinRastro).map(l => l.etiqueta))
      .toEqual(['Pedido', 'Código de pago', 'Cobrado'])
  })
})

describe('el enlace', () => {
  // Relativo: en `marca.krossclub.app` la constancia sale con esa marca sin que
  // el webhook —que no tiene navegador— tenga que saber desde qué host se lee.
  it('es relativo, y escapa el id', () => {
    expect(enlaceDeComprobante('c1')).toBe('/comprobante/c1')
    expect(enlaceDeComprobante('a/b')).toBe('/comprobante/a%2Fb')
  })
})

// ─── Solo el que entró tiene comprobante ─────────────────────────────────────

describe('tieneComprobante', () => {
  it('solo un cobro cruzado', () => {
    expect(tieneComprobante({ estado: 'MATCHED' })).toBe(true)
    expect(tieneComprobante({ estado: 'matched' })).toBe(true)
  })

  // Una constancia de un cobro pendiente sería un papel que dice que se pagó
  // algo que no se pagó — y el comprador la enseñaría de buena fe.
  it('ni pendiente, ni anulado, ni vacío', () => {
    expect(tieneComprobante({ estado: 'PENDING' })).toBe(false)
    expect(tieneComprobante({ estado: 'ANULADO' })).toBe(false)
    expect(tieneComprobante({})).toBe(false)
  })
})
