import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export interface Store {
  id: string | null
  slug: string | null
  nombre: string
  logo_url: string | null
  color_primary: string
  color_dark: string
}

const DEFAULT_STORE: Store = {
  id: null, slug: null, nombre: 'Kross', logo_url: null,
  color_primary: '#55C8F5', color_dark: '#060C1A',
}

const StoreContext = createContext<{ store: Store; loading: boolean }>({ store: DEFAULT_STORE, loading: true })

// Resolve the tenant slug from the host: marca.kross.app → "marca".
// Main/preview/localhost hosts return null → Kross default branding.
function resolveSlug(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  const parts = host.split('.')
  // <slug>.kross.app  → 3 parts, first is the slug (skip www / vercel previews)
  if (parts.length >= 3 && !['www', 'app', 'kross-p2p'].includes(parts[0])) {
    // ignore *.vercel.app previews
    if (host.endsWith('vercel.app')) return null
    return parts[0]
  }
  // allow ?store=slug for local testing
  const q = new URLSearchParams(window.location.search).get('store')
  return q || null
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(DEFAULT_STORE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const slug = resolveSlug()
    if (!slug) { applyBranding(DEFAULT_STORE); setLoading(false); return }
    supabase.from('stores').select('id, slug, nombre, logo_url, color_primary, color_dark').eq('slug', slug).eq('active', true).maybeSingle()
      .then(({ data }) => {
        const s = (data as Store) ?? DEFAULT_STORE
        setStore(s); applyBranding(s)
        setLoading(false)
      })
  }, [])

  return <StoreContext.Provider value={{ store, loading }}>{children}</StoreContext.Provider>
}

function setMeta(name: string, content: string) {
  let m = document.querySelector(`meta[name="${name}"]`)
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m) }
  m.setAttribute('content', content)
}
function setLink(rel: string, href: string) {
  let l = document.querySelector(`link[rel="${rel}"]`)
  if (!l) { l = document.createElement('link'); l.setAttribute('rel', rel); document.head.appendChild(l) }
  l.setAttribute('href', href)
}

function applyBranding(s: Store) {
  try {
    document.title = s.nombre
    setMeta('theme-color', s.color_dark)
    // iOS uses these (not the manifest) for the home-screen icon & name
    setMeta('apple-mobile-web-app-title', s.nombre)
    if (s.logo_url) {
      setLink('apple-touch-icon', s.logo_url)
      setLink('icon', s.logo_url)
    }
    const root = document.documentElement
    root.style.setProperty('--brand', s.color_primary)
    root.style.setProperty('--brand-dark', s.color_dark)
  } catch { /* ignore */ }
}

export const useStore = () => useContext(StoreContext)
