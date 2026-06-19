import { NavLink } from 'react-router-dom'
import { MessageCircle, User, ShoppingBag, BarChart2, Users, Bot, Package } from 'lucide-react'
import { useKrossStore } from '../store'

export default function BottomNav() {
  const { currentUser } = useKrossStore()
  const isVendedor = currentUser.tipo === 'vendedor' || currentUser.tipo === 'vendedora'

  const compradorLinks = [
    { to: '/comprador/chats', icon: MessageCircle, label: 'Chats' },
    { to: '/comprador/perfil', icon: User, label: 'Mi perfil' },
  ]

  const vendedorLinks = [
    { to: '/vendedor/chats', icon: MessageCircle, label: 'Chats' },
    { to: '/vendedor/productos', icon: Package, label: 'Productos' },
    { to: '/vendedor/crm', icon: ShoppingBag, label: 'CRM' },
    { to: '/vendedor/bots', icon: Bot, label: 'Bot/IA' },
    { to: '/vendedor/equipo', icon: Users, label: 'Equipo' },
    { to: '/vendedor/estadisticas', icon: BarChart2, label: 'Stats' },
  ]

  const links = isVendedor ? vendedorLinks : compradorLinks

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-colors min-w-0 ${
                isActive ? '' : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="p-1.5 rounded-xl transition-colors" style={isActive ? { color: '#55C8F5', background: '#EEF9FF' } : {}}>
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
