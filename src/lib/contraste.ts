// ─── Qué color de texto se lee sobre el color de una marca ───────────────────
//
// La pantalla de pedido confirmado pinta su cabecera con el color primario de
// cada tienda, y ese color lo elige el comerciante: puede ser un naranja
// saturado, un amarillo o un azul casi negro. Escribir siempre en blanco
// —o siempre en oscuro— deja el título ilegible en la mitad de las marcas, y
// «ilegible» acá es el nombre de la tienda y la frase del dinero.
//
// Se decide con la luminancia relativa de la WCAG, que es la misma cuenta que
// hace un navegador para medir contraste. No es un gusto: es aritmética.

/** El ink del manual de marca (`10-MANUAL-DE-MARCA.md`). */
const INK = '#0F1115'
const BLANCO = '#FFFFFF'

/** `#abc` y `#aabbcc`, con o sin `#`. `null` si no se entiende. */
function aRgb(hex: string): [number, number, number] | null {
  const h = String(hex ?? '').trim().replace(/^#/, '')
  const largo = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(largo)) return null
  return [0, 2, 4].map(i => parseInt(largo.slice(i, i + 2), 16)) as [number, number, number]
}

/** Luminancia relativa (WCAG 2.1 §Relative luminance). */
function luminancia(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const razon = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * El texto que MÁS contrasta sobre `fondo`: blanco o el ink del manual.
 *
 * Sin poder leer el color se devuelve el ink, que es lo seguro: los colores por
 * defecto de la plataforma son claros, y un texto oscuro sobre un fondo que no
 * se pudo pintar sigue leyéndose.
 */
export function textoSobre(fondo: string): string {
  const rgb = aRgb(fondo)
  if (!rgb) return INK
  const l = luminancia(rgb)
  return razon(l, luminancia([255, 255, 255])) >= razon(l, luminancia([15, 17, 21])) ? BLANCO : INK
}

/** El mismo color, más apagado: la línea secundaria de una cabecera. */
export const textoSuaveSobre = (fondo: string): string =>
  textoSobre(fondo) === BLANCO ? 'rgba(255,255,255,0.82)' : 'rgba(15,17,21,0.72)'
