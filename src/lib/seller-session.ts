import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface SellerProfile {
  id: string
  auth_user_id: string
  nombre: string
  role_label: string
  store_id: string
  avatar_url: string | null
  is_admin: boolean
}

const ACTING_KEY = 'acting_seller'
const EVT = 'acting-seller-changed'

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

export const roleIsVentas = (role?: string | null) =>
  (role ?? '').toLowerCase().includes('venta')

// Central hook: resolves the REAL logged-in seller plus any admin "view as"
// override. `effective` is who the UI should act as right now.
export function useSeller() {
  const [real, setReal] = useState<SellerProfile | null>(null)
  const [acting, setActing] = useState<SellerProfile | null>(getActingSeller())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { if (alive) setLoading(false); return }
      const { data: profile } = await supabase
        .from('sellers')
        .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin')
        .eq('auth_user_id', data.session.user.id)
        .maybeSingle()
      if (alive) { setReal((profile as SellerProfile) ?? null); setLoading(false) }
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
  const impersonating = isAdmin && !!acting && acting.auth_user_id !== real?.auth_user_id
  const effective = impersonating ? acting! : real

  const actAs = useCallback((s: SellerProfile) => setActingSeller(s), [])
  const stopActing = useCallback(() => setActingSeller(null), [])

  return { real, effective, isAdmin, impersonating, loading, actAs, stopActing }
}
