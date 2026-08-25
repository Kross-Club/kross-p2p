import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AuthShell, { AuthButton, AuthError, AuthField } from '../components/AuthShell'
import { normalizeEmail, recoveryRedirectUrl, sendErrorMessage } from '../lib/auth/password-recovery'

/**
 * Paso 1 de la recuperación: pedir el enlace por correo.
 *
 * La pantalla NUNCA dice si el correo tiene cuenta o no. Un formulario público
 * que responde "ese correo no existe" es una lista de correos válidos servida a
 * cualquiera; y para quien sí es del equipo, el mensaje único no le quita nada:
 * el enlace le llega igual.
 */
export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pedirEnlace = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const destino = normalizeEmail(email)
    const { error: authError } = await supabase.auth.resetPasswordForEmail(destino, {
      // Vuelve al MISMO subdominio desde el que se pidió: el panel es de la
      // marca, y mandar a todos a krossclub.app sacaría al vendedor de la suya.
      redirectTo: recoveryRedirectUrl(window.location.origin),
    })

    setLoading(false)
    if (authError) { setError(sendErrorMessage(authError.status, authError.code)); return }
    setSentTo(destino)
  }

  if (sentTo) {
    return (
      <AuthShell subtitle="Panel de vendedor">
        <h2 className="font-black text-xl mb-1 text-white">Revisa tu correo</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Si <b style={{ color: 'rgba(255,255,255,0.8)' }}>{sentTo}</b> tiene una cuenta de
          vendedor, ahí está el enlace para crear una contraseña nueva.
        </p>

        <div className="rounded-2xl px-4 py-3 mt-4"
          style={{ background: 'rgba(0,191,255,0.10)', border: '1px solid rgba(125,232,255,0.25)' }}>
          <p className="text-xs" style={{ color: 'rgba(125,232,255,0.85)' }}>
            El enlace vence en una hora y sirve una sola vez. Si no lo ves, mira en
            spam o correo no deseado.
          </p>
        </div>

        <button onClick={() => { setSentTo(''); setEmail('') }}
          className="w-full mt-4 text-xs font-bold" style={{ color: '#00BFFF' }}>
          Probar con otro correo
        </button>

        <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Link to="/login" className="font-bold" style={{ color: '#00BFFF' }}>Volver al ingreso</Link>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Panel de vendedor">
      <h2 className="font-black text-xl mb-1 text-white">Recuperar contraseña</h2>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Escribe el correo de tu cuenta y te mandamos un enlace para crear una nueva.
      </p>

      <form onSubmit={pedirEnlace} className="flex flex-col gap-3">
        <AuthField label="Correo" type="email" value={email} required autoFocus
          placeholder="tu@correo.com" autoComplete="email"
          onChange={e => setEmail(e.target.value)} />

        {error && <AuthError>{error}</AuthError>}

        <AuthButton type="submit" loading={loading}>
          {loading ? 'Enviando…' : 'Enviarme el enlace'}
        </AuthButton>
      </form>

      <p className="text-center text-xs mt-4">
        <Link to="/login" className="font-bold" style={{ color: '#00BFFF' }}>Volver al ingreso</Link>
      </p>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ¿Eres comprador? Tu app no usa contraseña:{' '}
          <a href="/acceso" className="font-bold" style={{ color: '#00BFFF' }}>entra con tu DNI</a>
        </p>
      </div>
    </AuthShell>
  )
}
