// ─── El fondo de una marca: dos colores y un ángulo — PURO ──────────────────
//
// Hasta el 09-set-2026 una tienda tenía un color primario y un «fondo oscuro»
// que casi no se usaba: el `theme-color` del navegador y el botón de la web
// pública. Ahora el segundo color es el **secundario** y su trabajo es hacer
// degradado con el primario, que es lo que pinta el acceso del comprador.
//
// La columna sigue llamándose `color_dark` a propósito: renombrarla obligaría a
// correr el SQL y desplegar las funciones en el mismo minuto, y mientras tanto
// cada marca se quedaría sin color. El nombre viejo no estorba; lo que cambia
// es lo que significa, y eso vive acá.
//
// Sin React ni DOM, para poder probarse.

import { textoSobre } from './contraste'

export type EstiloDeDegradado = 'vertical' | 'horizontal' | 'diagonal' | 'aleatorio'

export const ESTILOS_DE_DEGRADADO: { valor: EstiloDeDegradado; etiqueta: string }[] = [
  { valor: 'vertical', etiqueta: 'Vertical' },
  { valor: 'horizontal', etiqueta: 'Horizontal' },
  { valor: 'diagonal', etiqueta: 'Diagonal' },
  { valor: 'aleatorio', etiqueta: 'Aleatorio' },
]

const VALORES = ESTILOS_DE_DEGRADADO.map(e => e.valor)

/** Lo guardado puede ser cualquier cosa (una marca vieja, un valor a mano). */
export function estiloValido(v: unknown): EstiloDeDegradado {
  return VALORES.includes(v as EstiloDeDegradado) ? (v as EstiloDeDegradado) : 'diagonal'
}

/** Hash estable de una cadena. El mismo id da siempre el mismo número. */
function semillaDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * El ángulo CSS del degradado. 0° va hacia arriba y 90° hacia la derecha, como
 * en `linear-gradient`.
 *
 * ⚠️ `aleatorio` NO se sortea en cada pintada: se deriva del id de la tienda,
 * así que a cada marca le toca su ángulo y le toca SIEMPRE el mismo. Un fondo
 * que cambia de inclinación cada vez que se abre la app no se lee como una
 * gracia, se lee como un error — y además haría imposible reconocer la pantalla.
 * «Aleatorio» significa «elígelo tú por mí», no «cámbialo cada rato».
 */
export function anguloDeDegradado(estilo: EstiloDeDegradado, semilla = ''): number {
  switch (estiloValido(estilo)) {
    case 'vertical': return 180      // el primario arriba, el secundario abajo
    case 'horizontal': return 90     // el primario a la izquierda
    case 'diagonal': return 135      // hacia abajo y a la derecha
    case 'aleatorio': return (semillaDe(semilla) % 24) * 15
  }
}

/** El `background` completo: el degradado de los dos colores de la marca. */
export function fondoDeMarca(primario: string, secundario: string, estilo: EstiloDeDegradado, semilla = ''): string {
  const a = primario || '#55C8F5'
  const b = secundario || a
  return `linear-gradient(${anguloDeDegradado(estilo, semilla)}deg, ${a} 0%, ${b} 100%)`
}

