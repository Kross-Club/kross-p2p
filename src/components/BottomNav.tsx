import { NavLink } from 'react-router-dom'
import { MessageCircle, ShoppingBag, BarChart2, Users, Package, Store, Phone, UserPlus, TrendingUp } from 'lucide-react'
import { useSeller } from '../lib/seller-session'

export default function BottomNav() {
  const { effective } = useSeller()
  // Nav follows WHO you're acting as:
  //  · super admin (Kross platform, not inside a store) → only Marcas
  //  · store admin (or super admin who entered a store) → full store toolset
  //  · team member → Chats, CRM, Stats
  const platform = !!effective?.is_super_admin
  const storeAdmin = !!effective?.is_admin && !effective?.is_super_admin

  const platformLinks = [
    { to: '/vendedor/marca', icon: Store, label: 'Marcas' },
  ]
  const memberLinks = [
    { to: '/vendedor/chats', icon: MessageCircle, label: 'Chats' },
    { to: '/vendedor/crm', icon: ShoppingBag, label: 'CRM' },
    { to: '/vendedor/estadisticas', icon: BarChart2, label: 'Stats' },
  ]
  const adminLinks = [
    { to: '/vendedor/chats', icon: MessageCircle, label: 'Chats' },
    { to: '/vendedor/clientes', icon: UserPlus, label: 'Clientes' },
    { to: '/vendedor/retencion', icon: TrendingUp, label: 'Retención' },
    { to: '/vendedor/crm', icon: ShoppingBag, label: 'CRM' },
    { to: '/vendedor/productos', icon: Package, label: 'Productos' },
    { to: '/vendedor/equipo', icon: Users, label: 'Equipo' },
    { to: '/vendedor/llamadas', icon: Phone, label: 'Llamadas' },
    { to: '/vendedor/marca', icon: Store, label: 'Marca' },
    { to: '/vendedor/estadisticas', icon: BarChart2, label: 'Stats' },
  ]
  const links = platform ? platformLinks : storeAdmin ? adminLinks : memberLinks

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 safe-area-inset-bottom">
      <div className={`flex items-center px-2 py-1 ${links.length > 6 ? 'overflow-x-auto gap-1' : 'justify-around'}`}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-colors flex-shrink-0 ${
                isActive ? '' : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="p-1.5 rounded-xl transition-colors" style={isActive ? { color: 'var(--brand)', background: '#EEF9FF' } : {}}>
                  <Icon size={20} />
                </div>
                <span className="text-[10px] font-medium truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
