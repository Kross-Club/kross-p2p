import { describe, expect, it } from 'vitest'
import {
  ESTILOS_DE_DEGRADADO, SITIOS_FLOTANTES, anguloDeDegradado, estiloValido,
  cajaDeLaMarca, fondoDeMarca, imagenesPorSitio, mezcla, SITIO_DE_LA_CAJA, ESQUINAS_DEL_PEDIDO, vidrioDeMarca,
} from './degradado'

describe('estiloValido', () => {
  it('acepta los cuatro y cae en diagonal con cualquier otra cosa', () => {
    for (const { valor } of ESTILOS_DE_DEGRADADO) expect(estiloValido(valor)).toBe(valor)
    for (const basura of [null, undefined, '', 'radial', 42, {}]) expect(estiloValido(basura)).toBe('diagonal')
  })
})

describe('anguloDeDegradado', () => {
  it('los tres fijos son los que dicen ser', () => {
    expect(anguloDeDegradado('vertical')).toBe(180)
    expect(anguloDeDegradado('horizontal')).toBe(90)
    expect(anguloDeDegradado('diagonal')).toBe(135)
  })

  it('aleatorio es ESTABLE por tienda: la misma semilla da siempre el mismo ángulo', () => {
    const a = anguloDeDegradado('aleatorio', 'st_monoshop_abc')
    for (let i = 0; i < 20; i++) expect(anguloDeDegradado('aleatorio', 'st_monoshop_abc')).toBe(a)
  })

  it('aleatorio reparte entre marcas y siempre cae en un múltiplo de 15 dentro del giro', () => {
    const vistos = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const g = anguloDeDegradado('aleatorio', `st_marca_${i}`)
      expect(g % 15).toBe(0)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThan(360)
      vistos.add(g)
    }
    // Con 24 ángulos posibles y 200 marcas, quedarse en dos o tres sería un hash roto.
    expect(vistos.size).toBeGreaterThan(15)
  })

  it('sin semilla da un ángulo válido igual, no un NaN', () => {
    const g = anguloDeDegradado('aleatorio')
    expect(g % 15).toBe(0)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(g).toBeLessThan(360)
  })
})

describe('fondoDeMarca', () => {
  it('arma el degradado con los dos colores y el ángulo del estilo', () => {
    expect(fondoDeMarca('#FD4F01', '#000000', 'vertical'))
      .toBe('linear-gradient(180deg, #FD4F01 0%, #000000 100%)')
    expect(fondoDeMarca('#FD4F01', '#000000', 'horizontal'))
      .toBe('linear-gradient(90deg, #FD4F01 0%, #000000 100%)')
  })

  it('sin secundario el degradado es del primario a sí mismo, no a negro', () => {
    // Una marca que nunca tocó el segundo color no debe amanecer con el fondo
    // medio negro: el degradado se vuelve un plano de su color.
    expect(fondoDeMarca('#FD4F01', '', 'diagonal'))
      .toBe('linear-gradient(135deg, #FD4F01 0%, #FD4F01 100%)')
  })

  it('sin ningún color cae al celeste por defecto', () => {
    expect(fondoDeMarca('', '', 'diagonal')).toBe('linear-gradient(135deg, #55C8F5 0%, #55C8F5 100%)')
  })
})

describe('mezcla', () => {
  it('promedia canal por canal', () => {
    expect(mezcla('#000000', '#FFFFFF')).toBe('#808080')
    expect(mezcla('#FF0000', '#0000FF')).toBe('#800080')
  })

  it('con un color ilegible devuelve el otro, no un gris inventado', () => {
    expect(mezcla('nada', '#FD4F01')).toBe('#FD4F01')
    expect(mezcla('#FD4F01', 'nada')).toBe('#FD4F01')
  })

  it('acepta la forma corta', () => {
    expect(mezcla('#fff', '#000')).toBe('#808080')
  })
})

