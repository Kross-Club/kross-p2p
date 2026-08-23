import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Eye, X } from 'lucide-react'
import BottomNav from './BottomNav'
import IncomingCallOverlay from './IncomingCallOverlay'
import InstallBanner from './InstallBanner'
import SellerPresenceTracker from './SellerPresenceTracker'
import { KrossIcon } from './KrossLogo'
import { subscribePush, notifPermission, getPushPrefs } from '../lib/push'
import { playNotificationSound } from '../lib/notification-sounds'
import { supabase } from '../lib/supabase'
import { useSeller, clearSellerCache, setActingSeller } from '../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export default function Layout() {
  const { real, effective, impersonating, stopActing } = useSeller()
  const [uploading, setUploading] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const [brand, setBrand] = useState<{ nombre: string; logo_url: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Brand shown in the header follows WHO you're acting as (effective):
  //  · super admin on the platform → Kross (regardless of t1's name)
  //  · inside a store (own, or a brand the super admin entered) → that store's brand
  useEffect(() => {
    if (!effective) return
    if (effective.is_super_admin) {
      setBrand({ nombre: 'Kross', logo_url: null })
      const root = document.documentElement
      root.style.setProperty('--brand', '#55C8F5')
      root.style.setProperty('--brand-dark', '#060C1A')
      return
    }
    if (!effective.store_id) return
    supabase.from('stores').select('nombre, logo_url, color_primary, color_dark').eq('id', effective.store_id).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setBrand(data as { nombre: string; logo_url: string | null })
        const root = document.documentElement
        if (data.color_primary) root.style.setProperty('--brand', data.color_primary)
        if (data.color_dark) root.style.setProperty('--brand-dark', data.color_dark)
      })
  }, [effective?.store_id, effective?.is_super_admin])

  useEffect(() => { setAvatar(effective?.avatar_url ?? null) }, [effective?.avatar_url])
  useEffect(() => { if (real) setAvailable(real.available !== false) }, [real?.id, real?.available])

  // Register push for the real logged-in seller
  useEffect(() => {
    if (real && notifPermission() === 'granted') {
      subscribePush({ sellerId: real.auth_user_id, role: 'seller' as const }).catch(() => {})
    }
  }, [real?.auth_user_id])

  // Con la app enfocada el service worker muestra la notificación en silencio y
  // avisa por postMessage: aquí suena el sonido PROPIO de cada evento (nuevo
  // cliente / nuevo mensaje). Las llamadas no pasan por aquí — tienen su
  // ringtone en IncomingCallOverlay.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { kind?: string; type?: string } | null
      if (d?.kind !== 'kross-push') return
      const prefs = getPushPrefs()
      if (d.type === 'new_client' && prefs.new_client) playNotificationSound('new_client')
      else if (d.type === 'message' && prefs.new_message) playNotificationSound('new_message')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Update the photo of WHOEVER you're acting as (effective) — your own, a team
    // member you entered as, or a brand you're operating.
    const who = effective
    if (!file || !who) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${who.auth_user_id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      if (impersonating) {
        // RLS blocks updating another seller's row from the client → go through the
        // admin edge function (authorized because the caller is an admin).
        await fetch(`${BASE}/admin-team`, {
          method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_avatar', admin_auth_id: real?.auth_user_id, seller_id: who.auth_user_id, avatar_url: url }),
        })
        setActingSeller({ ...who, avatar_url: url })   // keep the acting profile in sync
      } else {
        await supabase.from('sellers').update({ avatar_url: url }).eq('id', who.id)
      }
      setAvatar(url)
    } catch {
      alert('No se pudo subir la foto. Verifica que exista el bucket "avatars" en Supabase Storage.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const logout = async () => {
    stopActing()
    clearSellerCache()
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-white relative flex flex-col shadow-2xl">
        {effective && <IncomingCallOverlay storeId={effective.store_id} />}
        <SellerPresenceTracker authUserId={real?.auth_user_id} />
        <InstallBanner />

        {/* Impersonation banner */}
        {impersonating && (
          <div className="flex items-center justify-between px-4 py-2 text-white"
            style={{ background: 'linear-gradient(90deg, #7C3AED, #4F46E5)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Eye size={14} className="flex-shrink-0" />
              <p className="text-xs font-bold truncate">
                {real?.is_super_admin
                  ? <>Estás en {brand?.nombre ?? 'la marca'}</>
                  : <>Viendo como {effective?.nombre.split(' ')[0]} · {effective?.role_label}</>}
              </p>
            </div>
            <button onClick={stopActing}
              className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <X size={12} /> {real?.is_super_admin ? 'Volver a Kross' : 'Volver a admin'}
            </button>
          </div>
        )}

        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center">
              {brand?.logo_url ? <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-cover" /> : <KrossIcon size={32} />}
            </div>
            <span className="font-black text-lg tracking-tight" style={{ color: '#060C1A' }}>{brand?.nombre ?? 'kross'}</span>
          </div>
          <div className="flex items-center gap-3">
            {real && !impersonating && (
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black"
                style={{ background: available ? '#DCFCE7' : '#FEE2E2', color: available ? '#16A34A' : '#DC2626' }}
                title="Tu turno (lo asigna el admin)">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: available ? '#16A34A' : '#DC2626' }} />
                {available ? 'En turno' : 'Fuera de turno'}
              </span>
            )}
            {effective && (
              <>
                <div className="text-right">
                  <p className="text-xs font-black leading-none" style={{ color: '#111' }}>
                    {effective.nombre.split(' ')[0]}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: '#888' }}>
                    {effective.role_label}
                  </p>
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ border: '2px solid var(--brand)', opacity: uploading ? 0.5 : 1 }}
                  title="Cambiar foto">
                  {avatar ? (
                    <img src={avatar} alt={effective.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-sm" style={{ color: 'var(--brand)' }}>
                      {effective.nombre.charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              </>
            )}
            <button onClick={logout} className="p-1.5 rounded-xl" style={{ color: '#ccc' }} title="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-20 overflow-y-auto">
          <Outlet />
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
