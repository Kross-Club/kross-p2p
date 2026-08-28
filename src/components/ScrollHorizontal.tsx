import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { decidirEco } from '../lib/scroll-espejo'
import type { Lado } from '../lib/scroll-espejo'

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

export default function ScrollHorizontal({ children, className = '', alto = 10, lleno = false }: {
  children: ReactNode
  /** Clases de la fila que scrollea. Lleva `w-max` puesto. */
  className?: string
  alto?: number
  /**
   * `true` = la caja se queda con el alto que le sobre al padre y scrollea ella
   * misma, en vez de estirarse y hacer scrollear la página.
   *
   * Es lo que hace posible que los nombres de las etapas se queden fijos
   * arriba: un `position: sticky` necesita un contenedor que scrollee, y con
   * alto automático no hay ninguno. De paso, si la página no scrollea, abrir un
   * pedido encima no puede devolverla al principio.
   *
   * El padre tiene que ser `flex flex-col` con alto definido.
   */
  lleno?: boolean
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

  // El riel y la caja se siguen, y hay que callar el eco para que un scroll
  // suave no se cancele a sí mismo. La regla —y el porqué, que es largo— vive
  // en `scroll-espejo.ts`, que es lo único de esto que se puede probar sin un
  // navegador.
  const eco = useRef<Lado | null>(null)

  const seguir = (quien: Lado) => {
    const de = quien === 'riel' ? riel.current : caja.current
    const a = quien === 'riel' ? caja.current : riel.current
    if (!de || !a) return
    const d = decidirEco(eco.current, quien, de.scrollLeft, a.scrollLeft)
    eco.current = d.eco
    if (d.copiar) a.scrollLeft = de.scrollLeft
  }

  return (
    <>
      <div
        ref={riel}
        onScroll={() => seguir('riel')}
        aria-hidden
        className="riel-scroll flex-shrink-0"
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
        onScroll={() => seguir('caja')}
        className={`sin-barra ${lleno ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'}`}
      >
        <div ref={fila} className={`w-max ${className}`}>{children}</div>
      </div>
    </>
  )
}
