import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
