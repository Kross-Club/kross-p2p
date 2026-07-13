import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { KrossIcon } from '../components/KrossLogo'
import { useStore } from '../lib/store-context'

export default function LoginPage() {
  const navigate = useNavigate()
  const { store } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }
    navigate('/vendedor/chats', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: store.logo_url ? '#fff' : 'transparent' }}>
            {store.logo_url ? <img src={store.logo_url} alt={store.nombre} className="w-full h-full object-cover" /> : <KrossIcon size={64} />}
          </div>
          <h1 className="font-black text-3xl tracking-tight" style={{ color: '#7DE8FF' }}>{store.nombre}</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(125,232,255,0.5)' }}>Panel de vendedor</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(125,232,255,0.15)', backdropFilter: 'blur(20px)' }}>
          <h2 className="font-black text-xl mb-1 text-white">Bienvenido</h2>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Ingresa con tu cuenta de vendedor
          </p>

          <form onSubmit={login} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(125,232,255,0.7)' }}>Correo</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="tu@correo.com"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(125,232,255,0.2)', color: '#fff' }}
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(125,232,255,0.7)' }}>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(125,232,255,0.2)', color: '#fff' }}
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-center" style={{ color: '#FF6B6B' }}>{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
              style={{
                background: loading ? 'rgba(0,191,255,0.3)' : 'linear-gradient(135deg, #00BFFF, #7DE8FF)',
                color: '#060C1A',
              }}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ¿Eres comprador?{' '}
              <a href="/acceso" className="font-bold" style={{ color: '#00BFFF' }}>Ver mis pedidos</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
