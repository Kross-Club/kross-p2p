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

          <div className="flex items-center justify-between gap-4 mb-10">
            <KrossLockup size={30} bajada />
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

/** Grilla de módulos del símbolo: unos pocos encendidos y una junta en lima. */
function ModuleGrid() {
  const COLS = 12
  const ROWS = 9
  // Unos pocos módulos encendidos, sin dibujar nada: la grilla del símbolo
  // respirando. La junta es una sola, como en el logo.
  const llenos = new Set([14, 15, 26, 31, 38, 39, 55, 56, 68, 74, 75, 87, 88, 99])
  const junta = 43                                      // el único en lima

  return (
    <div className="absolute inset-0 grid" aria-hidden
      style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
      {Array.from({ length: COLS * ROWS }, (_, i) => (
        <div key={i} style={{
          border: '0.5px solid var(--border)',
          background: i === junta ? 'var(--k-lime)' : llenos.has(i) ? 'var(--surface)' : 'transparent',
        }} />
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
