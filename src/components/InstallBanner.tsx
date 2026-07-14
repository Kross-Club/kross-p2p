import { useState, useEffect } from 'react'
import { Download, X, Share } from 'lucide-react'
import { useStore } from '../lib/store-context'

// True when the app is already running as an installed PWA
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

// Branded "install this app" prompt.
//  · floating (default): fixed bar at the bottom, self-shows after a delay.
//  · inline: a card the parent mounts where it wants (e.g. inside the chat,
//    so the bottom bar never covers the message input).
// On a successful install it fires onInstalled so the caller can turn on push.
export default function InstallBanner({ inline = false, onInstalled }: { inline?: boolean; onInstalled?: () => void }) {
  const { store } = useStore()
  const [prompt, setPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [show, setShow] = useState(false)

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

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      if (!inline) setShow(true)
    }
    const installed = () => { setShow(false); onInstalled?.() }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [inline])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') { setShow(false); onInstalled?.() }
  }

  const dismiss = () => {
    setShow(false)
    if (!inline) sessionStorage.setItem('install-banner-dismissed', '1')
  }

  if (!show || isInstalled()) return null

  const nombre = store.nombre
  const logo = store.logo_url || '/icon-192.png'
  const benefit = 'Haz seguimiento a tu pedido en tiempo real y recibe un aviso cuando salga a tu puerta.'
  const iosHelp = 'Toca Compartir y luego "Agregar a inicio" para instalar la app.'
  const chromeHelp = 'Toca el menú ⋮ de tu navegador y luego "Instalar app".'

  // ── Inline card (sits inside the chat, doesn't cover the input) ──
  if (inline) {
    return (
      <div className="mx-4 mt-2 rounded-2xl px-3 py-3 flex items-center gap-3"
        style={{ background: '#fff', border: '1.5px solid var(--brand)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <div className="w-11 h-11 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--brand)' }}>
          <img src={logo} alt={nombre} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 leading-tight">Instala {nombre}</p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: '#6B7280' }}>
            {prompt ? benefit : isIOS ? iosHelp : chromeHelp}
          </p>
          {prompt && (
            <button onClick={install}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white"
              style={{ background: 'var(--brand)' }}>
              <Download size={13} /> Instalar app
            </button>
          )}
        </div>
        {isIOS && !prompt && <Share size={18} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />}
        <button onClick={dismiss} className="flex-shrink-0 p-1 self-start" style={{ color: '#C4C9CF' }}>
          <X size={16} />
        </button>
      </div>
    )
  }

  // ── Floating bar (seller panel / fallback) ──
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
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {prompt ? benefit : isIOS ? iosHelp : chromeHelp}
            </p>
            {prompt && (
              <button onClick={install}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
                style={{ background: '#FFD400', color: '#111' }}>
                <Download size={13} /> Instalar app
              </button>
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
