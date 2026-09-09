import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KrossIcon } from '../../components/KrossLogo'
import { useStore, isPlatformHost } from '../../lib/store-context'
import { guardarSesion } from '../../lib/sesion-comprador'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const cabeceras = { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }

// ─── Entrar a «Mis pedidos» ─────────────────────────────────────────────────
//
// Dos pasos: el DNI, y el código de 6 dígitos que llega al WhatsApp guardado
// para ese DNI. Antes bastaba el DNI, y con el DNI de otro se veían sus
// pedidos, su dirección y su clave de recojo (ver `_shared/acceso-comprador.ts`).
//
// El paso 2 no promete nada sobre esa persona: dice «si el DNI está
// registrado», y nunca si existe o a qué número fue. Decirlo convertiría esta
// pantalla en un buscador de quién le compra a la marca.
//
// Si la tienda todavía no tiene su plantilla aprobada, el servidor responde
// `modo: 'directo'` y se entra como antes — con el agujero abierto, que es
// mejor que dejar a esa marca sin sus pedidos. Se cierra aprobando la plantilla.

/** Segundos antes de poder pedir otro código. */
const REENVIO_S = 30

export default function BuyerLoginPage() {
  const navigate = useNavigate()
  const { store, loading: storeLoading } = useStore()
  const [paso, setPaso] = useState<'dni' | 'codigo'>('dni')
  const [docNumber, setDocNumber] = useState('')
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  /** Entra con lo que devolvió el servidor y se va a sus pedidos. */
  const entrar = (d: { session_token?: string | null; buyer: unknown; sessions: unknown; welcome?: unknown }) => {
    guardarSesion({
      session_token: d.session_token ?? null,
      buyer: d.buyer as never,
      sessions: (d.sessions ?? []) as never,
    })
    if (d.welcome) { try { localStorage.setItem('welcome_reward', JSON.stringify(d.welcome)) } catch { /* */ } }
    navigate('/mis-pedidos', { replace: true })
  }

  const pedirCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BASE}/buyer-code-request`, {
        method: 'POST', headers: cabeceras,
        body: JSON.stringify({ document_number: docNumber, store_id: store.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError('No pudimos continuar. Intenta de nuevo.'); return }

      // La tienda todavía no manda códigos: se entra como antes.
      if (d.modo === 'directo') {
        const r2 = await fetch(`${BASE}/buyer-login`, {
          method: 'POST', headers: cabeceras,
          body: JSON.stringify({ document_type: 'DNI', document_number: docNumber, store_id: store.id }),
        })
        if (r2.status === 404) { setError('No encontramos una cuenta con ese DNI. ¿Ya hiciste un pedido?'); return }
        if (!r2.ok) { setError('Error al conectar. Intenta de nuevo.'); return }
        entrar(await r2.json())
        return
      }

      setPaso('codigo')
      setEspera(REENVIO_S)
    } catch {
      setError('Error al conectar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BASE}/buyer-code-verify`, {
        method: 'POST', headers: cabeceras,
        body: JSON.stringify({ document_number: docNumber, store_id: store.id, code: codigo }),
      })
      if (!res.ok) {
        // Un solo error para todo: vencido, gastado o equivocado. Distinguirlos
        // le diría al que está probando si va por buen camino.
        setError('Ese código no es válido o ya venció. Pide uno nuevo.')
        setCodigo('')
        return
      }
      entrar(await res.json())
    } catch {
      setError('Error al conectar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // No hay login de clientes en el dominio de la plataforma (krossclub.app).
  // Cada cliente usa la app de SU marca (marca.krossclub.app).
  if (isPlatformHost()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
        <div className="max-w-[360px]">
          <div className="mx-auto mb-4 w-16 h-16"><KrossIcon size={64} /></div>
          <h1 className="font-black text-xl text-white mb-2">Esta página es de cada marca</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Para ver tus pedidos, entra desde el enlace que te compartió tu tienda
            (por ejemplo <b>tumarca.krossclub.app</b>), no desde krossclub.app.
          </p>
          <a href="/login" className="inline-block mt-5 text-xs font-bold" style={{ color: 'var(--brand)' }}>
            ¿Eres administrador de Kross? Ingresar aquí
          </a>
        </div>
      </div>
    )
  }

  // Subdominio que NO corresponde a ninguna tienda (una letra cambiada, una
  // marca dada de baja): decirlo. Antes se pintaba el login igual, con la
  // tienda sin resolver, y todo DNI moría en "no existe ese usuario" — un
  // error que culpa al comprador por un problema de la dirección.
  if (!storeLoading && !store.id) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
        <div className="max-w-[360px]">
          <div className="mx-auto mb-4 w-16 h-16"><KrossIcon size={64} /></div>
          <h1 className="font-black text-xl text-white mb-2">Esta dirección no es de ninguna tienda</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Revisa el enlace que te compartió tu tienda — la dirección va como
            <b> tumarca.krossclub.app</b> y una letra distinta cae aquí.
          </p>
        </div>
      </div>
    )
  }

  const etiqueta = { color: 'rgba(125,232,255,0.7)' }
  const campo = {
    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(125,232,255,0.2)', color: '#fff',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: store.logo_url ? '#fff' : 'transparent' }}>
            {store.logo_url ? <img src={store.logo_url} alt={store.nombre} className="w-full h-full object-cover" /> : <KrossIcon size={64} />}
          </div>
          <h1 className="font-black text-3xl tracking-tight" style={{ color: 'var(--brand)' }}>{store.nombre}</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(125,232,255,0.5)' }}>Mis pedidos</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(125,232,255,0.15)', backdropFilter: 'blur(20px)' }}>

          {paso === 'dni' ? (
            <>
              <h2 className="font-black text-xl mb-1 text-white">¡Hola!</h2>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Ingresa tu DNI y te enviamos un código por WhatsApp
              </p>

              <form onSubmit={pedirCodigo} className="flex flex-col gap-3">
                <div>
                  <label htmlFor="dni" className="text-xs font-bold mb-1 block" style={etiqueta}>Tu DNI</label>
                  <input
                    id="dni" type="tel" inputMode="numeric" autoComplete="off" enterKeyHint="send"
                    value={docNumber}
                    onChange={e => setDocNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    required placeholder="Tus 8 dígitos"
                    className="w-full px-4 py-3 rounded-2xl text-base outline-none font-mono tracking-widest"
                    style={campo}
                  />
                </div>

                {error && <p className="text-xs font-semibold text-center" style={{ color: '#FF6B6B' }}>{error}</p>}

                <button type="submit" disabled={loading || docNumber.length !== 8}
                  className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
                  style={{ background: 'var(--brand)', opacity: (loading || docNumber.length !== 8) ? 0.5 : 1, color: '#060C1A' }}>
                  {loading ? 'Enviando…' : 'Enviarme el código'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-black text-xl mb-1 text-white">Revisa tu WhatsApp</h2>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Si el DNI está registrado, te enviamos un código de 6 dígitos al número de tu cuenta.
              </p>

              <form onSubmit={verificar} className="flex flex-col gap-3">
                <div>
                  <label htmlFor="codigo" className="text-xs font-bold mb-1 block" style={etiqueta}>Tu código</label>
                  <input
                    id="codigo" type="tel" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="go"
                    autoFocus
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required placeholder="6 dígitos"
                    className="w-full px-4 py-3 rounded-2xl text-2xl text-center outline-none font-mono tracking-[0.4em]"
                    style={campo}
                  />
                </div>

                {error && <p className="text-xs font-semibold text-center" style={{ color: '#FF6B6B' }}>{error}</p>}

                <button type="submit" disabled={loading || codigo.length !== 6}
                  className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
                  style={{ background: 'var(--brand)', opacity: (loading || codigo.length !== 6) ? 0.5 : 1, color: '#060C1A' }}>
                  {loading ? 'Entrando…' : 'Entrar'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4">
                <button type="button" onClick={() => { setPaso('dni'); setCodigo(''); setError('') }}
                  className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  ← Cambiar DNI
                </button>
                <button type="button" disabled={espera > 0 || loading} onClick={() => pedirCodigo()}
                  className="text-xs font-bold disabled:opacity-40" style={{ color: 'var(--brand)' }}>
                  {espera > 0 ? `Reenviar en ${espera}s` : 'Reenviar código'}
                </button>
              </div>
            </>
          )}

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ¿Eres vendedor?{' '}
              <a href="/login" className="font-bold" style={{ color: 'var(--brand)' }}>Ingresar aquí</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
