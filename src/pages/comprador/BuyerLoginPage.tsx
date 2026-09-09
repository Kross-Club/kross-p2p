import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KrossIcon } from '../../components/KrossLogo'
import Flotante from '../../components/Flotante'
import { useStore, isPlatformHost } from '../../lib/store-context'
import { guardarSesion } from '../../lib/sesion-comprador'
import { textoSobre } from '../../lib/contraste'
import {
  ESCENARIO, SITIOS_FLOTANTES, estiloValido, fondoDeMarca, imagenesPorSitio, vidrioDeMarca,
} from '../../lib/degradado'

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
//
// El fondo es de LA MARCA (09-set-2026, segunda pasada): el degradado de sus
// dos colores, con la inclinación que eligió en el panel. Estuvo unas horas
// sobre el ink de Kross y era la única pantalla del comprador que no llevaba su
// color; en la primera pantalla de una app white-label eso es justo lo que no
// puede pasar.
//
// Encima, una tarjeta de VIDRIO. El desenfoque solo no garantiza que se lea
// nada —deja pasar la claridad de lo de atrás—, así que el vidrio lleva su velo
// y su tinta decididos por contraste contra el degradado (`vidrioDeMarca`).
//
// Y detrás flotan los productos que subió la marca. Uno pasa POR DEBAJO de la
// tarjeta y por un costado: sin nada detrás, un vidrio no se distingue de un
// fondo plano. Sin imágenes subidas la pantalla queda igual de bien, solo más
// sobria — no se inventa ninguna.
//
// Sin el nombre repetido y sin la puerta del vendedor — quien vende entra por
// /login, y ofrecérselo acá a cada comprador solo confunde.

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
      <div className="min-h-dvh flex items-center justify-center px-6 text-center" style={{ background: 'var(--k-ink)' }}>
        <div className="max-w-[360px]">
          <div className="mx-auto mb-4 w-16 h-16"><KrossIcon size={64} /></div>
          <h1 className="font-black text-xl mb-2" style={{ color: 'var(--k-bone)' }}>Esta página es de cada marca</h1>
          <p className="text-sm" style={{ color: 'var(--k-text-2)' }}>
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
      <div className="min-h-dvh flex items-center justify-center px-6 text-center" style={{ background: 'var(--k-ink)' }}>
        <div className="max-w-[360px]">
          <div className="mx-auto mb-4 w-16 h-16"><KrossIcon size={64} /></div>
          <h1 className="font-black text-xl mb-2" style={{ color: 'var(--k-bone)' }}>Esta dirección no es de ninguna tienda</h1>
          <p className="text-sm" style={{ color: 'var(--k-text-2)' }}>
            Revisa el enlace que te compartió tu tienda — la dirección va como
            <b> tumarca.krossclub.app</b> y una letra distinta cae aquí.
          </p>
        </div>
      </div>
    )
  }

  const marca = store.color_primary || '#55C8F5'
  const tinta = textoSobre(marca)
  // El fondo: los dos colores de la marca, con su inclinación. La semilla del
  // ángulo «aleatorio» es el id de la tienda, así que es el mismo siempre.
  const fondo = fondoDeMarca(marca, store.color_dark || marca, estiloValido(store.gradient_style), store.id ?? store.slug ?? '')
  const vidrio = vidrioDeMarca(marca, store.color_dark || marca)
  // Cada casilla en SU sitio: el hueco no corre a la siguiente imagen.
  const flotantes = imagenesPorSitio(store.login_images)
  // Una sombra apenas perceptible: despega el PNG del degradado sin dibujarle
  // el rectángulo que se acaba de quitar. Más marcada sobre un fondo oscuro,
  // donde un logo de tinta clara se funde antes.
  const sombraDelLogo = {
    filter: vidrio.claro
      ? 'drop-shadow(0 6px 18px rgba(0,0,0,0.35))'
      : 'drop-shadow(0 6px 16px rgba(15,17,21,0.20))',
  }
  const etiqueta = { color: vidrio.tintaSuave }
  const campo = { background: vidrio.campo, border: vidrio.bordeCampo, color: vidrio.tinta }

  return (
    <div className="relative min-h-dvh overflow-hidden flex items-center justify-center px-4" style={{ background: fondo }}>

      {/* Los productos de la marca, meciéndose dentro de un escenario acotado y
          centrado sobre la tarjeta. `inset-0` con `m-auto` es lo que lo centra
          en los dos ejes; los topes hacen que en un teléfono ocupe la pantalla
          entera —como antes— y en un monitor se quede del tamaño de la
          composición en vez de estirarse hasta los bordes.
          `pointer-events: none`: una imagen que flota no puede comerse el toque
          de un botón. */}
      {flotantes.some(Boolean) && (
        <div className="absolute inset-0 m-auto w-full h-full pointer-events-none"
          style={{ maxWidth: ESCENARIO.ancho, maxHeight: ESCENARIO.alto }}>
          {flotantes.map((src, i) => src && <Flotante key={i} src={src} sitio={SITIOS_FLOTANTES[i]} />)}
        </div>
      )}

      <div className="relative w-full max-w-[360px]" style={{ zIndex: 2 }}>

        {/* La marca, arriba y sola: el logo apaisado si lo tiene —un lockup ya
            trae el nombre como la marca quiere que se lea—, si no el cuadrado.
            Sin el nombre escrito debajo: repetirlo lo dice dos veces y peor.

            Y va SIN placa (09-set-2026): el fondo ya es el color de la marca,
            así que el rectángulo de atrás solo recortaba un bloque plano sobre
            su propio color — justo el borde que un logo en PNG viene a no
            tener. Lo único que queda es una sombra muy suave, que es lo que
            despega un PNG transparente del degradado sin dibujarle una caja. */}
        <div className="flex justify-center mb-8">
          {store.logo_wide_url ? (
            <img src={store.logo_wide_url} alt={store.nombre}
              className="h-14 max-w-[240px] object-contain" style={sombraDelLogo} />
          ) : store.logo_url ? (
            <img src={store.logo_url} alt={store.nombre}
              className="w-20 h-20 object-contain" style={sombraDelLogo} />
          ) : (
            <KrossIcon size={64} />
          )}
        </div>

        <div className="rounded-3xl p-6" style={{
          background: vidrio.fondo,
          border: vidrio.borde,
          boxShadow: vidrio.sombra,
          // `-webkit-` incluido: es lo único que desenfoca en el Safari de un
          // iPhone, que es donde vive la mitad de estos compradores.
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        }}>

          {paso === 'dni' ? (
            <>
              <h2 className="font-black text-xl mb-1" style={{ color: vidrio.tinta }}>Mis pedidos</h2>
              <p className="text-sm mb-5" style={{ color: vidrio.tintaSuave }}>
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

                {error && <p className="text-xs font-semibold text-center" style={{ color: vidrio.claro ? 'var(--k-alert-fg)' : '#B91C1C' }}>{error}</p>}

                <button type="submit" disabled={loading || docNumber.length !== 8}
                  className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
                  style={{ background: marca, opacity: (loading || docNumber.length !== 8) ? 0.5 : 1, color: tinta }}>
                  {loading ? 'Enviando…' : 'Enviarme el código'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-black text-xl mb-1" style={{ color: vidrio.tinta }}>Revisa tu WhatsApp</h2>
              <p className="text-sm mb-5" style={{ color: vidrio.tintaSuave }}>
                Si el DNI está registrado, te enviamos un código de 6 dígitos a tu WhatsApp.
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

                {error && <p className="text-xs font-semibold text-center" style={{ color: vidrio.claro ? 'var(--k-alert-fg)' : '#B91C1C' }}>{error}</p>}

                <button type="submit" disabled={loading || codigo.length !== 6}
                  className="w-full py-3.5 rounded-2xl font-black text-sm mt-1 transition-all"
                  style={{ background: marca, opacity: (loading || codigo.length !== 6) ? 0.5 : 1, color: tinta }}>
                  {loading ? 'Entrando…' : 'Entrar'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4">
                <button type="button" onClick={() => { setPaso('dni'); setCodigo(''); setError('') }}
                  className="text-xs font-bold" style={{ color: vidrio.tintaSuave }}>
                  ← Cambiar DNI
                </button>
                <button type="button" disabled={espera > 0 || loading} onClick={() => pedirCodigo()}
                  className="text-xs font-bold underline disabled:opacity-40" style={{ color: vidrio.tinta }}>
                  {espera > 0 ? `Reenviar en ${espera}s` : 'Reenviar código'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
