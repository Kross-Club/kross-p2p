import { useState, useEffect } from 'react'
import { ArrowDownToLine, Download, EllipsisVertical, X, Share, Plus } from 'lucide-react'
import { useStore } from '../lib/store-context'
import { useIsDesktop } from '../lib/use-desktop'

// True when the app is already running as an installed PWA
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

// ─── Cómo se instala, contado como una RECETA y no como botones ─────────────
//
// Estos pasos NO se pueden tocar: son el camino por el menú del navegador, que
// solo el comprador puede recorrer. Hasta el 08-set-2026 se dibujaban como
// pastillas rellenas con el color de la marca —idénticas al botón «Instalar»
// que tienen justo encima—, así que en iPhone la gente les daba clic y no
// pasaba nada. Una etiqueta que parece un botón y no lo es es peor que no
// tener ayuda: promete y falla.
//
// Ahora son una lista numerada. El número dice «paso», no «tócame»; el fondo
// es neutro; lo único destacado es la PALABRA EXACTA que hay que buscar en el
// menú, en negrita y con el ícono que la acompaña en pantalla.

/** Un paso de la receta: su número, y el texto con la palabra que se busca. */
function Paso({ n, dark, children }: { n: number; dark?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-left">
      <span
        className="shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center text-[10px] font-black mt-px"
        style={{
          background: dark ? 'rgba(255,255,255,0.16)' : '#E5E7EB',
          color: dark ? 'rgba(255,255,255,0.9)' : '#374151',
        }}
      >
        {n}
      </span>
      <span className="text-[11px] leading-snug" style={{ color: dark ? 'rgba(255,255,255,0.85)' : '#4B5563' }}>
        {children}
      </span>
    </li>
  )
}

/** La palabra tal cual sale en el menú de Safari o de Chrome, con su ícono.
 *  `whitespace-nowrap`: el ícono nunca se queda solo al final de un renglón. */
function Opcion({ icono, children, dark }: { icono?: React.ReactNode; children: React.ReactNode; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 font-bold whitespace-nowrap"
      style={{ color: dark ? '#fff' : '#111827', verticalAlign: '-0.15em' }}>
      {icono}{children}
    </span>
  )
}

/**
 * iPhone. En Safari no hay instalación programática: el camino es el menú, y
 * son CUATRO toques, no dos (08-set-2026, verificado en iOS 18). La versión
 * anterior decía «Compartir → Agregar a inicio» y se saltaba las dos que la
 * gente no adivina: que hoy Compartir vive dentro del `···` de la barra de
 * abajo, y que «Agregar a inicio» está más abajo en la hoja, a veces detrás de
 * «Ver más».
 */
export function IOSSteps({ dark }: { dark?: boolean }) {
  return (
    <ol className="mt-2 space-y-1.5 mx-auto max-w-[248px]">
      <Paso n={1} dark={dark}>
        Toca <Opcion dark={dark}>···</Opcion> en la barra de abajo
      </Paso>
      <Paso n={2} dark={dark}>
        Elige <Opcion dark={dark} icono={<Share size={12} />}>Compartir</Opcion>
      </Paso>
      <Paso n={3} dark={dark}>
        Baja y toca <Opcion dark={dark} icono={<Plus size={12} />}>Agregar a inicio</Opcion>
      </Paso>
      <Paso n={4} dark={dark}>
        Confirma con <Opcion dark={dark}>Agregar</Opcion>
      </Paso>
    </ol>
  )
}

/**
 * iPhone, en la confirmación del pedido: el VIDEO de los cuatro toques en vez
 * de la lista (08-set-2026). Grabado en un iPhone real, enseña lo que la lista
 * solo describía: dónde está el `···`, cómo se ve la hoja de Compartir y hasta
 * dónde hay que bajar para «Agregar a inicio». La lista sigue viva en
 * `IOSSteps` para la barra del panel y la tarjeta del chat, donde un video no
 * cabe, y acá en el `aria-label` para quien no lo ve.
 *
 * Por qué está armado así, y ninguna es opcional en iOS:
 *   · **H.264, no WebM/AV1**: Safari en iOS no reproduce otra cosa en <video>.
 *   · **`muted` + `playsInline` + `autoPlay`**: la única combinación con la que
 *     iOS arranca solo, sin abrir el reproductor a pantalla completa.
 *   · **`loop`**: quien se pierde a mitad lo vuelve a ver sin tocar nada.
 *   · **600×600 a CRF 28, `faststart`**: 340 KB —un tercio del original— con
 *     el índice al frente para que empiece antes de bajar entero. Solo se
 *     carga en iPhone, porque solo ahí se pinta.
 */
export function IOSInstallVideo() {
  return (
    <video
      src="/guia-instalar-iphone.mp4"
      poster="/guia-instalar-iphone.jpg"
      autoPlay muted loop playsInline preload="metadata"
      disablePictureInPicture disableRemotePlayback
      aria-label="Cómo instalar la app en iPhone: toca los tres puntos en la barra de abajo, elige Compartir, baja y toca Agregar a inicio, y confirma con Agregar."
      className="mt-2 mx-auto block w-full max-w-[260px] rounded-2xl border border-gray-200"
    />
  )
}

