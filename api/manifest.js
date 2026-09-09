// Vercel serverless function — serves a per-brand PWA manifest.
// Linked from index.html as <link rel="manifest" href="/api/manifest">.
// It reads the Host header, resolves which brand it belongs to and returns its
// name/icons/colors so the PWA installs with the BRAND's identity, not Kross.
//
// Dos formas de llegar acá, y las dos tienen que dar el mismo manifiesto
// (§50): `marca.krossclub.app` se busca por SLUG, y el dominio propio de una
// marca —`monoshop.pe`— por DOMINIO. Si el segundo cayera en el manifiesto de
// Kross, la app instalada desde el dominio propio se llamaría «Kross» y
// llevaría nuestro ícono: la instalación es justo donde una marca blanca no
// puede filtrarse.
//
// Las reglas viven en `src/lib/dominio.ts`, pero esto corre en el runtime de
// Vercel y no puede importar TypeScript del bundle, así que la parte que
// necesita está copiada abajo. Es corta y no cambia seguido; si cambia allá,
// cambia acá.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY

const APEX = 'krossclub.app'

/** Cómo buscar la marca de este host: por slug, por dominio propio, o nada. */
function comoResolver(host = '') {
  const h = String(host).toLowerCase().split(':')[0].replace(/\.+$/, '')
  if (!h || h === 'localhost' || /^\d+(\.\d+)*$/.test(h)) return null
  if (h.endsWith('.localhost')) return { por: 'slug', valor: h.split('.')[0] }
  if (h.endsWith('vercel.app')) return null
  if (h === APEX || h === `www.${APEX}`) return null
  if (h.endsWith(`.${APEX}`)) {
    const sub = h.slice(0, -(APEX.length + 1))
    if (sub.includes('.') || ['www', 'app'].includes(sub)) return null
    return { por: 'slug', valor: sub }
  }
  return { por: 'dominio', valor: h }
}

// Manual de marca §4: el ink es el fondo de todo lo de Kross.
const KROSS = {
  nombre: 'Kross', color_primary: '#D4FF4F', color_dark: '#0F1115', logo_url: null,
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const donde = comoResolver(host)

  let store = KROSS
  if (donde && SUPABASE_URL && ANON) {
    const columna = donde.por === 'dominio' ? 'custom_domain' : 'slug'
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/stores?${columna}=eq.${encodeURIComponent(donde.valor)}&active=eq.true&select=nombre,logo_url,color_primary,color_dark&limit=1`,
        { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
      )
      if (r.ok) {
        const rows = await r.json()
        if (rows[0]) store = rows[0]
      }
    } catch { /* fall back to Kross */ }
  }

  const icon = store.logo_url
  const icons = icon
    ? [
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // El área segura circular de Android corta los brazos de la K, así que
        // el maskable lleva el símbolo al 60% del canvas (manual §9).
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]

  const manifest = {
    name: store.nombre,
    short_name: store.nombre,
    description: 'Sigue tu pedido y chatea con tu asesor',
    start_url: '/',
    display: 'standalone',
    background_color: store.color_dark || '#0F1115',
    // El primario, como el `theme-color` de la página (§49): el segundo color
    // dejó de ser «el oscuro» y una marca puede ponerlo blanco.
    theme_color: store.color_primary || '#0F1115',
    orientation: 'portrait',
    icons,
    categories: ['shopping', 'utilities'],
    prefer_related_applications: false,
  }

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.status(200).send(JSON.stringify(manifest))
}
