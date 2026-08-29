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
  /** Operador: administra igual que el admin pero no destruye. Las reglas viven
   *  en `permisos.ts` — acá solo viaja el dato. */
  is_operator?: boolean
  available: boolean
}

const ACTING_KEY = 'acting_seller'
const EVT = 'acting-seller-changed'

// Module-level cache of the resolved seller. useSeller re-runs on every page
// mount; without this, `real` is briefly null on each client-side navigation,
// which left data-loading pages (e.g. Equipo) stuck on their spinner until a
// hard refresh. Seeding state from the cache makes `real` available synchronously.
let cachedReal: SellerProfile | null = null
export function clearSellerCache() { cachedReal = null }

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
      if (!data.session) { cachedReal = null; if (alive) { setReal(null); setLoading(false) } return }
      const { data: profile } = await supabase
        .from('sellers')
        .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin, is_super_admin, is_operator, available')
        .eq('auth_user_id', data.session.user.id)
        .maybeSingle()
      cachedReal = (profile as SellerProfile) ?? null
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
