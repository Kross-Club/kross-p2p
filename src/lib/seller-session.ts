import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { administraLaPlataforma } from '../../supabase/functions/_shared/alcance.ts'

export interface SellerProfile {
  id: string
  auth_user_id: string
  nombre: string
  role_label: string
  store_id: string
  avatar_url: string | null
  is_admin: boolean
  is_super_admin?: boolean
  /** Operador: administra igual que el admin, pero no reparte mando (no crea ni
   *  asciende administradores). Las reglas viven en `permisos.ts` — acá solo
   *  viaja el dato. */
  is_operator?: boolean
  available: boolean
}

const ACTING_KEY = 'acting_seller'
const REAL_KEY = 'seller_profile'
const EVT = 'acting-seller-changed'

// Module-level cache of the resolved seller. useSeller re-runs on every page
// mount; without this, `real` is briefly null on each client-side navigation,
// which left data-loading pages (e.g. Equipo) stuck on their spinner until a
// hard refresh. Seeding state from the cache makes `real` available synchronously.
//
// Y en el ARRANQUE se siembra del disco (07-set-2026). El panel tardaba cinco
// segundos en enseñar los pedidos, y solo uno era la consulta: el resto era una
// cadena en serie —bajar el JS, `auth.getSession()`, consultar `sellers`— antes
// de que la petición de la lista saliera siquiera. Con el perfil en disco, la
// primera pintada ya sabe de qué tienda pedir y la lista arranca de inmediato;
// la comprobación de verdad sigue corriendo y corrige si cambió algo.
//
// No es una llave: el perfil no abre nada. Quién puede qué lo decide el
// servidor en cada llamada, y el perfil "actuando" ya vivía acá desde antes.
let cachedReal: SellerProfile | null = leerPerfil()
export function clearSellerCache() {
  cachedReal = null
  try { localStorage.removeItem(REAL_KEY) } catch { /* modo privado */ }
}

function leerPerfil(): SellerProfile | null {
  try {
    const raw = localStorage.getItem(REAL_KEY)
    const p = raw ? (JSON.parse(raw) as SellerProfile) : null
    // Sin `store_id` no sirve para adelantar nada, que es lo único que hace.
    return p?.store_id ? p : null
  } catch {
    return null
  }
}

function guardarPerfil(p: SellerProfile | null) {
  try {
    if (p) localStorage.setItem(REAL_KEY, JSON.stringify(p))
    else localStorage.removeItem(REAL_KEY)
  } catch { /* modo privado: se sigue sin adelantar, no es un error */ }
}

export function getActingSeller(): SellerProfile | null {
  try {
    const raw = localStorage.getItem(ACTING_KEY)
    return raw ? (JSON.parse(raw) as SellerProfile) : null
  } catch {
    return null
  }
}

export function setActingSeller(s: SellerProfile | null) {
  if (s) localStorage.setItem(ACTING_KEY, JSON.stringify(s))
  else localStorage.removeItem(ACTING_KEY)
  window.dispatchEvent(new Event(EVT))
}

// Central hook: resolves the REAL logged-in seller plus any admin "view as"
// override. `effective` is who the UI should act as right now.
export function useSeller() {
  const [real, setReal] = useState<SellerProfile | null>(cachedReal)
  const [acting, setActing] = useState<SellerProfile | null>(getActingSeller())
  const [loading, setLoading] = useState(!cachedReal)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      // Sin sesión no hay perfil que valga: se borra también el del disco, o
      // el próximo arranque adelantaría con el de quien ya salió.
      if (!data.session) { cachedReal = null; guardarPerfil(null); if (alive) { setReal(null); setLoading(false) } return }
      const { data: profile } = await supabase
        .from('sellers')
        .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin, is_super_admin, is_operator, available')
        .eq('auth_user_id', data.session.user.id)
        .maybeSingle()
      cachedReal = (profile as SellerProfile) ?? null
      guardarPerfil(cachedReal)
      if (alive) { setReal(cachedReal); setLoading(false) }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const h = () => setActing(getActingSeller())
    window.addEventListener(EVT, h)
    return () => window.removeEventListener(EVT, h)
  }, [])

  const isAdmin = !!real?.is_admin
  // Only admins may impersonate; a stale override on a non-admin is ignored.
  //  · quien administra la plataforma: ANY acting means "entered a brand" (even
  //    if it shares the platform store id) → always impersonate.
  //  · store admin: impersonating only when acting AS a different person (a member).
  //
  // La primera rama pregunta por `alcance.ts` y no por `is_super_admin` porque
  // "entrar a una tienda" es actuar como uno mismo con otro `store_id`: con la
  // bandera, a un operador de Kross le salía `impersonating = false` y entrar a
  // una marca no hacía nada — el botón respondía y la pantalla no se movía.
  const impersonating = isAdmin && !!acting &&
    (administraLaPlataforma(real) || acting.auth_user_id !== real?.auth_user_id)
  const effective = impersonating ? acting! : real

  const actAs = useCallback((s: SellerProfile) => setActingSeller(s), [])
  const stopActing = useCallback(() => setActingSeller(null), [])

  return { real, effective, isAdmin, impersonating, loading, actAs, stopActing }
}
