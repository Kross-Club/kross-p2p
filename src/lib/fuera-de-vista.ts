// ─── ¿Dónde quedó lo que estoy mirando? ──────────────────────────────────────
//
// El tablero scrollea en dos ejes: nueve columnas a lo ancho y hasta treinta
// tarjetas a lo alto. Abrir un pedido marca su borde para no perder el sitio,
// pero eso solo sirve si el borde se ve — y basta arrastrar un poco para que el
// pedido abierto quede fuera de la pantalla, sin nada que diga hacia dónde.
//
// Acá vive la parte que se puede probar sin un navegador: dadas dos cajas —la
// del pedido y la de la pantalla— decir si se ve, y si no, hacia dónde está.
// El componente pone el observador; esto decide qué significa lo que observa.

export type Direccion = 'arriba' | 'abajo' | 'izquierda' | 'derecha'

export interface Caja {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Cuánto de la caja está dentro de la pantalla, de 0 a 1.
 *
 * Se mide por ÁREA y no por "toca o no toca": una tarjeta asomando un píxel por
 * el borde está técnicamente visible y en la práctica no se ve. El umbral lo
 * pone quien pregunta.
 */
export function fraccionVisible(caja: Caja, pantalla: Caja): number {
  const ancho = Math.max(0, caja.right - caja.left)
  const alto = Math.max(0, caja.bottom - caja.top)
  const area = ancho * alto
  if (area <= 0) return 0

  const dentroX = Math.max(0, Math.min(caja.right, pantalla.right) - Math.max(caja.left, pantalla.left))
  const dentroY = Math.max(0, Math.min(caja.bottom, pantalla.bottom) - Math.max(caja.top, pantalla.top))
  return (dentroX * dentroY) / area
}

/**
 * Hacia dónde hay que ir para encontrarla. `null` = ya se ve lo suficiente.
 *
 * Manda el eje en el que está MÁS lejos: un pedido que está un poco abajo y
 * mucho a la izquierda se encuentra yendo a la izquierda, y una flecha que
 * apunta abajo lo mandaría a buscar donde no está.
 *
 * `minimo` es cuánto tiene que verse para dar por buena la ubicación. No es 0:
 * con el umbral en "un píxel", el puntero desaparece justo cuando la tarjeta
 * asoma por el borde — que es cuando todavía hace falta.
 */
export function haciaDonde(caja: Caja, pantalla: Caja, minimo = 0.35): Direccion | null {
  if (fraccionVisible(caja, pantalla) >= minimo) return null

  // Distancia del borde de la caja al borde de la pantalla por cada lado. Solo
  // cuenta lo que se sale: si un lado está dentro, ese lado no aleja nada.
  const arriba = Math.max(0, pantalla.top - caja.top)
  const abajo = Math.max(0, caja.bottom - pantalla.bottom)
  const izquierda = Math.max(0, pantalla.left - caja.left)
  const derecha = Math.max(0, caja.right - pantalla.right)

  const mayor = Math.max(arriba, abajo, izquierda, derecha)
  // No se sale por ningún lado y aun así "no se ve lo suficiente": solo pasa si
  // el umbral pedido es inalcanzable. No hay dirección que dar — señalar una
  // sería mandar a alguien a buscar donde ya está.
  if (mayor <= 0) return null

  if (mayor === izquierda) return 'izquierda'
  if (mayor === derecha) return 'derecha'
  if (mayor === arriba) return 'arriba'
  return 'abajo'
}
