import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react'
import type { Direccion } from '../lib/fuera-de-vista'

// ─── Ir al pedido seleccionado ───────────────────────────────────────────────
//
// El borde marcado dice cuál es el pedido abierto, pero solo mientras se vea: el
// tablero desplaza en dos ejes y basta arrastrar un poco para perderlo.
//
// Está SIEMPRE que haya un pedido seleccionado en pantalla, y no solo cuando se
// pierde de vista. Vive en la barra de filtros, y un control que aparece y
// desaparece dentro de una barra se lee como un error de la barra: uno aprende
// dónde están las cosas y espera encontrarlas ahí. Lo que cambia es el ÉNFASIS
// —apagado mientras el pedido está a la vista, encendido y con la flecha del
// lado por donde se fue cuando no— así que sigue diciendo lo mismo sin moverse.

const FLECHA: Record<Direccion, typeof ArrowUp> = {
  arriba: ArrowUp, abajo: ArrowDown, izquierda: ArrowLeft, derecha: ArrowRight,
}

export default function PunteroAlPedido({ direccion, onIr }: {
  /** `null` = el pedido se ve. Si no, por dónde se fue. */
  direccion: Direccion | null
  onIr: () => void
}) {
  const Flecha = direccion ? FLECHA[direccion] : Crosshair
  const perdido = direccion !== null

  return (
    <button
      type="button"
      onClick={onIr}
      className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg text-[11px] transition-colors"
      style={perdido
        ? { background: 'var(--invert)', color: 'var(--invert-fg)', fontWeight: 700 }
        : { background: 'var(--surface-3)', color: 'var(--text-muted)', fontWeight: 500 }}
      title={perdido
        ? 'El pedido seleccionado quedó fuera de la pantalla — tócalo para centrarlo'
        : 'Centrar el pedido seleccionado'}
    >
      <Crosshair size={12} className="flex-shrink-0" />
      <span className="whitespace-nowrap">Ir al pedido seleccionado</span>
      {perdido && <Flecha size={12} className="flex-shrink-0" />}
    </button>
  )
}
