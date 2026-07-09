import { useEffect, useState } from 'react'
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
}

export default function Layout() {
  const [seller, setSeller] = useState<SellerProfile | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const userId = data.session.user.id

      // Load seller profile
      const { data: profile } = await supabase
        .from('sellers')
        .select('id, nombre, role_label, store_id')
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
              <div className="text-right">
                <p className="text-xs font-black leading-none" style={{ color: '#111' }}>
                  {seller.nombre.split(' ')[0]}
                </p>
                <p className="text-xs leading-none mt-0.5" style={{ color: '#888' }}>
                  {seller.role_label}
                </p>
              </div>
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