/** Mezcla de dos colores al 50 %, para decidir sobre qué se está escribiendo. */
export function mezcla(a: string, b: string): string {
  const rgb = (hex: string) => {
    const h = String(hex ?? '').trim().replace(/^#/, '')
    const largo = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    if (!/^[0-9a-fA-F]{6}$/.test(largo)) return null
    return [0, 2, 4].map(i => parseInt(largo.slice(i, i + 2), 16))
  }
  const ra = rgb(a), rb = rgb(b)
  if (!ra) return b
  if (!rb) return a
  const dos = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${ra.map((v, i) => dos((v + rb[i]) / 2)).join('')}`
}

/** El vidrio del acceso: la tarjeta translúcida sobre el degradado. */
export interface Vidrio {
  /** Encima del degradado: es lo que hace que el texto se lea. */
  fondo: string
  borde: string
  sombra: string
  tinta: string
  tintaSuave: string
  /** Los campos, dentro del vidrio. */
  campo: string
  bordeCampo: string
  /** Blanco sobre el degradado, o el ink del manual. */
  claro: boolean
}

/**
 * El vidrio se decide por el color del degradado, no por gusto.
 *
 * Un `backdrop-filter` solo NO garantiza contraste: desenfoca lo de atrás pero
 * deja pasar su claridad, así que sobre un amarillo el texto blanco desaparece
 * igual. Por eso el vidrio lleva un VELO —oscuro sobre fondo claro no, al revés:
 * oscuro sobre fondo oscuro y claro sobre fondo claro—, que empuja el fondo
 * hacia el extremo donde su tinta ya gana. Con eso el texto se lee con
 * cualquiera de los dos colores que elija el comerciante.
 */
export function vidrioDeMarca(primario: string, secundario: string): Vidrio {
  const claro = textoSobre(mezcla(primario || '#55C8F5', secundario || primario || '#55C8F5')) === '#FFFFFF'
  return claro
    ? {
        fondo: 'rgba(12,14,18,0.42)',
        borde: '1px solid rgba(255,255,255,0.22)',
        sombra: '0 24px 60px rgba(0,0,0,0.28)',
        tinta: '#FFFFFF',
        tintaSuave: 'rgba(255,255,255,0.82)',
        campo: 'rgba(255,255,255,0.14)',
        bordeCampo: '1px solid rgba(255,255,255,0.28)',
        claro: true,
      }
    : {
        fondo: 'rgba(255,255,255,0.52)',
        borde: '1px solid rgba(255,255,255,0.75)',
        sombra: '0 24px 60px rgba(15,17,21,0.18)',
        tinta: '#0F1115',
        tintaSuave: 'rgba(15,17,21,0.72)',
        campo: 'rgba(255,255,255,0.72)',
        bordeCampo: '1px solid rgba(15,17,21,0.12)',
        claro: false,
      }
}

// ─── Dónde flotan las imágenes del acceso ────────────────────────────────────
//
// Son hasta tres PNG que sube la marca (`stores.login_images`). Las posiciones
// NO las elige quien sube: las decide la pantalla, porque de eso depende que se
// vea el diseño y no un collage.
//
// La segunda es la única que pasa POR DETRÁS de la tarjeta, y por un costado:
// es lo que hace visible el vidrio —sin nada detrás, un `backdrop-filter` no se
// distingue de un fondo plano—. Las otras dos quedan lejos, arriba y abajo, y
// además se recortan contra el borde de la pantalla para que se lean como parte
// del fondo y no como tres productos apoyados en el aire.

export interface SitioFlotante {
  estilo: Record<string, string | number>
  /** Segundos que tarda el vaivén: distintos para que nunca vayan a compás. */
  ritmo: number
  /** Cuánto sube y cuánto deriva, en px, y cuánto gira. */
  altura: number
  deriva: number
  giro: number
  /** Detrás del vidrio (la del costado) o delante del fondo. */
  detras: boolean
}

export const SITIOS_FLOTANTES: SitioFlotante[] = [
  // 1 · Arriba a la izquierda, mordiendo el borde.
  { estilo: { top: '4%', left: '-14%', width: '46%' }, ritmo: 11, altura: -20, deriva: 8, giro: 4, detras: false },
  // 2 · La del costado, a la altura de la tarjeta: la que se ve por el vidrio.
  { estilo: { top: '38%', right: '-20%', width: '58%' }, ritmo: 14, altura: -26, deriva: -10, giro: -5, detras: true },
  // 3 · Abajo a la izquierda, más chica: cierra la composición.
  { estilo: { bottom: '6%', left: '-8%', width: '38%' }, ritmo: 9, altura: 18, deriva: 10, giro: -3, detras: false },
]

/** Las URLs guardadas, limpias y recortadas a los tres sitios que existen. */
export function imagenesDeAcceso(guardadas: unknown): string[] {
  if (!Array.isArray(guardadas)) return []
  return guardadas
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .slice(0, SITIOS_FLOTANTES.length)
}
