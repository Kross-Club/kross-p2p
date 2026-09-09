import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { hostConSlug } from './enlaces'
import { supabase } from './supabase'
import { textoSobre } from './contraste'

export interface Store {
  id: string | null
  slug: string | null
  nombre: string
  logo_url: string | null
  /** El apaisado (§47 del esquema): encabeza la pantalla del pedido. Si falta,
   *  se cae al cuadrado con el nombre escrito al lado. */
  logo_wide_url?: string | null
  color_primary: string
  /** El SECUNDARIO de la marca (§49): hace degradado con el primario y es lo
   *  que pinta el acceso del comprador. La columna conserva el nombre viejo. */
  color_dark: string
  /** Cómo se inclina ese degradado. Ver `lib/degradado.ts`. */
  gradient_style?: string | null
  /** Hasta tres PNG que flotan en `/acceso`. */
  login_images?: string[] | null
  /** Número visible de la marca (`stores.wa_display_phone`). La pantalla final
   *  del checkout lo ofrece como "llama a" — un teléfono es el respaldo de quien
   *  no va a volver a la app. Opcional: la caché por slug de antes no lo trae. */
  wa_display_phone?: string | null
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

// Las columnas de siempre y las del bloque §49, aparte.
const CAMPOS = 'id, slug, nombre, logo_url, logo_wide_url, color_primary, color_dark, wa_display_phone'
const CAMPOS_49 = 'gradient_style, login_images'

/**
 * La tienda de un subdominio, pidiendo primero las columnas nuevas.
 *
 * ⚠️ Si el SQL del bloque §49 todavía no se corrió, PostgREST no devuelve una
 * fila sin esas columnas: devuelve un ERROR, y `data` llega en `null`. Sin este
 * respaldo, un despliegue del front antes que el SQL —y el front sale solo al
 * mergear— dejaría a TODAS las marcas pintadas con el celeste genérico de
 * Kross, que es peor que no tener el degradado. Así el orden deja de importar:
 * mientras falte el SQL se ve como antes, y el día que se corra aparece.
 */
async function traerTienda(columna: 'slug' | 'slug_anterior', slug: string): Promise<Store | null> {
  const pedir = (campos: string) =>
    supabase.from('stores').select(campos).eq(columna, slug).eq('active', true).maybeSingle()
  const conNuevas = await pedir(`${CAMPOS}, ${CAMPOS_49}`)
  if (!conNuevas.error) return (conNuevas.data as unknown as Store) ?? null
  const { data } = await pedir(CAMPOS)
  return (data as unknown as Store) ?? null
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const slug = resolveSlug()
  const initial = slug ? (cachedStore(slug) ?? NEUTRAL_STORE) : DEFAULT_STORE
  const [store, setStore] = useState<Store>(initial)
  const [loading, setLoading] = useState(!!slug && !cachedStore(slug))

  useEffect(() => {
    applyBranding(initial)
    if (!slug) { setLoading(false); return }
    traerTienda('slug', slug)
      .then(async data => {
        // El subdominio no resuelve a ninguna tienda: puede ser uno VIEJO, de
        // antes de que la marca se mudara (§47). Los enlaces ya mandados por
        // SMS y WhatsApp lo llevan, así que en vez de enseñarle al comprador la
        // marca genérica de Kross, se le lleva al subdominio nuevo con su misma
        // ruta — su pedido, su guía, lo que estuviera abriendo.
        if (!data) {
          const destino = (await traerTienda('slug_anterior', slug))?.slug
          const host = destino ? hostConSlug(window.location.hostname, destino) : null
          if (host) {
            const { protocol, pathname, search, hash } = window.location
            window.location.replace(`${protocol}//${host}${pathname}${search}${hash}`)
            return
          }
        }
        const s = data ?? DEFAULT_STORE
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
    // La barra del navegador va del color PRIMARIO (§49). Iba del segundo, que
    // se llamaba «fondo oscuro» y se podía dar por oscuro; ahora es el
    // secundario y una marca puede ponerlo blanco. El primario es el color que
    // encabeza todas las pantallas del comprador, así que es el que hace juego.
    setMeta('theme-color', s.color_primary)
    if (s.logo_url) {
      setLink('apple-touch-icon', s.logo_url)
      setLink('icon', s.logo_url)
    }
    const root = document.documentElement
    // El color de la MARCA pinta lo que ve el comprador. `--brand` se deriva
    // de acá en index.css: dentro del panel del vendedor gana el lima de Kross,
    // porque esa pantalla es la herramienta de Kross, no la tienda.
    root.style.setProperty('--store-brand', s.color_primary)
    root.style.setProperty('--store-brand-dark', s.color_dark)
    // El segundo color dejó de ser «oscuro» (§49): ahora es el secundario y
    // puede ser claro. El botón de la web pública se escribía siempre en
    // blanco, así que sobre un secundario claro quedaba ilegible. La tinta se
    // decide por contraste, igual que en el ticket y en la cabecera del chat.
    root.style.setProperty('--store-brand-dark-fg', textoSobre(s.color_dark))
  } catch { /* ignore */ }
}

export const useStore = () => useContext(StoreContext)

// True on the platform host (krossclub.app / main / localhost) — i.e. NOT a brand
// subdomain. Used to keep brand buyers/admins off the platform host.
export function isPlatformHost(): boolean {
  return resolveSlug() === null
}