/**
 * Android, cuando Chrome no dio el aviso de instalar. Con las PALABRAS que el
 * comprador va a ver: Chrome no dice «Instalar app», dice **«Instalar y crear
 * acceso directo»** (07-set-2026). Enseñar una etiqueta que no existe manda a
 * buscar algo que no está, y quien no vive en apps abandona ahí.
 */
export function AndroidSteps({ dark }: { dark?: boolean }) {
  return (
    <ol className="mt-2 space-y-1.5 mx-auto max-w-[248px]">
      <Paso n={1} dark={dark}>
        Toca <Opcion dark={dark} icono={<EllipsisVertical size={12} />}>Menú</Opcion> arriba a la derecha
      </Paso>
      <Paso n={2} dark={dark}>
        Elige <Opcion dark={dark} icono={<ArrowDownToLine size={12} />}>Instalar y crear acceso directo</Opcion>
      </Paso>
    </ol>
  )
}

// Branded "install this app" prompt.
//  · floating (default): fixed bar, seller-oriented copy (Layout).
//  · inline: a card the parent mounts inside the chat, buyer-oriented copy.
// Fires onInstalled on a successful install so the caller can turn on push.
//
// La barra flotante NO se muestra en la PC: instalar la app existe para que el
// vendedor reciba pedidos, mensajes y llamadas con la pantalla apagada — eso es
// el celular. En escritorio solo tapaba la lista de chats con un aviso que no
// resuelve nada.
export default function InstallBanner({ inline = false, esRecojo = false, onInstalled }: {
  inline?: boolean
  /** Recoge en agencia: no hay puerta a la que salir. Lo que le sirve son los
   *  avisos del envío —la guía, la llegada, su clave—. */
  esRecojo?: boolean
  onInstalled?: () => void
}) {
  const { store } = useStore()
  const desktop = useIsDesktop()
  const [prompt, setPrompt] = useState<any>(() => (typeof window !== 'undefined' ? (window as any).__deferredInstallPrompt : null))
  const [isIOS, setIsIOS] = useState(false)
  const [show, setShow] = useState(false)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (isInstalled()) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)

    let t: ReturnType<typeof setTimeout> | undefined
    if (inline) {
      setShow(true)
    } else if (!sessionStorage.getItem('install-banner-dismissed')) {
      t = setTimeout(() => setShow(true), 3000)
    }

    // The prompt may have been captured globally in main.tsx before we mounted
    const ready = () => setPrompt((window as any).__deferredInstallPrompt)
    const handler = (e: Event) => {
      e.preventDefault()
      ;(window as any).__deferredInstallPrompt = e
      setPrompt(e)
      if (!inline) setShow(true)
    }
    const installed = () => { setShow(false); onInstalled?.() }
    window.addEventListener('install-prompt-ready', ready)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('install-prompt-ready', ready)
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [inline])

  const install = async () => {
    if (!prompt) { setHelp(true); return }
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    ;(window as any).__deferredInstallPrompt = null
    setPrompt(null)
    if (outcome === 'accepted') { setShow(false); onInstalled?.() }
  }

  const dismiss = () => {
    setShow(false)
    if (!inline) sessionStorage.setItem('install-banner-dismissed', '1')
  }

  if (!show || isInstalled()) return null
  if (!inline && desktop) return null

  const nombre = store.nombre
  const logo = store.logo_url || '/icon-192.png'
  const benefit = inline
    ? (esRecojo
        ? 'Recibe al instante los avisos de tu pedido: la guía, la llegada a la agencia y tu clave de recojo.'
        : 'Haz seguimiento a tu pedido en tiempo real y recibe un aviso cuando salga a tu puerta.')
    : 'Da seguimiento a tus clientes: recibe al instante los nuevos pedidos, mensajes y llamadas.'

  // ── Inline card (inside the buyer chat, never covers the input) ──
  if (inline) {
    return (
      <div className="mx-4 mt-2 rounded-2xl px-3 py-3 flex items-start gap-3"
        style={{ background: 'var(--surface)', border: '0.5px solid var(--brand)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <div className="w-11 h-11 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--brand)' }}>
          <img src={logo} alt={nombre} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 leading-tight">Instala {nombre}</p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: '#6B7280' }}>{benefit}</p>
          {isIOS
            ? <IOSSteps />
            : (
              <>
                <button onClick={install}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white"
                  style={{ background: 'var(--brand)' }}>
                  <Download size={13} /> Instalar app
                </button>
                {help && <AndroidSteps />}
              </>
            )}
        </div>
        <button onClick={dismiss} className="flex-shrink-0 p-1" style={{ color: '#C4C9CF' }}>
          <X size={16} />
        </button>
      </div>
    )
  }

  // ── Floating bar (seller panel) ──
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-safe"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-[430px] mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--brand)' }}>
            <img src={logo} alt={nombre} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm">Instala {nombre}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{benefit}</p>
            {isIOS
              ? <IOSSteps dark />
              : (
                <>
                  <button onClick={install}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
                    style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                    <Download size={13} /> Instalar app
                  </button>
                  {help && <AndroidSteps dark />}
                </>
              )}
          </div>
          <button onClick={dismiss} className="flex-shrink-0 p-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
