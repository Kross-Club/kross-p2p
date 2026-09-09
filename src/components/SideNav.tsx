import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import BrandMark from './BrandMark'
import { sellerNavLinks } from '../lib/seller-nav'
import { useMenuPlegado, setMenuPlegado } from '../lib/menu-lateral'
import { estiloValido, fondoDeMarca, tintaSobreDegradado } from '../lib/degradado'
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
//
// ── La barra lleva el degradado de la marca (09-set-2026) ───────────────────
// El resto del panel sigue siendo la herramienta de Kross y se pinta con ink y
// lima del manual. Esta columna no: es lo primero que mira el vendedor al
// entrar y lo que le dice EN QUÉ TIENDA está parado, así que la pinta el
// degradado de esa tienda —sus dos colores y su ángulo, los mismos del acceso
// del comprador—. Con eso el logo tampoco necesita placa: el fondo ya es de su
// color, y una placa ahí recortaría un rectángulo plano sobre el mismo color.
//
// Operando la PLATAFORMA no hay degradado que poner —Kross no es una tienda—,
// así que la barra se queda como estaba. Y la tinta no se elige a ojo: se
// decide por contraste contra la mezcla de los dos colores, porque el
// comerciante puede poner un amarillo tan bien como un azul casi negro.
export default function SideNav({
  effective,
  brand,
}: {
  effective: SellerProfile | null | undefined
  brand: {
    id?: string | null
    nombre: string
    logo_url: string | null
    logo_wide_url?: string | null
    color_primary?: string | null
    color_dark?: string | null
    gradient_style?: string | null
  } | null
}) {
  const links = sellerNavLinks(effective)
  const plegado = useMenuPlegado()

  // Sin marca, o en Kross, no hay degradado que poner: la barra es la de antes.
  const primario = brand && brand.nombre !== 'Kross' ? brand.color_primary || '' : ''
  const conMarca = !!primario
  const fondo = conMarca
    ? fondoDeMarca(primario, brand?.color_dark || primario, estiloValido(brand?.gradient_style), brand?.id ?? brand?.nombre ?? '')
    : 'var(--surface)'
  const t = tintaSobreDegradado(primario, brand?.color_dark || primario)
  // Con degradado el hover no puede ser una clase de Tailwind con un gris fijo:
  // se pasa como variables y lo pinta `.k-nav-marca` en index.css.
  const veladuras = conMarca
    ? { ['--nav-tinta' as string]: t.tinta, ['--nav-velo' as string]: t.veloSuave }
    : {}
  const divisor = conMarca ? { borderBottom: t.borde } : undefined

  return (
    <nav
      className={`flex-shrink-0 flex flex-col transition-[width] duration-200 ${conMarca ? 'k-nav-marca' : 'border-r border-gray-100'}`}
      style={{ background: fondo, width: plegado ? 64 : 212, borderRight: conMarca ? t.borde : undefined, ...veladuras }}
    >
      <div className={`py-4 flex items-center ${conMarca ? '' : 'border-b border-gray-100'} ${plegado ? 'justify-center px-2' : 'px-4'}`}
        style={{ minHeight: 57, ...divisor }}>
        {/* Sin placa: el fondo ya es el color de la marca. */}
        <BrandMark brand={brand} size={28} soloLogo={plegado} sinPlaca={conMarca} />
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
              } ${isActive || conMarca ? '' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
            }
            style={({ isActive }) => (conMarca
              ? (isActive ? { color: t.tinta, background: t.velo } : { color: t.suave })
              : (isActive ? { color: 'var(--text)', background: 'var(--surface-3)' } : {}))}
          >
            {({ isActive }) => (
              <>
                {/* §6: el indicador de activo es el módulo de la junta escalado
                    a 6×14. Así el logo se vuelve sistema y no adorno. Plegado no
                    va: con el ícono centrado, la barra del borde queda lejos de
                    él y se lee como otra cosa — el fondo ya dice cuál está.
                    Sobre el degradado va en la tinta y no en lima: el lima de
                    Kross desaparece sobre la marca que justamente eligió un
                    verde, y este indicador tiene que verse siempre. */}
                {isActive && !plegado && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2"
                    style={{ width: 6, height: 14, background: conMarca ? t.tinta : 'var(--brand)' }} />
                )}
                <Icon size={17} className="flex-shrink-0" />
                {!plegado && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Abajo y no arriba: es un ajuste de la ventana, no una sección. */}
      <div className={`py-2 px-2 ${conMarca ? '' : 'border-t border-gray-100'}`}
        style={conMarca ? { borderTop: t.borde } : undefined}>
        <button
          type="button"
          onClick={() => setMenuPlegado(!plegado)}
          aria-pressed={plegado}
          title={plegado ? 'Ampliar el menú' : 'Reducir el menú a íconos'}
          aria-label={plegado ? 'Ampliar el menú' : 'Reducir el menú a íconos'}
          className={`w-full flex items-center rounded-xl py-2 text-[11px] transition-colors ${
            conMarca ? '' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          } ${plegado ? 'justify-center' : 'gap-2.5 pl-4 pr-3'}`}
          style={conMarca ? { color: t.suave } : undefined}
        >
          {plegado ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!plegado && <span className="truncate">Reducir menú</span>}
        </button>
      </div>
    </nav>
  )
}
