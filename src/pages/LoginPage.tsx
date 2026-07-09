import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
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
      style={{ background: 'linear-gradient(135deg, #55C8F5 0%, #863bff 100%)' }}>
      <div className="w-full max-w-[360px]">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
            <img src="/icon-192.png" alt="Kross" className="w-12 h-12 rounded-xl" />
          </div>
          <h1 className="text-white font-black text-3xl tracking-tight">kross</h1>
          <p className="text-white/70 text-sm mt-1">Panel de vendedor</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: '#fff' }}>
          <h2 className="font-black text-xl mb-1" style={{ color: '#111' }}>Bienvenido</h2>
          <p className="text-sm mb-5" style={{ color: '#888' }}>Ingresa con tu cuenta de vendedor</p>

          <form onSubmit={login} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#555' }}>Correo</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="tu@correo.com"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none border-2 transition-all"
                style={{ border: '2px solid #eee', background: '#fafafa' }}
                onFocus={e => e.target.style.borderColor = '#55C8F5'}
                onBlur={e => e.target.style.borderColor = '#eee'}
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#555' }}>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none border-2 transition-all"
                style={{ border: '2px solid #eee', background: '#fafafa' }}
                onFocus={e => e.target.style.borderColor = '#55C8F5'}
                onBlur={e => e.target.style.borderColor = '#eee'}
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-500 text-center">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-opacity"
              style={{ background: '#55C8F5', color: '#fff', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: '#bbb' }}>
            ¿Eres comprador? Usa el link de tu pedido.
          </p>
        </div>
      </div>
    </div>
  )
}
