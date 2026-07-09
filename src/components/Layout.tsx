import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import BottomNav from './BottomNav'
import AccountSelector from './AccountSelector'
import IncomingCallOverlay from './IncomingCallOverlay'
import InstallBanner from './InstallBanner'
import { useKrossStore } from '../store'
import { subscribePush } from '../lib/push'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { currentUser } = useKrossStore()
  const isSeller = currentUser.tipo === 'vendedor'
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (!isSeller || !currentUser.id) return
    if (Notification.permission === 'granted') {
      subscribePush({ sellerId: currentUser.id, role: 'seller' as const }).catch(() => {})
    }
  }, [isSeller, currentUser.id])

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-white relative flex flex-col shadow-2xl">
        {isSeller && <IncomingCallOverlay storeId={currentUser.tiendaId} />}
        <InstallBanner />
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#55C8F5' }}>
              <span className="text-white font-black text-sm">K</span>
            </div>
            <span className="font-black text-lg tracking-tight" style={{ color: '#111111' }}>kross</span>
          </div>
          <div className="flex items-center gap-2">
            <AccountSelector />
            <button onClick={logout} className="p-1.5 rounded-xl" style={{ color: '#aaa' }} title="Cerrar sesión">
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
