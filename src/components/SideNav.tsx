import { NavLink } from 'react-router-dom'
import { KrossIcon } from './KrossLogo'
import { sellerNavLinks } from '../lib/seller-nav'
import type { SellerProfile } from '../lib/seller-session'

// Navegación lateral del panel en PC. Las mismas secciones que la barra de
// abajo en móvil, pero con etiqueta visible: en escritorio no hay que adivinar
// qué significa un ícono, y el ancho ya está pagado.
export default function SideNav({
  effective,
  brand,
}: {
  effective: SellerProfile | null | undefined
  brand: { nombre: string; logo_url: string | null } | null
}) {
  const links = sellerNavLinks(effective)

  return (
    <nav className="w-[212px] flex-shrink-0 border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 py-4 flex items-center gap-2 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
          {brand?.logo_url
            ? <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-cover" />
            : <KrossIcon size={32} />}
        </div>
        <span className="font-black text-base tracking-tight truncate" style={{ color: '#060C1A' }}>
          {brand?.nombre ?? 'kross'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
                isActive ? 'font-black' : 'font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`
            }
            style={({ isActive }) => (isActive ? { color: 'var(--brand)', background: '#EEF9FF' } : {})}
          >
            <Icon size={17} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
