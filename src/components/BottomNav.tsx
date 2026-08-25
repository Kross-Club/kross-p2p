import { NavLink } from 'react-router-dom'
import { useSeller } from '../lib/seller-session'
import { sellerNavLinks } from '../lib/seller-nav'

// Barra de abajo: SOLO móvil/tablet. En la PC del vendedor la navegación vive
// al costado (SideNav), dentro del marco 16:9 — ver Layout.
export default function BottomNav() {
  const { effective } = useSeller()
  const links = sellerNavLinks(effective)

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t border-gray-100 z-30 safe-area-inset-bottom"
      style={{ background: 'var(--surface)' }}>
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
                <div className="p-1.5 rounded-xl transition-colors" style={isActive ? { color: 'var(--brand)', background: 'var(--brand-tint)' } : {}}>
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
