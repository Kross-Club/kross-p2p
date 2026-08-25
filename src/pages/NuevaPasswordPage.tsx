import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AuthShell, { AuthButton, AuthError, AuthField } from '../components/AuthShell'
import { clearSellerCache, setActingSeller } from '../lib/seller-session'
import {
  MIN_PASSWORD, RECOVERY_PATH, openedWithLink, passwordProblem,
  type RecoveryLink,
} from '../lib/auth/password-recovery'

type Estado = 'validando' | 'listo' | 'invalido' | 'guardando'

const SIN_ENLACE = 'Abre esta pantalla desde el enlace que te llegó por correo.'

/**
 * Canjea el enlace del correo por una sesión, que es lo que autoriza el cambio
 * de contraseña. Hay tres formas según la plantilla y el flujo del proyecto, y
 * se soportan las tres: la sesión en el hash (flujo por defecto), el `code` de
 * PKCE y el `token_hash` (el único que funciona si el correo se abre en otro
 * dispositivo).
 */
async function canjear(link: RecoveryLink): Promise<{ ok: true } | { ok: false; message: string }> {
  const fallo = async (message: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    // supabase-js también procesa el enlace por su cuenta (`detectSessionInUrl`).
    // Si nos ganó de mano, la sesión ya está abierta y el canje "fallido" no
    // significa nada: lo que importa es si hay sesión.
    const { data } = await supabase.auth.getSession()
    return data.session ? { ok: true } : { ok: false, message }
  }

  switch (link.kind) {
    case 'expired':
      return { ok: false, message: link.message }
    case 'tokens': {
      const { error } = await supabase.auth.setSession({
        access_token: link.accessToken, refresh_token: link.refreshToken,
      })
      return error ? fallo('El enlace ya venció o se usó. Pide uno nuevo.') : { ok: true }
    }
    case 'code': {
      const { error } = await supabase.auth.exchangeCodeForSession(link.code)
      return error ? fallo('El enlace ya venció o se usó. Pide uno nuevo.') : { ok: true }
    }
    case 'otp': {
      const { error } = await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash })
      return error ? fallo('El enlace ya venció o se usó. Pide uno nuevo.') : { ok: true }
    }
    case 'none':
      return fallo(SIN_ENLACE)
  }
}

/** Traduce el error de Auth al guardar. */
function mensajeAlGuardar(code: string | undefined, message: string): string {
  if (code === 'same_password') return 'Esa es la contraseña que ya tenías. Elige una distinta.'
  if (code === 'weak_password') return 'Esa contraseña es fácil de adivinar. Usa una más larga.'
  if (/session|jwt|token/i.test(code ?? message)) return 'El enlace ya venció. Pide uno nuevo.'
  return 'No pudimos guardar la contraseña. Intenta de nuevo.'
}

/**
 * Paso 2 de la recuperación: fijar la contraseña nueva.
 *
 * Al terminar se cierra la sesión y se vuelve al login. El enlace del correo
 * abre una sesión de recuperación, y entrar al panel con ella se saltaría la
 * regla del host de plataforma que sí aplica el login (en krossclub.app solo
 * entra el super admin). Además, escribirla una vez para entrar confirma que
 * la contraseña quedó donde la persona cree.
 */
export default function NuevaPasswordPage() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>('validando')
  const [linkError, setLinkError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    canjear(openedWithLink()).then(r => {
      if (!vivo) return
      if (r.ok) {
        // Fuera el token de la URL: queda en el historial y en lo que se
        // comparte al copiar la dirección.
        window.history.replaceState(null, '', RECOVERY_PATH)
        setEstado('listo')
      } else {
        setLinkError(r.message)
        setEstado('invalido')
      }
    })
    return () => { vivo = false }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const problema = passwordProblem(password, confirm)
    if (problema) { setError(problema); return }

    setEstado('guardando')
    setError('')
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      setError(mensajeAlGuardar(authError.code, authError.message))
      setEstado('listo')
      return
    }

    // La sesión de recuperación no sirve para operar el panel: se cierra y se
    // entra de nuevo, igual que en el logout del panel.
    setActingSeller(null)
    clearSellerCache()
    await supabase.auth.signOut()
    navigate('/login?actualizada=1', { replace: true })
  }

  if (estado === 'validando') {
    return (
      <AuthShell subtitle="Panel de vendedor">
        <div className="flex items-center justify-center py-6">
          <div className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: 'rgba(125,232,255,0.2)', borderTopColor: '#00BFFF' }} />
        </div>
      </AuthShell>
    )
  }

  if (estado === 'invalido') {
    return (
      <AuthShell subtitle="Panel de vendedor">
        <h2 className="font-black text-xl mb-1 text-white">Este enlace ya no sirve</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{linkError}</p>
        <Link to="/recuperar" className="block text-center w-full py-3.5 rounded-2xl font-black text-sm mt-5"
          style={{ background: 'linear-gradient(135deg, #00BFFF, #7DE8FF)', color: '#060C1A' }}>
          Pedir un enlace nuevo
        </Link>
        <p className="text-center text-xs mt-4">
          <Link to="/login" className="font-bold" style={{ color: '#00BFFF' }}>Volver al ingreso</Link>
        </p>
      </AuthShell>
    )
  }

  const guardando = estado === 'guardando'

  return (
    <AuthShell subtitle="Panel de vendedor">
      <h2 className="font-black text-xl mb-1 text-white">Crea tu contraseña</h2>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Con esta contraseña vas a entrar al panel desde ahora. Mínimo {MIN_PASSWORD} caracteres.
      </p>

      <form onSubmit={guardar} className="flex flex-col gap-3">
        {/* El error se borra al escribir: si no, "no coinciden" sigue en
            pantalla mientras la persona ya está corrigiendo el campo. */}
        <AuthField label="Contraseña nueva" type={ver ? 'text' : 'password'} value={password}
          required autoFocus placeholder="••••••••" autoComplete="new-password"
          onChange={e => { setPassword(e.target.value); setError('') }} />
        <AuthField label="Repítela" type={ver ? 'text' : 'password'} value={confirm}
          required placeholder="••••••••" autoComplete="new-password"
          onChange={e => { setConfirm(e.target.value); setError('') }} />

        {/* Se escribe a ciegas y dos veces: poder verla evita el tercer intento. */}
        <button type="button" onClick={() => setVer(v => !v)}
          className="text-xs font-bold self-start" style={{ color: '#00BFFF' }}>
          {ver ? 'Ocultar contraseña' : 'Ver contraseña'}
        </button>

        {error && <AuthError>{error}</AuthError>}

        <AuthButton type="submit" loading={guardando}>
          {guardando ? 'Guardando…' : 'Guardar y entrar'}
        </AuthButton>
      </form>
    </AuthShell>
  )
}
