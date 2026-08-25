import { NavLink } from 'react-router-dom'
import BrandMark from './BrandMark'
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
    <nav className="w-[212px] flex-shrink-0 border-r border-gray-100 flex flex-col" style={{ background: 'var(--surface)' }}>
      <div className="px-4 py-4 flex items-center border-b border-gray-100" style={{ minHeight: 57 }}>
        <BrandMark brand={brand} size={28} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-xl text-sm transition-colors ${
                isActive ? '' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`
            }
            style={({ isActive }) => (isActive ? { color: 'var(--text)', background: 'var(--surface-3)' } : {})}
          >
            {({ isActive }) => (
              <>
                {/* §6: el indicador de activo es el módulo de la junta escalado
                    a 6×14. Así el logo se vuelve sistema y no adorno. */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2"
                    style={{ width: 6, height: 14, background: 'var(--brand)' }} />
                )}
                <Icon size={17} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
