import { useState, useEffect } from 'react'
import { Download, X, Share, Plus } from 'lucide-react'
import { useStore } from '../lib/store-context'
import { useIsDesktop } from '../lib/use-desktop'

// True when the app is already running as an installed PWA
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

// Small step-by-step illustration for iOS (no programmatic install there)
function IOSSteps({ dark }: { dark?: boolean }) {
  const fg = dark ? 'rgba(255,255,255,0.85)' : '#374151'
  const chip = dark ? 'rgba(255,255,255,0.12)' : 'var(--brand)'
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
        style={{ background: chip, color: dark ? '#fff' : '#fff' }}>
        <Share size={13} /> Compartir
      </span>
      <span style={{ color: fg }} className="text-xs font-black">→</span>
      <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
        style={{ background: chip, color: '#fff' }}>
        <Plus size={13} /> Agregar a inicio
      </span>
    </div>
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
export default function InstallBanner({ inline = false, onInstalled }: { inline?: boolean; onInstalled?: () => void }) {
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
    ? 'Haz seguimiento a tu pedido en tiempo real y recibe un aviso cuando salga a tu puerta.'
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
                {help && <p className="text-[10px] mt-1.5" style={{ color: '#9CA3AF' }}>Abre el menú ⋮ de tu navegador y elige "Instalar app".</p>}
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
                  {help && <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Abre el menú ⋮ de tu navegador y elige "Instalar app".</p>}
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
