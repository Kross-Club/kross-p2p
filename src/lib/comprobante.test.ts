import { describe, it, expect } from 'vitest'
import { nombreDelCobro, lineasDelComprobante, enlaceDeComprobante, cobroDelAviso } from './comprobante'
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


// ─── El aviso viejo también abre su comprobante ──────────────────────────────
//
// Los pedidos que pagaron antes del puntero (`cobro_id`) ya tenían su aviso en
// el hilo. Se reconoce por su propia copy —la del webhook y la del generador del
// demo— y se ata al cobro pagado, para que un hilo de hace un mes enseñe el
// mismo botón que uno de hoy sin reescribir su conversación.

describe('cobroDelAviso', () => {
  const cobros = [
    { id: 'a', tipo: 'total', verificado: true, monto: 150, concepto: null },
    { id: 's', tipo: 'saldo', verificado: true, monto: 75, concepto: null },
    { id: 'x1', tipo: 'extra', verificado: true, monto: 20, concepto: 'Flete a Piura' },
    { id: 'x2', tipo: 'extra', verificado: true, monto: 11, concepto: 'Hey' },
  ]
  const aviso = (body: string) => ({ type: 'status_update', body })

  it('la copy del webhook: adelanto, pago completo y saldo', () => {
    expect(cobroDelAviso(aviso('✅ ¡Recibimos tu adelanto de S/75! Te queda un saldo de S/75…'), cobros)?.id).toBe('a')
    expect(cobroDelAviso(aviso('✅ ¡Recibimos tu pago completo de S/150! No te queda ningún saldo pendiente.'), cobros)?.id).toBe('a')
    expect(cobroDelAviso(aviso('✅ ¡Recibimos tu saldo de S/75! Ya no te queda nada pendiente.'), cobros)?.id).toBe('s')
  })

  // Los hilos del generador del demo dicen otra frase, y también cuentan.
  it('la copy del generador del demo', () => {
    expect(cobroDelAviso(aviso('Adelanto verificado'), cobros)?.id).toBe('a')
  })

  // Con dos extras pagados, el aviso abre el comprobante del SUYO.
  it('un extra se reconoce por su concepto, no por ser el primero', () => {
    expect(cobroDelAviso(aviso('✅ ¡Recibimos tu pago de S/11 por Hey! Gracias.'), cobros)?.id).toBe('x2')
    expect(cobroDelAviso(aviso('✅ ¡Recibimos tu pago de S/20 por Flete a Piura! Gracias.'), cobros)?.id).toBe('x1')
  })

  // Un cobro sin pagar no tiene comprobante que abrir, y un aviso cualquiera no
  // es un aviso de pago.
  it('ni cobros sin pagar, ni mensajes que no son avisos de pago', () => {
    const sinPagar = [{ id: 'a', tipo: 'adelanto', verificado: false, monto: 75, concepto: null }]
    expect(cobroDelAviso(aviso('Adelanto verificado'), sinPagar)).toBeNull()
    expect(cobroDelAviso(aviso('🚚 ¡Tu pedido va en camino a tu agencia!'), cobros)).toBeNull()
    expect(cobroDelAviso({ type: 'text', body: 'Adelanto verificado' }, cobros)).toBeNull()
  })

  // Sin id no hay página que abrir: un cobro que todavía se lee de las columnas
  // viejas no puede prometer un botón que va a dar 404.
  it('sin id no hay comprobante', () => {
    const sinId = [{ id: null, tipo: 'total', verificado: true, monto: 150, concepto: null }]
    expect(cobroDelAviso(aviso('Adelanto verificado'), sinId)).toBeNull()
  })
})
