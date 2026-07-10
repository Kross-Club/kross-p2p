import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import BottomNav from './BottomNav'
import IncomingCallOverlay from './IncomingCallOverlay'
import InstallBanner from './InstallBanner'
import { KrossIcon } from './KrossLogo'
import { subscribePush } from '../lib/push'
import { supabase } from '../lib/supabase'

interface SellerProfile {
  id: string
  nombre: string
  role_label: string
  store_id: string
  avatar_url: string | null
}

export default function Layout() {
  const [seller, setSeller] = useState<SellerProfile | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const userId = data.session.user.id
      setAuthUserId(userId)

      // Load seller profile
      const { data: profile } = await supabase
        .from('sellers')
        .select('id, nombre, role_label, store_id, avatar_url')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (profile) {
        setSeller(profile)
        // Register push subscription
        if (Notification.permission === 'granted') {
          subscribePush({ sellerId: userId, role: 'seller' as const }).catch(() => {})
        }
      }
    })
  }, [])

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !authUserId || !seller) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${authUserId}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      // cache-bust so the new photo shows immediately
      const url = `${pub.publicUrl}?v=${Date.now()}`
      await supabase.from('sellers').update({ avatar_url: url }).eq('id', seller.id)
      setSeller({ ...seller, avatar_url: url })
    } catch {
      alert('No se pudo subir la foto. Verifica que exista el bucket "avatars" en Supabase Storage.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-white relative flex flex-col shadow-2xl">
        {seller && <IncomingCallOverlay storeId={seller.store_id} />}
        <InstallBanner />
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden">
              <KrossIcon size={32} />
            </div>
            <span className="font-black text-lg tracking-tight" style={{ color: '#060C1A' }}>kross</span>
          </div>
          <div className="flex items-center gap-3">
            {seller && (
              <>
                <div className="text-right">
                  <p className="text-xs font-black leading-none" style={{ color: '#111' }}>
                    {seller.nombre.split(' ')[0]}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: '#888' }}>
                    {seller.role_label}
                  </p>
                </div>
                {/* Avatar — tap to change photo */}
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ border: '2px solid #55C8F5', opacity: uploading ? 0.5 : 1 }}
                  title="Cambiar foto">
                  {seller.avatar_url ? (
                    <img src={seller.avatar_url} alt={seller.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-sm" style={{ color: '#55C8F5' }}>
                      {seller.nombre.charAt(0).toUpperCase()}
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
