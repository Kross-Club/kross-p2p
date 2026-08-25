import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AuthShell, { AuthButton, AuthError, AuthField } from '../components/AuthShell'
import { isPlatformHost } from '../lib/store-context'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Se vuelve acá después de fijar una contraseña nueva. Sin este aviso, la
  // pantalla de login es idéntica a la de un enlace que no hizo nada.
  const justUpdated = params.get('actualizada') === '1'

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

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
    navigate('/vendedor/chats', { replace: true })
  }

  return (
    <AuthShell subtitle="Panel de vendedor">
      <h2 className="font-black text-xl mb-1 text-white">Bienvenido</h2>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Ingresa con tu cuenta de vendedor
      </p>

      {justUpdated && (
        <div className="rounded-2xl px-4 py-3 mb-4"
          style={{ background: 'rgba(0,191,255,0.10)', border: '1px solid rgba(125,232,255,0.25)' }}>
          <p className="text-xs font-bold" style={{ color: '#7DE8FF' }}>
            Contraseña actualizada. Ingresa con la nueva.
          </p>
        </div>
      )}

      <form onSubmit={login} className="flex flex-col gap-3">
        <AuthField label="Correo" type="email" value={email} required
          placeholder="tu@correo.com" autoComplete="email"
          onChange={e => setEmail(e.target.value)} />
        <AuthField label="Contraseña" type="password" value={password} required
          placeholder="••••••••" autoComplete="current-password"
          onChange={e => setPassword(e.target.value)} />

        {error && <AuthError>{error}</AuthError>}

        <AuthButton type="submit" loading={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </AuthButton>
      </form>

      <p className="text-center text-xs mt-4">
        <Link to="/recuperar" className="font-bold" style={{ color: '#00BFFF' }}>
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ¿Eres comprador?{' '}
          <a href="/acceso" className="font-bold" style={{ color: '#00BFFF' }}>Ver mis pedidos</a>
        </p>
      </div>
    </AuthShell>
  )
}
