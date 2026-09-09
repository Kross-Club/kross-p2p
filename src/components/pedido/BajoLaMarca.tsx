import type { ReactNode } from 'react'

// ─── El panel que la marca sostiene ──────────────────────────────────────────
//
// Las cuatro pantallas del comprador —«Mis pedidos», el chat, «Ver pedido» y
// la confirmación— empiezan con una franja del color de la marca y siguen en
// claro. Hasta el 09-set-2026 esa junta era un corte recto, o peor: en el chat
// la franja llevaba las esquinas redondeadas ABAJO, así que el claro trepaba
// por las esquinas y parecía que lo de abajo contenía a lo de arriba.
//
// Se da vuelta la curva: el panel claro entra CON las esquinas redondeadas
// arriba y metido bajo la franja, y el color queda en las muescas. Lo de
// arriba contiene a lo de abajo, que es como se lee un encabezado.
//
// El solape es igual al radio (24 px los dos): así la muesca cae entera dentro
// del color y no se parte a mitad de camino contra el fondo de la página.
// Quien lo use tiene que dejarle a su franja 24 px más de aire abajo — lo que
// el panel le come.
//
// ⚠️ El primer hijo NO puede traer margen arriba (`mt-*`): se colapsaría con el
// `-mt-6` del panel y el solape se perdería —el panel bajaría y la muesca se
// quedaría a medias—. Va como relleno (`pt-*`), que se ve igual. La excepción
// es el chat, que le pasa `flex`: un contenedor flex no colapsa márgenes.

export default function BajoLaMarca({ fondo, className = '', children }: {
  /** El claro del panel: el mismo de la página, para que no se vea la junta. */
  fondo: string
  /** Lo que necesite el sitio donde va: en el chat, ser la columna que crece. */
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative -mt-6 rounded-t-3xl ${className}`} style={{ background: fondo }}>
      {children}
    </div>
  )
}
