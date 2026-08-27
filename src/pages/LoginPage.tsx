import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, setPersistSession } from '../lib/supabase'
import AuthShell, { AuthButton, AuthError, AuthField } from '../components/AuthShell'
import { isPlatformHost } from '../lib/store-context'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Marcada por defecto: el caso normal es el celular o la laptop del dueño.
  // Desmarcarla manda la sesión a sessionStorage y se muere al cerrar la pestaña.
  const [recordar, setRecordar] = useState(true)

  // Se vuelve acá después de fijar una contraseña nueva. Sin este aviso, la
  // pantalla de login es idéntica a la de un enlace que no hizo nada.
  const justUpdated = params.get('actualizada') === '1'

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    setPersistSession(recordar)   // decide dónde se guarda ANTES de entrar
    const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    // On the platform host (krossclub.app) only the super admin may enter. Brand
    // admins/team must use their own subdomain (marca.krossclub.app).
    if (isPlatformHost()) {
      const { data: me } = await supabase.from('sellers')
        .select('is_super_admin').eq('auth_user_id', auth.user?.id).maybeSingle()
      if (!me?.is_super_admin) {
        await supabase.auth.signOut()
        setError('Ingresa desde el sitio de tu marca (tumarca.krossclub.app), no desde krossclub.app.')
        setLoading(false)
        return
      }
    }
    navigate('/vendedor/pedidos', { replace: true })
  }

  return (
    <AuthShell subtitle="Panel de vendedor">
      <h2 className="text-3xl mb-1.5" style={{ color: 'var(--text)', fontWeight: 500 }}>Entra a tu tienda</h2>
      <p className="text-sm mb-7" style={{ color: 'var(--text-muted)' }}>
        Tus pedidos, cobros y entregas de hoy.
      </p>

      {justUpdated && (
        <div className="rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--ok-bg-soft)', border: '0.5px solid var(--ok-border)' }}>
          <p className="text-xs" style={{ color: 'var(--ok-fg)', fontWeight: 500 }}>
            Contraseña actualizada. Ingresa con la nueva.
          </p>
        </div>
      )}

      <form onSubmit={login} className="flex flex-col gap-4">
        <AuthField label="Correo" type="email" value={email} required
          placeholder="tu@correo.com" autoComplete="email"
          onChange={e => setEmail(e.target.value)} />

        <AuthField label="Contraseña" type="password" value={password} required
          placeholder="••••••••" autoComplete="current-password"
          onChange={e => setPassword(e.target.value)}
          action={
            <Link to="/recuperar" className="text-xs underline underline-offset-2" style={{ color: 'var(--text-muted)' }}>
              Olvidé mi contraseña
            </Link>
          } />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)}
            className="w-4 h-4 rounded" style={{ accentColor: 'var(--k-lime)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Mantener sesión iniciada</span>
        </label>

        {error && <AuthError>{error}</AuthError>}

        <AuthButton type="submit" loading={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </AuthButton>
      </form>

      <p className="text-xs mt-7" style={{ color: 'var(--text-faint)' }}>
        ¿Aún no tienes cuenta?{' '}
        <a href="/contacto" className="underline underline-offset-2" style={{ color: 'var(--k-lime)' }}>Solicita tu demo</a>
      </p>

      <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
        ¿Eres comprador?{' '}
        <a href="/acceso" className="underline underline-offset-2" style={{ color: 'var(--text-muted)' }}>Ver mis pedidos</a>
      </p>
    </AuthShell>
  )
}
