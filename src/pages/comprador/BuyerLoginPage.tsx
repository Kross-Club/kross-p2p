import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export default function BuyerLoginPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch(`${BASE}/buyer-login`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })

    if (res.status === 404) {
      setError('No encontramos una cuenta con ese número. ¿Ya hiciste un pedido?')
      setLoading(false)
      return
    }

    if (!res.ok) {
      setError('Error al conectar. Intenta de nuevo.')
      setLoading(false)
      return
    }

    const { buyer, sessions } = await res.json()
    localStorage.setItem('buyer_session', JSON.stringify({ buyer, sessions }))
    navigate('/mis-pedidos', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #55C8F5 0%, #FFD400 100%)' }}>
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}>
            <img src="/icon-192.png" alt="Kross" className="w-12 h-12 rounded-xl" />
          </div>
          <h1 className="text-white font-black text-3xl tracking-tight">kross</h1>
          <p className="text-white/80 text-sm mt-1">Mis pedidos</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: '#fff' }}>
          <h2 className="font-black text-xl mb-1" style={{ color: '#111' }}>¡Hola!</h2>
          <p className="text-sm mb-5" style={{ color: '#888' }}>
            Ingresa tu número de WhatsApp para ver tus pedidos
          </p>

          <form onSubmit={login} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#555' }}>
                Número de WhatsApp
              </label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 transition-all"
                style={{ border: '2px solid #eee', background: '#fafafa' }}>
                <span className="text-sm font-bold" style={{ color: '#555' }}>🇵🇪 +51</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  required
                  placeholder="987 654 321"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: '#111' }}
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-500 text-center">{error}</p>
            )}

            <button type="submit" disabled={loading || phone.length < 9}
              className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-opacity"
              style={{ background: '#55C8F5', color: '#fff', opacity: (loading || phone.length < 9) ? 0.5 : 1 }}>
              {loading ? 'Buscando…' : 'Ver mis pedidos'}
            </button>
          </form>

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid #f0f0f0' }}>
            <p className="text-center text-xs" style={{ color: '#bbb' }}>
              ¿Eres vendedor?{' '}
              <a href="/login" className="font-bold" style={{ color: '#55C8F5' }}>Ingresar aquí</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
