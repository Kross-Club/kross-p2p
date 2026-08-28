import { describe, it, expect } from 'vitest'
import { decidirEco } from './scroll-espejo'
import type { Lado } from './scroll-espejo'

/**
 * Corre una secuencia de eventos como los dispararía el navegador y devuelve a
 * quién se le escribió la posición. Escribir en la caja mientras se desplaza
 * sola es lo que cancela la animación, así que "a quién se le escribió" es
 * exactamente la pregunta que decide si el bug está o no.
 */
function correr(eventos: { quien: Lado; suya: number; ajena: number }[]) {
  let eco: Lado | null = null
  const escrituras: Lado[] = []
  for (const e of eventos) {
    const d = decidirEco(eco, e.quien, e.suya, e.ajena)
    eco = d.eco
    if (d.copiar) escrituras.push(e.quien === 'riel' ? 'caja' : 'riel')
  }
  return escrituras
}

describe('el espejo del scroll', () => {
  // EL BUG. La caja se desplaza sola (scroll suave) y va disparando eventos;
  // cada copia al riel produce su propio evento, que llega un cuadro después,
  // cuando la animación ya avanzó. Sin la guardia, ese eco le escribía
  // `scrollLeft` a la caja y cancelaba la animación: el botón "ir al pedido"
  // avanzaba unos píxeles por clic.
  it('un desplazamiento suave nunca recibe escrituras de vuelta', () => {
    const escrituras = correr([
      // La caja avanza y se copia al riel.
      { quien: 'caja', suya: 100, ajena: 0 },
      // El eco del riel llega tarde: él está en 100, la caja ya va por 140.
      { quien: 'riel', suya: 100, ajena: 140 },
      { quien: 'caja', suya: 140, ajena: 100 },
      { quien: 'riel', suya: 140, ajena: 180 },
      { quien: 'caja', suya: 180, ajena: 140 },
      { quien: 'riel', suya: 180, ajena: 220 },
    ])
    expect(escrituras).toEqual(['riel', 'riel', 'riel'])
    expect(escrituras).not.toContain('caja')
  })

  it('arrastrar el riel sí mueve la caja', () => {
    const escrituras = correr([
      { quien: 'riel', suya: 50, ajena: 0 },
      { quien: 'caja', suya: 50, ajena: 50 },   // su eco
      { quien: 'riel', suya: 90, ajena: 50 },
      { quien: 'caja', suya: 90, ajena: 90 },   // su eco
    ])
    expect(escrituras).toEqual(['caja', 'caja'])
  })

  it('el eco se consume una sola vez', () => {
    expect(decidirEco('riel', 'riel', 10, 40)).toEqual({ copiar: false, eco: null })
    // Y el siguiente evento del riel, ya sin marca, sí manda.
    expect(decidirEco(null, 'riel', 10, 40)).toEqual({ copiar: true, eco: 'caja' })
  })

  // Si marcara el eco al no copiar, la marca esperaría un evento que nunca va a
  // llegar — y se comería el siguiente movimiento de verdad.
  it('estando ya en el mismo sitio no copia ni marca nada', () => {
    expect(decidirEco(null, 'caja', 200, 200)).toEqual({ copiar: false, eco: null })
    expect(decidirEco('riel', 'caja', 200, 200)).toEqual({ copiar: false, eco: 'riel' })
  })

  it('se copia siempre hacia el OTRO lado', () => {
    expect(decidirEco(null, 'caja', 1, 2).eco).toBe('riel')
    expect(decidirEco(null, 'riel', 1, 2).eco).toBe('caja')
  })
})