describe('vidrioDeMarca', () => {
  it('sobre un degradado oscuro el vidrio se oscurece y el texto va en blanco', () => {
    const v = vidrioDeMarca('#FD4F01', '#000000')
    expect(v.claro).toBe(true)
    expect(v.tinta).toBe('#FFFFFF')
    expect(v.fondo).toContain('12,14,18')
  })

  it('sobre un degradado claro el vidrio se aclara y el texto va en ink', () => {
    const v = vidrioDeMarca('#FFE9A8', '#FFFFFF')
    expect(v.claro).toBe(false)
    expect(v.tinta).toBe('#0F1115')
    expect(v.fondo).toContain('255,255,255')
  })

  it('sin secundario decide con el primario solo', () => {
    expect(vidrioDeMarca('#0B1020', '').tinta).toBe('#FFFFFF')
    expect(vidrioDeMarca('#F7F7F2', '').tinta).toBe('#0F1115')
  })
})

describe('imagenesPorSitio', () => {
  it('cada casilla en SU sitio, y nunca más sitios de los que existen', () => {
    expect(imagenesPorSitio(['a.png', 'b.png', 'c.png', 'd.png'])).toEqual(['a.png', 'b.png', 'c.png'])
    expect(imagenesPorSitio(null)).toEqual([null, null, null])
    expect(imagenesPorSitio('a.png')).toEqual([null, null, null])
    expect(imagenesPorSitio([])).toEqual([null, null, null])
  })

  // Esto es lo que antes se rompía: filtrando los huecos, quien llenaba solo la
  // segunda casilla la veía salir en el sitio de la primera — y desde que la
  // segunda significa «tu caja», además la dejaba sin caja en su pedido.
  it('un HUECO no corre a la imagen que viene detrás', () => {
    expect(imagenesPorSitio([null, 'caja.png'])).toEqual([null, 'caja.png', null])
    expect(imagenesPorSitio(['', 'caja.png', '   '])).toEqual([null, 'caja.png', null])
  })

  it('hay tres sitios y solo UNO pasa por detrás del vidrio', () => {
    expect(SITIOS_FLOTANTES).toHaveLength(3)
    expect(SITIOS_FLOTANTES.filter(s => s.detras)).toHaveLength(1)
  })

  it('los tres flotan a ritmos distintos: a compás se vería un carrusel', () => {
    expect(new Set(SITIOS_FLOTANTES.map(s => s.ritmo)).size).toBe(3)
  })
})

describe('cajaDeLaMarca', () => {
  // La caja es la SEGUNDA casilla, siempre: es lo que el editor le promete al
  // comerciante y lo que enmarca su pedido confirmado.
  it('es la segunda casilla, esté sola o acompañada', () => {
    expect(cajaDeLaMarca(['gorra.png', 'caja.png', 'spray.png'])).toBe('caja.png')
    expect(cajaDeLaMarca([null, 'caja.png'])).toBe('caja.png')
    expect(SITIO_DE_LA_CAJA).toBe(1)
  })

  it('sin esa casilla no se pinta ninguna: no se sustituye por otra', () => {
    expect(cajaDeLaMarca(['gorra.png'])).toBeNull()
    expect(cajaDeLaMarca(['gorra.png', '', 'spray.png'])).toBeNull()
    expect(cajaDeLaMarca(null)).toBeNull()
  })
})

describe('ESQUINAS_DEL_PEDIDO', () => {
  it('son dos, una volteada, y con ritmos distintos', () => {
    expect(ESQUINAS_DEL_PEDIDO).toHaveLength(2)
    expect(ESQUINAS_DEL_PEDIDO.filter(e => e.espejo)).toHaveLength(1)
    expect(new Set(ESQUINAS_DEL_PEDIDO.map(e => e.ritmo)).size).toBe(2)
  })

  // Van detrás del ticket, nunca delante: la boleta es lo que se captura.
  it('ninguna se mete detrás del vidrio: eso es cosa del acceso', () => {
    expect(ESQUINAS_DEL_PEDIDO.every(e => !e.detras)).toBe(true)
  })
})
