import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { supabase } from '../../lib/supabase'
import { llamarAlta, tokenDeAltaGuardado, olvidarTokenDeAlta } from '../../lib/alta-api'
import { olvidarReferido } from '../../lib/referido'
import { APEX } from '../../lib/dominio'

// ─── `/bienvenido` — el minuto después de pagar (§54) ────────────────────────
//
// El comerciante acaba de soltar $67 y Stripe lo devolvió acá. Esta pantalla
// hace dos cosas y nada más: **esperar a que su tienda exista** y **dejarle
// elegir su contraseña**.
//
// Esperar hace falta porque la tienda no la crea esta pantalla: la crea
// `stripe-webhook` cuando Stripe confirma el cobro, y ese evento llega cuando
// llega —normalmente en un segundo, a veces en diez—. Crearla desde acá sería
// regalar una tienda a quien navegue a esta URL a mano.
//
// ⚠️ **Sin correos de por medio.** Un enlace de acceso al correo es una cosa
// más que puede caer en spam, y el peor momento para hacer esperar a alguien es
// el minuto siguiente a cobrarle. Si pierde esta pestaña, el camino de vuelta es
// «recuperar contraseña» con el correo con el que pagó — que ya es su cuenta.
//
// Quién es lo dice el token de su alta: por `localStorage` (lo puso `/empezar`)
// o por el `?cs=` que Stripe sustituye en la URL de retorno. Hacen falta los
// dos: Stripe no sabe devolver el `client_reference_id`, y el storage puede
// estar bloqueado.

/** Cada cuánto se vuelve a preguntar si ya existe la tienda. */
const CADA_MS = 2000
/** Cuánto se insiste antes de decirle que mire su correo. Un minuto es mucho
 *  más de lo que tarda un webhook sano, y es poco para quedarse mirando. */
const HASTA_MS = 60_000

type Fase = 'esperando' | 'lista' | 'clave_puesta' | 'tarda' | 'perdido'

interface Estado {
  estado: string
  slug?: string
  marca?: string
  email?: string | null
  clave_puesta?: boolean
}

export default function BienvenidoPage() {
  const [params] = useSearchParams()
  const cs = params.get('cs') ?? params.get('session_id') ?? ''
  // Leído UNA vez, en el inicializador: `localStorage` es un sistema externo y
  // consultarlo en cada render es impuro. Además no puede cambiar mientras esta
  // pantalla vive — es lo que dejó `/empezar` antes de saltar a Stripe.
  const [token] = useState(() => tokenDeAltaGuardado() ?? '')

  // Sin ninguna de las dos pistas no hay nada que esperar: no sabemos quién es.
  // Se decide acá y no en el efecto para que la primera pintada ya sea la
  // correcta, en vez de enseñar un spinner que se corrige solo.
  const [fase, setFase] = useState<Fase>(() => (!token && !cs ? 'perdido' : 'esperando'))
  const [datos, setDatos] = useState<Estado | null>(null)
  // Se arranca en el EFECTO y no acá: `Date.now()` en el cuerpo del componente
  // se vuelve a evaluar en cada render, y el reloj de la espera empezaría de
  // cero cada vez que llega una respuesta.
  const desde = useRef(0)

  const preguntar = useCallback(async (): Promise<boolean> => {
    const r = await llamarAlta<Estado>({ action: 'estado', token, checkout_session_id: cs })
    if (!r.ok) return false
    const d = r.data
    setDatos(d)
    if (d.estado === 'CREADA') {
      setFase(d.clave_puesta ? 'clave_puesta' : 'lista')
      return true
    }
    return false
  }, [token, cs])

  useEffect(() => {
    if (!token && !cs) return   // ya quedó en 'perdido' desde la primera pintada

    desde.current = Date.now()
    let vivo = true
    let id: ReturnType<typeof setTimeout>
    const vuelta = async () => {
      if (!vivo) return
      const listo = await preguntar()
      if (!vivo || listo) return
      if (Date.now() - desde.current > HASTA_MS) { setFase('tarda'); return }
      id = setTimeout(() => { void vuelta() }, CADA_MS)
    }
    void vuelta()
    return () => { vivo = false; clearTimeout(id) }
  }, [token, cs, preguntar])

  return (
    <PublicLayout>
      <div className="max-w-[560px] mx-auto px-5 py-16 md:py-24">
        {fase === 'esperando' && <Esperando />}
        {fase === 'lista' && <ElegirClave token={token} cs={cs} datos={datos} />}
        {fase === 'clave_puesta' && <YaEstaba slug={datos?.slug} />}
        {(fase === 'tarda' || fase === 'perdido') && <Atascado email={datos?.email} />}
      </div>
    </PublicLayout>
  )
}

