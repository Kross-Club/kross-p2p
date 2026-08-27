import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ─── Scroll horizontal con la barra ARRIBA ───────────────────────────────────
//
// El tablero tiene nueve columnas y en pantalla entran cinco. La barra nativa
// queda debajo de las tarjetas: para descubrir que hay más etapas hay que
// bajar hasta el final de la columna más larga, y para volver a arrastrarla,
// otra vez. Así, media operación queda fuera de la vista sin nada que lo diga.
//
// Acá se arrastran DOS contenedores que scrollean juntos: un riel de 10px
// arriba, que es el único que enseña barra, y la caja de verdad debajo, con la
// suya escondida. Es la misma posición vista dos veces, no dos posiciones.
//
// El ancho del riel no se calcula: lo mide un ResizeObserver sobre la fila real
// (`w-max`, o sea que su caja crece con las columnas). Un ancho a ojo se
// desincroniza en cuanto una columna cambia de tamaño.

export default function ScrollHorizontal({ children, className = '', alto = 10 }: {
  children: ReactNode
  /** Clases de la fila que scrollea. Lleva `w-max` puesto. */
  className?: string
  alto?: number
}) {
  const riel = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const fila = useRef<HTMLDivElement>(null)
  const [medida, setMedida] = useState({ ancho: 0, visible: 0 })

  useEffect(() => {
    const f = fila.current
    const c = caja.current
    if (!f || !c) return
    // El observador dispara una vez al observar, así que la medida inicial sale
    // de acá y no de un `setState` en el cuerpo del efecto.
    const ro = new ResizeObserver(() => setMedida({ ancho: f.scrollWidth, visible: c.clientWidth }))
    ro.observe(f)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  // Sin desborde no hay nada que arrastrar, y un riel vacío es una barra que
  // promete contenido que no existe.
  const desborda = medida.ancho > medida.visible + 1

  // No hace falta guardia contra el rebote: asignar el mismo `scrollLeft` no
  // dispara otro evento, así que el ping-pong se corta solo.
  const seguir = (de: HTMLDivElement | null, a: HTMLDivElement | null) => {
    if (de && a) a.scrollLeft = de.scrollLeft
  }

  return (
    <>
      <div
        ref={riel}
        onScroll={() => seguir(riel.current, caja.current)}
        aria-hidden
        className="riel-scroll"
        style={{
          height: desborda ? alto : 0,
          overflowX: desborda ? 'auto' : 'hidden',
          overflowY: 'hidden',
        }}
      >
        <div style={{ width: medida.ancho, height: 1 }} />
      </div>
      <div
        ref={caja}
        onScroll={() => seguir(caja.current, riel.current)}
        className="overflow-x-auto sin-barra"
      >
        <div ref={fila} className={`w-max ${className}`}>{children}</div>
      </div>
    </>
  )
}
