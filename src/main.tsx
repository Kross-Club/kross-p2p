import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store-context'
import { CarritoProvider } from './lib/carrito'
import { RECOVERY_PATH, strayRecoveryLanding } from './lib/auth/password-recovery'

// El enlace de recuperación tendría que aterrizar en `/nueva-contrasena`, pero
// si su `redirectTo` no está en la lista blanca de Auth, Supabase lo ignora y
// devuelve al *Site URL* —la raíz, sin la ruta—, con la sesión igual en el
// hash. Ahí el enlace parecía no hacer nada: la home veía una sesión válida y
// mandaba al panel, saltándose la pantalla de cambiar la contraseña.
//
// Se corrige la URL ANTES de montar React, no en un efecto: la home redirige
// en cuanto resuelve la sesión y esa carrera se pierde. El token no se pierde
// al limpiar la URL — la pantalla lo lee de la foto que guardó el módulo.
if (strayRecoveryLanding(window.location.pathname)) {
  window.history.replaceState(null, '', RECOVERY_PATH)
}

// Register the service worker globally (all pages, buyer + seller) so push
// notifications are delivered and shown even when the PWA is in the background
// or fully closed. Registering it only on the chat page made background push
// unreliable because the push subscription wasn't always tied to an active SW.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => { reg.update().catch(() => {}) })
      .catch(() => {})
  })
}

// Capture the install prompt as early as possible (it often fires before any
// React component mounts). Stash it so InstallBanner can offer a 1-click button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as any).__deferredInstallPrompt = e
  window.dispatchEvent(new Event('install-prompt-ready'))
})
window.addEventListener('appinstalled', () => {
  ;(window as any).__deferredInstallPrompt = null
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      {/* El carrito de la web pública vive por encima del router: así el globo
          del header mantiene la cuenta al navegar entre páginas. */}
      <CarritoProvider>
        <App />
      </CarritoProvider>
    </StoreProvider>
  </StrictMode>,
)
