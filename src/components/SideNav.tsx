import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import BrandMark from './BrandMark'
import { sellerNavLinks } from '../lib/seller-nav'
import { useMenuPlegado, setMenuPlegado } from '../lib/menu-lateral'
import type { SellerProfile } from '../lib/seller-session'

// Navegación lateral del panel en PC. Las mismas secciones que la barra de
// abajo en móvil, pero con etiqueta visible: en escritorio no hay que adivinar
// qué significa un ícono, y el ancho ya está pagado.
//
// Salvo cuando no lo está. El panel en PC es una tarjeta 16:9, así que todo lo
// que ocupa el menú se lo quita al tablero, que es donde de verdad se trabaja:
// con nueve columnas de etapas, 148 píxeles menos son media columna más a la
// vista. Por eso se pliega a solo íconos, y la elección se recuerda en este
// dispositivo (ver lib/menu-lateral.ts).
//
// Plegado, cada entrada lleva su `title`: un ícono sin nombre es un acertijo la
// primera vez, y el `title` es lo que lo convierte en un recordatorio.
export default function SideNav({
  effective,
  brand,
}: {
  effective: SellerProfile | null | undefined
  brand: { nombre: string; logo_url: string | null } | null
}) {
  const links = sellerNavLinks(effective)
  const plegado = useMenuPlegado()

  return (
    <nav
      className="flex-shrink-0 border-r border-gray-100 flex flex-col transition-[width] duration-200"
      style={{ background: 'var(--surface)', width: plegado ? 64 : 212 }}
    >
      <div className={`py-4 flex items-center border-b border-gray-100 ${plegado ? 'justify-center px-2' : 'px-4'}`}
        style={{ minHeight: 57 }}>
        <BrandMark brand={brand} size={28} soloLogo={plegado} />
      </div>

      <div className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${plegado ? 'px-2' : 'px-2'}`}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={plegado ? label : undefined}
            className={({ isActive }) =>
              `relative flex items-center rounded-xl text-sm transition-colors ${
                plegado ? 'justify-center px-0 py-2.5' : 'gap-2.5 pl-4 pr-3 py-2'
              } ${isActive ? '' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
            }
            style={({ isActive }) => (isActive ? { color: 'var(--text)', background: 'var(--surface-3)' } : {})}
          >
            {({ isActive }) => (
              <>
                {/* §6: el indicador de activo es el módulo de la junta escalado
                    a 6×14. Así el logo se vuelve sistema y no adorno. Plegado no
                    va: con el ícono centrado, la barra del borde queda lejos de
                    él y se lee como otra cosa — el fondo ya dice cuál está. */}
                {isActive && !plegado && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2"
                    style={{ width: 6, height: 14, background: 'var(--brand)' }} />
                )}
                <Icon size={17} className="flex-shrink-0" />
                {!plegado && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Abajo y no arriba: es un ajuste de la ventana, no una sección. */}
      <div className={`border-t border-gray-100 py-2 ${plegado ? 'px-2' : 'px-2'}`}>
        <button
          type="button"
          onClick={() => setMenuPlegado(!plegado)}
          aria-pressed={plegado}
          title={plegado ? 'Ampliar el menú' : 'Reducir el menú a íconos'}
          aria-label={plegado ? 'Ampliar el menú' : 'Reducir el menú a íconos'}
          className={`w-full flex items-center rounded-xl py-2 text-[11px] text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors ${
            plegado ? 'justify-center' : 'gap-2.5 pl-4 pr-3'
          }`}
        >
          {plegado ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!plegado && <span className="truncate">Reducir menú</span>}
        </button>
      </div>
    </nav>
  )
}
