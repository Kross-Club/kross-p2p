import { describe, it, expect } from 'vitest'
import {
  IGV, TARIFA_KROSS, COSTO_PASARELA, COSTO_360PAY_PENALIZADO, CRUCE_DE_RIELES,
  comisionDeKross, costoDePasarela, margenDeKross, proveedorPara,
  desgloseDelEvento, hayDesvio,
} from '../../supabase/functions/_shared/comision.ts'

// La tabla que sostiene la tarifa. Está pegada al contrato (`docs/07-CONTRATO-
// 360PAY.md`, Anexo III) y al primer pago real, así que si algo de acá cambia
// es porque cambió el negocio — no porque alguien tocó un número.

describe('lo que cuesta cada riel', () => {
  it('360pay es plano: S/3.72 dé lo que dé el monto', () => {
    expect(costoDePasarela(5, '360PAY')).toBe(3.72)
    expect(costoDePasarela(90, '360PAY')).toBe(3.72)
    expect(costoDePasarela(3000, '360PAY')).toBe(3.72)
  })

  it('Flow es 4.13% del monto — 3.5% + IGV', () => {
    expect(costoDePasarela(100, 'FLOW')).toBe(4.13)
    expect(costoDePasarela(10, 'FLOW')).toBe(0.41)
    expect(costoDePasarela(0, 'FLOW')).toBe(0)
  })

  it('el mes penalizado sube 360pay a S/4.51', () => {
    expect(costoDePasarela(50, '360PAY', true)).toBe(4.51)
    // El penalizado no toca a Flow: es una cláusula del contrato de 360pay.
    expect(costoDePasarela(50, 'FLOW', true)).toBe(costoDePasarela(50, 'FLOW'))
  })
})

describe('el corte de riel', () => {
  it('está en S/90.00 exactos', () => {
    expect(CRUCE_DE_RIELES).toBe(90)
  })

  it('es exacto porque el IGV se cancela a los dos lados', () => {
    // 3.15/0.035 = 90 sin IGV, y (3.15·1.18)/(0.035·1.18) = 90 con IGV. O sea
    // que declarar el IGV distinto NO movería el corte.
    expect(Math.round((3.15 / 0.035) * 100) / 100).toBe(90)
    expect(CRUCE_DE_RIELES).toBe(Math.round((3.15 / 0.035) * 100) / 100)
  })

  it('en el corte los dos rieles cuestan lo mismo, así que el margen no salta', () => {
    expect(costoDePasarela(90, 'FLOW')).toBe(costoDePasarela(90, '360PAY'))
    expect(margenDeKross(90, 'FLOW')).toBe(margenDeKross(90, '360PAY'))
  })

  it('reparte por monto, con el empate hacia 360pay', () => {
    expect(proveedorPara(5)).toBe('FLOW')
    expect(proveedorPara(89.99)).toBe('FLOW')
    expect(proveedorPara(90)).toBe('360PAY')     // `>=`, no `>`
    expect(proveedorPara(300)).toBe('360PAY')
  })

  it('en un mes penalizado el corte se movería a S/109', () => {
    const cruce = Math.round((COSTO_360PAY_PENALIZADO / COSTO_PASARELA.FLOW.pct) * 100) / 100
    expect(cruce).toBeCloseTo(109.14, 2)
  })
})

describe('la tarifa de Kross: 5% + S/1.20', () => {
  it('es la que dice la constante', () => {
    expect(TARIFA_KROSS).toEqual({ pct: 0.05, fijo: 1.20 })
  })

  it.each([
    [5, 1.45], [10, 1.70], [25, 2.45], [50, 3.70],
    [89, 5.65], [90, 5.70], [100, 6.20], [180, 10.20], [300, 16.20],
  ])('cobra S/%s → S/%s', (monto, esperado) => {
    expect(comisionDeKross(monto)).toBe(esperado)
  })

  it('un monto absurdo no genera una comisión absurda', () => {
    expect(comisionDeKross(0)).toBe(1.20)
    expect(comisionDeKross(-50)).toBe(1.20)
    expect(comisionDeKross('no es un número')).toBe(1.20)
  })

  it('iguala el mínimo de S/5.00 del contrato justo en S/76', () => {
    // ⚠️ Bajo S/76 la tarifa queda POR DEBAJO del mínimo del Anexo III, así que
    // en el riel de 360pay no se puede aplicar sin adenda. Sobre el corte de
    // S/90 —lo único que el ruteo le deja a 360pay— nunca muerde.
    expect(comisionDeKross(76)).toBe(5.00)
    expect(comisionDeKross(CRUCE_DE_RIELES)).toBeGreaterThan(5.00)
  })
})

describe('el margen, rieles ya repartidos', () => {
  it.each([
    [5, 1.24], [10, 1.29], [25, 1.42], [50, 1.63], [89, 1.97],
    [90, 1.98], [100, 2.48], [180, 6.48], [300, 12.48],
  ])('S/%s deja S/%s', (monto, esperado) => {
    expect(margenDeKross(monto, proveedorPara(monto))).toBe(esperado)
  })

  it('nunca baja de S/1.20 bruto — el piso lo pone la parte fija', () => {
    for (let m = 0; m <= 400; m += 0.5) {
      expect(margenDeKross(m, proveedorPara(m))).toBeGreaterThanOrEqual(TARIFA_KROSS.fijo)
    }
  })

  it('y de S/1.00 NETO de IGV, que era el objetivo del S/1.20', () => {
    // Con IGV incluido el fijo se divide entre 1.18 antes de quedar. Con S/1.00
    // el piso real caía a S/0.88; es la razón entera del S/1.20.
    expect(TARIFA_KROSS.fijo / IGV).toBeGreaterThanOrEqual(1)
    expect(TARIFA_KROSS.fijo / IGV).toBeCloseTo(1.017, 3)
  })

  it('con el riel equivocado el margen se hunde — por eso existe el corte', () => {
    // Un cobro chico por 360pay cuesta S/3.72 y solo deja S/1.70 de comisión.
    expect(margenDeKross(10, '360PAY')).toBeLessThan(0)
    expect(margenDeKross(10, 'FLOW')).toBeGreaterThan(0)
  })
})

describe('lo que de verdad se descontó', () => {
  it('cierra contra el primer pago real (cupón 6a87c28e…, S/10)', () => {
    // `fee_platform 3.72 + fee_partner 1.28 = 5.00` — la tarifa vieja.
    expect(desgloseDelEvento(3.72, 1.28)).toEqual({ comision: 5.00, costo: 3.72 })
  })

  it('sin desglose responde null, y NO se rellena con el cálculo', () => {
    expect(desgloseDelEvento(undefined, undefined)).toBeNull()
    expect(desgloseDelEvento(3.72, null)).toBeNull()
    expect(desgloseDelEvento('3.72', 1.28)).toBeNull()   // el string no es el dato
    expect(desgloseDelEvento(NaN, 1.28)).toBeNull()
  })

  it('detecta que la pasarela quedó con la tarifa vieja', () => {
    // Es exactamente lo que pasaría hoy: se espera S/1.70 y se descuenta S/5.00.
    expect(hayDesvio(comisionDeKross(10), 5.00)).toBe(true)
  })

  it('un céntimo de redondeo no es un desvío', () => {
    expect(hayDesvio(5.00, 5.01)).toBe(false)
    expect(hayDesvio(5.00, 4.99)).toBe(false)
    expect(hayDesvio(5.00, 5.02)).toBe(true)
  })
})
