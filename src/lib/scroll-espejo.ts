// ─── Dos cajas que se siguen sin pelearse ────────────────────────────────────
//
// El tablero arrastra DOS contenedores a la vez: un riel de 10 px arriba —el
// único que enseña barra— y la caja de verdad debajo. Mover uno mueve al otro.
//
// El problema es que mover al otro dispara SU evento de scroll, que quiere
// volver a mover al primero. Mientras el usuario arrastra con el dedo eso se
// corta solo: cuando el eco llega, los dos ya están en el mismo sitio y
// escribir el mismo valor no dispara nada.
//
// **Deja de cortarse solo en cuanto la caja se mueve sola.** Con un scroll
// suave (`scrollIntoView`), entre que se copia la posición al riel y llega el
// evento del riel, la animación YA avanzó: los valores no coinciden, se le
// escribe `scrollLeft` a la caja, y **escribir `scrollLeft` cancela la
// animación en curso** y la devuelve donde estaba. El botón "ir al pedido"
// avanzaba unos píxeles por clic; hacían falta cincuenta para llegar.
//
// La regla está acá, aparte del componente, porque es lo único de todo esto que
// se puede probar sin un navegador.

export type Lado = 'riel' | 'caja'

export interface Decision {
  /** Copiar la posición de `quien` al otro. */
  copiar: boolean
  /** Qué lado queda marcado: el evento que le llegue no será del usuario. */
  eco: Lado | null
}

const otro = (l: Lado): Lado => (l === 'riel' ? 'caja' : 'riel')

/**
 * Qué hacer con el evento de scroll de `quien`.
 *
 * @param eco   Lado marcado por el ajuste anterior, si lo hubo.
 * @param quien Cuál de los dos disparó este evento.
 * @param suya  Dónde está `quien`.
 * @param ajena Dónde está el otro.
 */
export function decidirEco(eco: Lado | null, quien: Lado, suya: number, ajena: number): Decision {
  // Este evento es el eco de un ajuste nuestro: se consume y no se devuelve.
  // Es la línea que deja viva la animación.
  if (eco === quien) return { copiar: false, eco: null }

  // Ya están donde tienen que estar. Se sale ANTES de marcar: escribir un valor
  // que ya está puesto no dispara evento, así que la marca se quedaría
  // esperando un eco que nunca llega y se comería el siguiente movimiento.
  if (suya === ajena) return { copiar: false, eco }

  return { copiar: true, eco: otro(quien) }
}
