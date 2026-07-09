import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

// Detects if already installed as PWA
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isInstalled()) return
    if (sessionStorage.getItem('install-banner-dismissed')) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)

    if (ios) {
      // Show iOS instructions after 3s
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }

    // Chrome/Android: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setShow(false)
  }

  const dismiss = () => {
    setShow(false)
    sessionStorage.setItem('install-banner-dismissed', '1')
  }

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-safe"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-[430px] mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0"
            style={{ background: '#55C8F5' }}>
            <img src="/icon-192.png" alt="Kross" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm">Instala Kross</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {isIOS
                ? 'Toca el botón compartir  y luego "Agregar a inicio" para recibir notificaciones'
                : 'Instala la app para recibir notificaciones de llamadas y mensajes'}
            </p>
            {!isIOS && (
              <button onClick={install}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
                style={{ background: '#FFD400', color: '#111' }}>
                <Download size={13} />
                Instalar app
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
