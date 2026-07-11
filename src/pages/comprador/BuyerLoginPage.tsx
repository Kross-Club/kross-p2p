import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KrossIcon } from '../../components/KrossLogo'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string


export default function BuyerLoginPage() {
  const navigate = useNavigate()
  const [docNumber, setDocNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch(`${BASE}/buyer-login`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: 'DNI', document_number: docNumber }),
    })

    if (res.status === 404) {
      setError('No encontramos una cuenta con ese DNI. ¿Ya hiciste un pedido?')
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
    window.dispatchEvent(new Event('buyer-session-changed'))
    navigate('/mis-pedidos', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl overflow-hidden">
            <KrossIcon size={64} />
          </div>
          <h1 className="font-black text-3xl tracking-tight" style={{ color: '#7DE8FF' }}>kross</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(125,232,255,0.5)' }}>Mis pedidos</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(125,232,255,0.15)', backdropFilter: 'blur(20px)' }}>
          <h2 className="font-black text-xl mb-1 text-white">¡Hola!</h2>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Ingresa tu DNI para ver tus pedidos
          </p>

          <form onSubmit={login} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(125,232,255,0.7)' }}>
                Tu DNI
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={docNumber}
                onChange={e => setDocNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                placeholder="Tus 8 dígitos"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none font-mono tracking-widest"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(125,232,255,0.2)', color: '#fff' }}
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-center" style={{ color: '#FF6B6B' }}>{error}</p>
            )}

            <button type="submit" disabled={loading || docNumber.length !== 8}
              className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
              style={{
                background: (loading || docNumber.length !== 8) ? 'rgba(0,191,255,0.3)' : 'linear-gradient(135deg, #00BFFF, #7DE8FF)',
                color: '#060C1A',
              }}>
              {loading ? 'Buscando…' : 'Ver mis pedidos'}
            </button>
          </form>

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ¿Eres vendedor?{' '}
              <a href="/login" className="font-bold" style={{ color: '#00BFFF' }}>Ingresar aquí</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
