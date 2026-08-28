import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// ─── Un filtro donde se puede marcar más de uno ──────────────────────────────
//
// Los tres desplegables de la barra —vendedor, producto, pago— eran de a uno, y
// la pregunta de verdad casi nunca es de a uno: "los de Kevin y Milagros", "las
// dos fajas", "los que adelantaron y los que pagaron todo". Con un valor único
// eso obligaba a mirar dos veces y sumar de cabeza, que es justo lo que un
// filtro existe para evitar.
//
// Es un `<select>` de mentira y no uno de verdad porque `<select multiple>` se
// pinta como una caja con scroll que ocupa cinco filas y no dice cuántas cosas
// hay marcadas sin abrirla. Acá el botón CERRADO ya lo dice —"2 productos",
// "Kevin"— que es lo que uno necesita leer de pasada para no creer que la
// tienda dejó de vender.
//
// Nada marcado = todos. No hace falta una casilla de "Todos": desmarcar la
// última es exactamente lo mismo, y una casilla que se apaga sola al marcar
// otra confunde más de lo que ayuda.

export interface OpcionMultiple {
  valor: string
  label: string
}

export default function FiltroMultiple({ titulo, todos, opciones, elegidos, onCambio, unidad }: {
  /** Qué se está filtrando, para el lector de pantalla: "producto", "pago". */
  titulo: string
  /** Cómo se lee con nada marcado: "Todos los productos". */
  todos: string
  opciones: OpcionMultiple[]
  elegidos: string[]
  onCambio: (elegidos: string[]) => void
  /** Para el resumen de varios: "2 productos", "3 del equipo". */
  unidad: string
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const id = useId()

  // Cerrar al tocar fuera y con Escape. Sin esto, un panel abierto tapa la
  // columna de al lado y no hay forma obvia de quitarlo.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const alternar = (valor: string) => {
    onCambio(elegidos.includes(valor) ? elegidos.filter(v => v !== valor) : [...elegidos, valor])
  }

  // Con uno marcado se lee el nombre; con varios, el número. Listar tres
  // nombres en un botón de nueve caracteres los corta a todos.
  const resumen = elegidos.length === 0
    ? todos
    : elegidos.length === 1
      ? opciones.find(o => o.valor === elegidos[0])?.label ?? todos
      : `${elegidos.length} ${unidad}`

  const puesto = elegidos.length > 0

  return (
    <div className="relative flex-shrink-0" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        aria-haspopup="true"
        aria-label={`Filtrar por ${titulo}`}
        className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 outline-none max-w-[10.5rem]"
        style={{
          background: 'var(--surface-3)',
          color: puesto ? 'var(--brand)' : 'var(--text)',
          border: `0.5px solid ${puesto ? 'var(--brand)' : 'var(--border)'}`,
          fontWeight: puesto ? 700 : 400,
        }}
      >
        <span className="truncate">{resumen}</span>
        <ChevronDown size={12} className="flex-shrink-0" style={{ opacity: 0.6 }} />
      </button>

      {abierto && (
        <div
          role="group"
          aria-label={titulo}
          className="absolute z-30 mt-1 min-w-[13rem] max-h-[16rem] overflow-y-auto rounded-xl py-1"
          style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
        >
          {opciones.map(o => {
            const marcado = elegidos.includes(o.valor)
            return (
              <label
                key={o.valor}
                className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs"
                style={{ color: 'var(--text)' }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  name={id}
                  checked={marcado}
                  onChange={() => alternar(o.valor)}
                />
                {/* La casilla se dibuja a mano: la nativa no toma los tokens del
                    tema y en oscuro se ve como un cuadrado blanco pegado. */}
                <span
                  aria-hidden
                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: marcado ? 'var(--brand)' : 'transparent',
                    border: `1px solid ${marcado ? 'var(--brand)' : 'var(--border-strong)'}`,
                  }}
                >
                  {/* `--on-brand` y no blanco: en el panel el acento es lima y
                      encima del lima solo va el verde oscuro del manual. */}
                  {marcado && <Check size={10} strokeWidth={3} style={{ color: 'var(--on-brand)' }} />}
                </span>
                <span className="truncate">{o.label}</span>
              </label>
            )
          })}

          {puesto && (
            <button
              type="button"
              onClick={() => onCambio([])}
              className="w-full text-left px-2.5 py-1.5 text-[11px] font-bold"
              style={{ color: 'var(--text-muted)', borderTop: '0.5px solid var(--border)' }}
            >
              {todos}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
