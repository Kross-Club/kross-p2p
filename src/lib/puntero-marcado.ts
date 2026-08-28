import { useCallback, useEffect, useRef, useState } from 'react'
import { haciaDonde } from './fuera-de-vista'
import type { Direccion } from './fuera-de-vista'

// ─── Seguirle la pista al pedido seleccionado ────────────────────────────────
//
// Abrir un pedido marca su borde para no perder el sitio al cerrar el cajón.
// Pero el tablero scrollea en DOS ejes —nueve columnas de ancho, treinta
// tarjetas de alto— y basta arrastrar un poco para que el pedido seleccionado
// quede fuera de la pantalla, sin nada que diga hacia dónde.
//
// Este hook responde dos cosas sobre ese pedido: si se ve, y si no, por dónde
// anda. La geometría vive aparte y sin React (`fuera-de-vista.ts`), que es lo
// que la hace probable sin un navegador.

export interface Puntero {
  /** `null` = se ve. Si no, hacia dónde hay que ir. */
  direccion: Direccion | null
  /** Lo trae al centro de la pantalla. */
  ir: () => void
}

/**
 * @param nodo  La tarjeta marcada. `null` cuando no hay ninguna en pantalla —
 *              porque no hay pedido abierto, porque el filtro lo dejó fuera, o
 *              porque el modo actual no pinta tarjetas.
 * @param clave Qué pedido es. Etiqueta la dirección guardada: al cambiar de
 *              pedido, la del anterior se descarta sola en vez de sobrevivir un
 *              render apuntando a otro sitio.
 */
export function usePunteroAlMarcado(nodo: HTMLElement | null, clave: string | null): Puntero {
  const [fuera, setFuera] = useState<{ clave: string; dir: Direccion } | null>(null)

  useEffect(() => {
    if (!nodo || !clave) return
    let vivo = true
    let pedido = 0

    // Se guarda solo cuando CAMBIA. Devolver el mismo objeto hace que React se
    // salte el render: sin esto, cada evento de scroll crearía un `{clave, dir}`
    // nuevo y repintaría las cien tarjetas del tablero a sesenta por segundo.
    const aplicar = (dir: Direccion | null) => {
      if (!vivo) return
      setFuera(prev => {
        if (!dir) return prev === null ? prev : null
        if (prev && prev.clave === clave && prev.dir === dir) return prev
        return { clave, dir }
      })
    }

    const medir = () => {
      pedido = 0
      if (!vivo) return
      aplicar(haciaDonde(
        nodo.getBoundingClientRect(),
        { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight },
      ))
    }

    // Una medición por cuadro como mucho: `getBoundingClientRect` obliga al
    // navegador a recalcular el layout, y el scroll dispara muchas más veces de
    // las que se pintan.
    const remedir = () => { if (!pedido) pedido = requestAnimationFrame(medir) }

    // El observador contra la PANTALLA (`root: null`), no contra la caja del
    // tablero: ya recorta por el desborde de los ancestros, así que una tarjeta
    // tapada por su columna cuenta como fuera. Cubre lo que el scroll no ve —
    // que la tarjeta se mueva porque cambió el layout, no la posición.
    const io = new IntersectionObserver(remedir, { threshold: [0, 0.35, 1] })

    // Y el scroll cubre lo que el observador no: solo avisa al CRUZAR un
    // umbral, y arrastrar de "fuera por la izquierda" a "fuera por arriba" no
    // cruza ninguno — la flecha se quedaría apuntando al lado equivocado.
    io.observe(nodo)
    window.addEventListener('scroll', remedir, true)
    window.addEventListener('resize', remedir)
    // La primera medición también por `remedir` y no directa: medir dentro del
    // efecto sería leer el layout antes de que el navegador haya pintado, y
    // guardar el resultado ahí mismo es la cascada de renders que React marca.
    remedir()

    return () => {
      vivo = false
      if (pedido) cancelAnimationFrame(pedido)
      io.disconnect()
      window.removeEventListener('scroll', remedir, true)
      window.removeEventListener('resize', remedir)
    }
  }, [nodo, clave])

  // ── Ir, aunque la fila todavía no exista ──
  //
  // Pulsar el botón no siempre puede desplazar en el acto: si el pedido está en
  // otra vista de la bandeja, o más allá de las filas pintadas, su nodo aún no
  // está en la pantalla. La petición queda ANOTADA y se cumple en cuanto el
  // nodo aparece — que es un instante después, cuando la pantalla se reordenó.
  //
  // En un ref y no en estado: es una intención pendiente, no algo que se pinte.
  // Con estado habría que limpiarla desde el efecto, que es justo la cascada de
  // renders que React marca.
  const pendiente = useRef(false)

  const centrar = (el: HTMLElement) => {
    // `center` en los dos ejes: el tablero desplaza en dos, y dejarlo pegado a
    // un borde es dejarlo medio tapado por la columna de al lado.
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }

  const ir = useCallback(() => {
    if (nodo) { centrar(nodo); return }
    pendiente.current = true
  }, [nodo])

  useEffect(() => {
    if (!pendiente.current || !nodo) return
    pendiente.current = false
    centrar(nodo)
  }, [nodo])

  return { direccion: clave && fuera?.clave === clave ? fuera.dir : null, ir }
}
