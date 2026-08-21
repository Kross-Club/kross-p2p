// ─── Utilidades de scroll dentro del modal ───────────────────────────────────
// El checkout vive en un panel fijo con UN contenedor scrolleable. Cuando un
// campo abre una lista (distrito) o aparece un bloque nuevo (agencias), hay que
// asegurarse de que se VEA — y en móvil eso pelea con el teclado, que achica el
// viewport DESPUÉS del foco y deja lo recién abierto debajo del pliegue.

/** El ancestro scrolleable más cercano: el `overflow-y-auto` del modal. */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n)
    if (overflowY === 'auto' || overflowY === 'scroll') return n
  }
  return null
}

/** Borde inferior VISIBLE: el menor entre el contenedor y el viewport visual.
 *  Con el teclado abierto, `visualViewport` es quien sabe dónde termina la
 *  pantalla útil — el contenedor puede seguir midiendo como si no hubiera. */
export function visibleBottom(parent: HTMLElement | null): number {
  const vv = window.visualViewport
  const viewport = vv ? vv.offsetTop + vv.height : window.innerHeight
  return parent ? Math.min(parent.getBoundingClientRect().bottom, viewport) : viewport
}

/** Sube `el` al tope del contenedor scrolleable (con un margen de respiro). */
export function pinToTop(el: HTMLElement, margin = 12): void {
  const parent = scrollParentOf(el)
  if (!parent) return
  const delta = el.getBoundingClientRect().top - parent.getBoundingClientRect().top - margin
  parent.scrollTop += delta
}

/**
 * Ejecuta `align` ahora y cada vez que el viewport cambie mientras el efecto
 * viva. El caso que motiva esto: el foco dispara `align`, y ~300ms después el
 * teclado termina de abrir, el navegador re-centra el input y deshace el
 * alineado — el resize del teclado llega por `visualViewport`, y ahí se vuelve
 * a alinear. Devuelve el cleanup para usarse directo en un `useEffect`.
 */
export function keepAligned(align: () => void): () => void {
  const raf = requestAnimationFrame(align)
  const vv = window.visualViewport
  vv?.addEventListener('resize', align)
  window.addEventListener('resize', align)
  return () => {
    cancelAnimationFrame(raf)
    vv?.removeEventListener('resize', align)
    window.removeEventListener('resize', align)
  }
}
