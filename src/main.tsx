import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store-context'

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
      <App />
    </StoreProvider>
  </StrictMode>,
)
