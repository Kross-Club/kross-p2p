import type { ReactNode } from 'react'
import { KrossLockup } from './KrossLogo'
import { useStore } from '../lib/store-context'
import { useKrossTheme } from '../lib/theme'

/**
 * El marco de las pantallas de acceso al panel: lo comparten el login y las dos
 * de recuperación, para que pedir una contraseña nueva se vea como una
 * continuación del login y no como otra app.
 *
 * Es una superficie de KROSS, no de la marca (manual §10): va en ink, con el
 * lockup y el lima como único acento. La marca sí aparece —logo y nombre, a la
 * derecha del lockup— porque el vendedor tiene que saber a qué tienda entra,
 * pero no pinta la pantalla.
 */
export default function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { store } = useStore()
  useKrossTheme()
  const marca = store.nombre && store.nombre !== 'Kross' ? store : null

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--k-ink)' }}>

      {/* Columna del formulario */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10 min-w-0">
        <div className="w-full max-w-[420px] mx-auto lg:mx-0">

          <div className="flex items-center justify-between gap-4 mb-9">
            <KrossLockup size={64} bajada />
            {marca && (
              <span className="flex items-center gap-2 min-w-0">
                {marca.logo_url && (
                  <span className="w-7 h-7 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={marca.logo_url} alt={marca.nombre} className="w-full h-full object-cover" />
                  </span>
                )}
                <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{marca.nombre}</span>
              </span>
            )}
          </div>

          <p className="text-[11px] uppercase mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
            {subtitle}
          </p>

          {children}
        </div>
      </div>

      {/* Panel de marca: la grilla del símbolo, con una sola junta encendida.
          Es decoración con sentido —el mismo módulo del logo— y se va en
          pantallas chicas, donde el formulario necesita todo el ancho. */}
      <aside className="hidden lg:flex flex-col justify-end w-[46%] max-w-[720px] relative overflow-hidden"
        style={{ borderLeft: '0.5px solid var(--border)' }}>
        <ModuleGrid />
        {/* Velo para que el titular no compita con la grilla */}
        <div className="absolute inset-x-0 bottom-0 h-2/5" aria-hidden
          style={{ background: 'linear-gradient(to top, var(--k-ink) 35%, transparent)' }} />
        <div className="relative px-12 pb-12">
          <p className="text-2xl" style={{ color: 'var(--text)', fontWeight: 500 }}>La tecnología de tu tienda.</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Yape, Izipay, Shalom y Olva en una sola pantalla.
          </p>
        </div>
      </aside>
    </div>
  )
}

/**
 * El fondo del acceso: la grilla de módulos donde la K se arma sola, en bucle.
 *
 * No es un adorno genérico — es el símbolo del manual dibujado sobre la misma
 * grilla de 5×5 que lo define: primero el astil, luego los brazos, y al final
 * la junta en lima, que es la que cierra la letra. Alrededor, unos pocos
 * módulos respiran para que la grilla no se vea muerta.
 *
 * Las animaciones viven en index.css; acá solo se decide qué celda es qué y
 * en qué momento le toca.
 */
function ModuleGrid() {
  const COLS = 12
  const ROWS = 9
  const idx = (col: number, row: number) => row * COLS + col

  // Esquina donde arranca el símbolo dentro de la grilla grande. Una fila más
  // arriba del centro para que el pie del astil no caiga bajo el velo del
  // titular.
  const C = 4
  const R = 1

  // El mismo mapa del logo (§3.1), en orden de encendido: el astil de arriba
  // hacia abajo y después los dos brazos.
  const ASTIL = [0, 1, 2, 3, 4].map(r => idx(C, R + r))
  const BRAZOS = [idx(C + 3, R), idx(C + 2, R + 1), idx(C + 2, R + 3), idx(C + 3, R + 4)]
  const ORDEN = [...ASTIL, ...BRAZOS]
  const JUNTA = idx(C + 1, R + 2)

  const AMBIENTE = [14, 20, 26, 58, 71, 84, 93, 100, 105]

  return (
    <div className="absolute inset-0 grid" aria-hidden
      style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const turno = ORDEN.indexOf(i)
        const ambiente = AMBIENTE.indexOf(i)
        const esJunta = i === JUNTA

        const clase = esJunta ? 'k-cell k-joint'
          : turno >= 0 ? 'k-cell k-mod'
          : ambiente >= 0 ? 'k-cell k-amb'
          : 'k-cell'

        const retraso = esJunta ? 0.9 + ORDEN.length * 0.22
          : turno >= 0 ? 0.9 + turno * 0.22
          : ambiente >= 0 ? ambiente * 0.8
          : null

        return (
          <div key={i} className={clase}>
            {retraso !== null && <span className="k-fill" style={{ animationDelay: `${retraso}s` }} />}
          </div>
        )
      })}
    </div>
  )
}

/** Campo del formulario: mismo alto, mismo borde y mismo foco en las tres pantallas. */
export function AuthField({ label, action, ...input }: {
  label: string
  /** Enlace o botón al costado de la etiqueta (p. ej. "Olvidé mi contraseña"). */
  action?: ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</label>
        {action}
      </div>
      <input
        {...input}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:border-[var(--k-lime)]"
        style={{ background: 'var(--surface)', border: '0.5px solid var(--border-strong)', color: 'var(--text)' }}
      />
    </div>
  )
}

/** Botón principal. Lima con el único color de texto que el manual permite encima. */
export function AuthButton({ loading, children, ...button }: { loading?: boolean; children: ReactNode }
  & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...button} disabled={loading || button.disabled}
      className="w-full py-3.5 rounded-xl text-sm mt-1 transition-opacity disabled:opacity-60"
      style={{ background: 'var(--k-lime)', color: 'var(--k-on-lime)', fontWeight: 500 }}>
      {children}
    </button>
  )
}

/** Error del formulario, en el mismo lugar en las tres pantallas. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-center rounded-xl px-3 py-2"
      style={{ background: 'var(--danger-bg)', color: 'var(--danger-fg)', fontWeight: 500 }}>
      {children}
    </p>
  )
}
