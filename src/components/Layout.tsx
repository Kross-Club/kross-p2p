import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Eye, X } from 'lucide-react'
import BottomNav from './BottomNav'
import IncomingCallOverlay from './IncomingCallOverlay'
import InstallBanner from './InstallBanner'
import SellerPresenceTracker from './SellerPresenceTracker'
import { KrossIcon } from './KrossLogo'
import { subscribePush } from '../lib/push'
import { supabase } from '../lib/supabase'
import { useSeller } from '../lib/seller-session'

export default function Layout() {
  const { real, effective, impersonating, stopActing } = useSeller()
  const [uploading, setUploading] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => { setAvatar(effective?.avatar_url ?? null) }, [effective?.avatar_url])
  useEffect(() => { if (real) setAvailable(real.available !== false) }, [real?.id, real?.available])

  // Register push for the real logged-in seller
  useEffect(() => {
    if (real && Notification.permission === 'granted') {
      subscribePush({ sellerId: real.auth_user_id, role: 'seller' as const }).catch(() => {})
    }
  }, [real?.auth_user_id])

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !real) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${real.auth_user_id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      await supabase.from('sellers').update({ avatar_url: url }).eq('id', real.id)
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
                Viendo como {effective?.nombre.split(' ')[0]} · {effective?.role_label}
              </p>
            </div>
            <button onClick={stopActing}
              className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <X size={12} /> Volver a admin
            </button>
          </div>
        )}

        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden">
              <KrossIcon size={32} />
            </div>
            <span className="font-black text-lg tracking-tight" style={{ color: '#060C1A' }}>kross</span>
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
                  onClick={() => { if (!impersonating) fileRef.current?.click() }}
                  disabled={uploading || impersonating}
                  className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ border: '2px solid #55C8F5', opacity: uploading ? 0.5 : 1 }}
                  title={impersonating ? '' : 'Cambiar foto'}>
                  {avatar ? (
                    <img src={avatar} alt={effective.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-sm" style={{ color: '#55C8F5' }}>
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
