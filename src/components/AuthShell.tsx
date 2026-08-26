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
      <aside className="hidden lg:flex flex-col justify-end w-[46%] max-w-[720px] relative overflow-hidden k-panel"
        style={{ borderLeft: '0.5px solid var(--border)' }}>
        <ModuleGrid />
        {/* Velo para que el titular no compita con la grilla */}
        <div className="absolute inset-x-0 bottom-0 h-2/5" aria-hidden
          style={{ background: 'linear-gradient(to top, var(--k-ink) 35%, transparent)' }} />
        <div className="relative px-12 pb-12">
          <p className="text-2xl" style={{ color: 'var(--text)', fontWeight: 500 }}>La tecnología de tu tienda.</p>
          {/* `balance` reparte las líneas para que no quede una palabra sola
              colgando al final. */}
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)', textWrap: 'balance' }}>
            Productos, cobros con Yape, envíos con Shalom, chats, llamadas y facturas. Todo en un solo lugar.
          </p>
        </div>
      </aside>
    </div>
  )
}

/**
 * El fondo del acceso: la K se arma sola sobre la grilla de módulos, en bucle.
 *
 * No es un adorno genérico — es el símbolo del manual dibujado sobre la misma
 * grilla que lo define: primero el astil, luego los brazos, y al final la
 * junta en lima, que es la que cierra la letra.
 *
 * El módulo es CUADRADO (§3.1: la K se construye sobre una grilla de 5×5
 * módulos iguales). Por eso el tablero mide un número entero de módulos en vez
 * de estirarse con el panel, y las líneas del fondo se pintan con el mismo
 * paso: así los bloques caen exactamente sobre la grilla.
 */
function ModuleGrid() {
  // Coordenadas dentro del tablero (columna, fila), 1-indexadas como CSS grid.
  // Es el mapa del logo: astil, brazos y junta.
  const ASTIL = [1, 2, 3, 4, 5].map(fila => ({ col: 3, fila }))
  const BRAZOS = [{ col: 6, fila: 1 }, { col: 5, fila: 2 }, { col: 5, fila: 4 }, { col: 6, fila: 5 }]
  const ORDEN = [...ASTIL, ...BRAZOS]
  const JUNTA = { col: 4, fila: 3 }

  // Unos pocos módulos alrededor, respirando. No dibujan nada: dan textura.
  const AMBIENTE = [
    { col: 1, fila: 6 }, { col: 8, fila: 2 }, { col: 2, fila: 3 },
    { col: 9, fila: 5 }, { col: 7, fila: 7 }, { col: 1, fila: 1 },
  ]

  return (
    <div className="k-tablero" aria-hidden>
      {ORDEN.map(({ col, fila }, i) => (
        <span key={`k${i}`} className="k-cuadro k-mod" style={{ gridColumn: col, gridRow: fila }}>
          <span className="k-fill" style={{ animationDelay: `${0.9 + i * 0.22}s` }} />
        </span>
      ))}

      <span className="k-cuadro k-joint" style={{ gridColumn: JUNTA.col, gridRow: JUNTA.fila }}>
        <span className="k-fill" style={{ animationDelay: `${0.9 + ORDEN.length * 0.22}s` }} />
      </span>

      {AMBIENTE.map(({ col, fila }, i) => (
        <span key={`a${i}`} className="k-cuadro k-amb" style={{ gridColumn: col, gridRow: fila }}>
          <span className="k-fill" style={{ animationDelay: `${i * 0.8}s` }} />
        </span>
      ))}
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