function Esperando() {
  return (
    <>
      <h1 className="text-[32px] md:text-[42px] leading-[1.08]">Gracias, ya estamos creando tu tienda</h1>
      <p className="mt-4 text-base leading-relaxed flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" /> Esto toma unos segundos. No cierres esta página.
      </p>
    </>
  )
}

function ElegirClave({ token, cs, datos }: { token: string; cs: string; datos: Estado | null }) {
  const [clave, setClave] = useState('')
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState('')

  const entrar = async () => {
    setYendo(true)
    setError('')
    const r = await llamarAlta<{ email?: string; slug?: string }>({
      action: 'clave', token, checkout_session_id: cs, password: clave,
    })
    if (!r.ok || !r.data?.email) {
      setError(r.data?.error ?? 'No pudimos guardar tu contraseña.')
      setYendo(false)
      return
    }

    // Se entra de una vez: pedirle que vuelva a teclear lo que acaba de
    // escribir, en otra pantalla, sería cobrarle dos veces el mismo esfuerzo.
    const { error: eAuth } = await supabase.auth.signInWithPassword({
      email: r.data.email, password: clave,
    })

    // El alta terminó: el token ya no sirve y el referido ya está pegado a la
    // tienda. Dejarlos haría que el siguiente que use este navegador arrastre
    // un alta que no es suya.
    olvidarTokenDeAlta()
    olvidarReferido()

    if (eAuth) {
      // La contraseña SÍ quedó puesta; lo que falló fue el ingreso. Se le manda
      // a la puerta de su marca en vez de dejarlo pensando que perdió el pago.
      window.location.href = `https://${r.data.slug}.${APEX}/login`
      return
    }
    window.location.href = `https://${r.data.slug}.${APEX}/vendedor/pedidos`
  }

  return (
    <>
      <h1 className="text-[32px] md:text-[42px] leading-[1.08] flex items-center gap-3">
        <Check size={28} style={{ color: 'var(--ok-fg)' }} /> Tu tienda está lista
      </h1>
      <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>{datos?.marca}</strong> vive en{' '}
        <strong className="tabular" style={{ color: 'var(--text)' }}>{datos?.slug}.{APEX}</strong>.
        Elige una contraseña y entra.
      </p>

      <label className="block mt-9">
        <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
          Tu contraseña
        </span>
        <input
          type="password"
          value={clave}
          onChange={e => { setClave(e.target.value); setError('') }}
          autoFocus
          minLength={6}
          maxLength={72}
          autoComplete="new-password"
          className="mt-2 w-full px-4 py-3.5 rounded-2xl text-base"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </label>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>
        Mínimo 6 caracteres. Entrarás con {datos?.email ?? 'el correo con el que pagaste'}.
      </p>

      {error && <p className="mt-5 text-[13px]" style={{ color: 'var(--danger-fg)' }}>{error}</p>}

      <button
        type="button"
        onClick={() => void entrar()}
        disabled={clave.length < 6 || yendo}
        className="mt-8 w-full px-6 py-4 rounded-2xl text-sm k-cta disabled:opacity-40"
      >
        {yendo ? 'Entrando…' : 'Entrar a mi tienda'}
      </button>
    </>
  )
}

function YaEstaba({ slug }: { slug?: string }) {
  return (
    <>
      <h1 className="text-[32px] md:text-[42px] leading-[1.08]">Tu tienda ya está creada</h1>
      <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Y ya elegiste tu contraseña. Entra desde{' '}
        <a href={`https://${slug}.${APEX}/login`} className="underline" style={{ color: 'var(--text)' }}>
          {slug}.{APEX}
        </a>.
      </p>
    </>
  )
}

/** Cuando el webhook tarda más de lo razonable, o cuando esta pantalla se abrió
 *  sin ninguna pista de quién es. En los dos casos la salida es la misma, y es
 *  importante que la diga con todas sus letras: **su pago no se perdió**. */
function Atascado({ email }: { email?: string | null }) {
  return (
    <>
      <h1 className="text-[32px] md:text-[42px] leading-[1.08]">Tu pago está confirmado</h1>
      <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Estamos terminando de crear tu tienda. Te llega un aviso en cuanto esté lista
        {email ? <> a <strong style={{ color: 'var(--text)' }}>{email}</strong></> : null}, y
        puedes entrar con «Recuperar contraseña» usando el correo con el que pagaste.
      </p>
      <p className="mt-4 text-[13px]" style={{ color: 'var(--text-faint)' }}>
        Si pasan unos minutos y no ves nada, escríbenos desde <a href="/contacto" className="underline">Contacto</a>{' '}
        con el correo que usaste.
      </p>
    </>
  )
}
