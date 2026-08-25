import type { ReactNode } from 'react'
import { KrossIcon } from './KrossLogo'
import { useStore } from '../lib/store-context'
import { useNoPanelTheme } from '../lib/theme'

/**
 * El marco de las pantallas de acceso al panel: fondo, logo de la marca y la
 * tarjeta. Lo comparten el login y las dos pantallas de recuperación para que
 * pedir una contraseña nueva se vea como una continuación del login, no como
 * otra app.
 */
export default function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { store } = useStore()
  useNoPanelTheme()

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: store.logo_url ? '#fff' : 'transparent' }}>
            {store.logo_url ? <img src={store.logo_url} alt={store.nombre} className="w-full h-full object-cover" /> : <KrossIcon size={64} />}
          </div>
          <h1 className="font-black text-3xl tracking-tight" style={{ color: '#7DE8FF' }}>{store.nombre}</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(125,232,255,0.5)' }}>{subtitle}</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(125,232,255,0.15)', backdropFilter: 'blur(20px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Campo de la tarjeta: mismo alto, mismo borde y mismo foco en las tres pantallas. */
export function AuthField({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(125,232,255,0.7)' }}>{label}</label>
      <input
        {...input}
        className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(125,232,255,0.2)', color: '#fff' }}
      />
    </div>
  )
}

/** Botón principal de la tarjeta. */
export function AuthButton({ loading, children, ...button }: { loading?: boolean; children: ReactNode }
  & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...button} disabled={loading || button.disabled}
      className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
      style={{
        background: loading ? 'rgba(0,191,255,0.3)' : 'linear-gradient(135deg, #00BFFF, #7DE8FF)',
        color: '#060C1A',
      }}>
      {children}
    </button>
  )
}

/** Error del formulario, en el mismo lugar en las tres pantallas. */
export function AuthError({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-center" style={{ color: '#FF6B6B' }}>{children}</p>
}
