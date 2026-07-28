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

// On a branded subdomain we DON'T know the brand yet on first paint. Showing the
// Kross default there causes a visible "Kross → brand" flash. So we start neutral
// (no name/logo) and, better still, seed from a per-slug cache so returning
// visitors see their brand instantly with no flash at all.
const NEUTRAL_STORE: Store = {
  id: null, slug: null, nombre: '', logo_url: null,
  color_primary: '#55C8F5', color_dark: '#060C1A',
}

function cachedStore(slug: string): Store | null {
  try {
    const raw = localStorage.getItem(`store:${slug}`)
    return raw ? (JSON.parse(raw) as Store) : null
  } catch { return null }
}

const StoreContext = createContext<{ store: Store; loading: boolean }>({ store: DEFAULT_STORE, loading: true })

// Resolve the tenant slug from the host: marca.kross.app → "marca".
// Main/preview/localhost hosts return null → Kross default branding.
function resolveSlug(): string | null {
  if (typeof window === 'undefined') return null
  // allow ?store=slug for local testing — must run before the localhost
  // short-circuit or it's unreachable on http://localhost:5173
  const q = new URLSearchParams(window.location.search).get('store')
  if (q) return q
  const host = window.location.hostname
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  // <slug>.localhost → dev con subdominio (Chrome resuelve *.localhost solo)
  if (host.endsWith('.localhost')) return host.split('.')[0]
  const parts = host.split('.')
  // <slug>.kross.app  → 3 parts, first is the slug (skip www / vercel previews)
  if (parts.length >= 3 && !['www', 'app', 'kross-p2p'].includes(parts[0])) {
    // ignore *.vercel.app previews
    if (host.endsWith('vercel.app')) return null
    return parts[0]
  }
  return null
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const slug = resolveSlug()
  const initial = slug ? (cachedStore(slug) ?? NEUTRAL_STORE) : DEFAULT_STORE
  const [store, setStore] = useState<Store>(initial)
  const [loading, setLoading] = useState(!!slug && !cachedStore(slug))

  useEffect(() => {
    applyBranding(initial)
    if (!slug) { setLoading(false); return }
    supabase.from('stores').select('id, slug, nombre, logo_url, color_primary, color_dark').eq('slug', slug).eq('active', true).maybeSingle()
      .then(({ data }) => {
        const s = (data as Store) ?? DEFAULT_STORE
        setStore(s); applyBranding(s)
        setLoading(false)
        try { localStorage.setItem(`store:${slug}`, JSON.stringify(s)) } catch { /* ignore */ }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (s.nombre) {
      document.title = s.nombre
      // iOS uses this (not the manifest) for the home-screen name
      setMeta('apple-mobile-web-app-title', s.nombre)
    }
    setMeta('theme-color', s.color_dark)
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

// True on the platform host (krossclub.app / main / localhost) — i.e. NOT a brand
// subdomain. Used to keep brand buyers/admins off the platform host.
export function isPlatformHost(): boolean {
  return resolveSlug() === null
}
