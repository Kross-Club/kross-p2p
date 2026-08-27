import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ShoppingCart, Menu, X, Phone, Mail, MapPin, Clock, BookOpen, LogIn } from 'lucide-react'
import { KrossLockup } from '../KrossLogo'
import { RedIcon } from './RedIcon'
import { EMPRESA, camposPendientes } from '../../config/empresa'
import { MENSAJES } from '../../config/propuesta'
import { useCarrito } from '../../lib/carrito'
import { useKrossTheme } from '../../lib/theme'
import { isPlatformHost } from '../../lib/store-context'

// ─── Marco de la web pública ─────────────────────────────────────────────────
// Header y footer viven aquí para que TODAS las páginas públicas lleven lo
// mismo: los datos de contacto, las redes que sí existen, los enlaces legales y
// el aviso del Libro de Reclamaciones. Que el pie esté completo en todas las
// URLs es literalmente uno de los requisitos de la pasarela; tenerlo en un solo
// componente es lo que impide que una página nueva salga sin él.
//
// ── Los dos tonos (manual §10.1) ──
// `krossclub.app` es el sitio de Kross, y desde ago-2026 va en ink: el marco
// aplica `data-theme="dark"` y con eso el tema del manual traduce solo las
// superficies, la rampa de grises, los radios, los bordes y los pesos.
//
// Las páginas legales viven también en `marca.krossclub.app` —el comprador de
// una marca reclama donde compró, y el Libro registra su `store_id`—. Ahí el
// sitio es de la marca y sigue claro: pasan `tono="legal"` y el ink se aplica
// solo en el host de la plataforma. Lo que ve el comprador se pinta con el
// color de su tienda; eso es el white-label y no se toca.

const NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/servicios', label: 'Planes y precios', end: false },
  { to: '/contacto', label: 'Contacto', end: false },
  { to: '/libro-de-reclamaciones', label: 'Reclamaciones', end: false },
]

const LEGAL = [
  { to: '/terminos', label: 'Términos y condiciones' },
  { to: '/cambios-y-devoluciones', label: 'Cambios y devoluciones' },
  { to: '/privacidad', label: 'Política de privacidad' },
  { to: '/libro-de-reclamaciones', label: 'Libro de Reclamaciones' },
]

/** `kross` → siempre ink · `legal` → ink en la plataforma, marca en el subdominio. */
export type TonoPublico = 'kross' | 'legal'

export default function PublicLayout({ children, tono = 'kross' }: {
  children: ReactNode
  tono?: TonoPublico
}) {
  const [menu, setMenu] = useState(false)
  const { unidades } = useCarrito()
  const { pathname } = useLocation()

  useKrossTheme(tono === 'kross' || isPlatformHost())

  return (
    <div className="web-publica min-h-dvh flex flex-col"
      style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
      <PendientesBanner />

      <header className="sticky top-0 z-40 backdrop-blur"
        style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface-2) 92%, transparent)' }}>
        <div className="max-w-[1120px] mx-auto px-5 h-16 flex items-center gap-4">
          <Link to="/" className="mr-auto" onClick={() => setMenu(false)} aria-label={`${EMPRESA.marca} · inicio`}>
            <KrossLockup size={26} />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `relative px-3 py-2 text-[13px] transition-colors ${isActive ? 'k-nav-activo' : ''}`
                }
                style={({ isActive }) => ({ color: isActive ? 'var(--text)' : 'var(--text-faint)' })}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <Link to="/carrito" aria-label={`Carrito de compras: ${unidades} producto(s)`}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <ShoppingCart size={17} />
            {unidades > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[11px] flex items-center justify-center tabular"
                style={{ background: 'var(--invert)', color: 'var(--invert-fg)' }}>
                {unidades}
              </span>
            )}
          </Link>

          <Link to="/login"
            className="hidden md:flex items-center gap-1.5 px-4 h-10 rounded-xl text-[13px] k-cta">
            <LogIn size={15} /> Entrar
          </Link>

          <button onClick={() => setMenu((m) => !m)} aria-label="Abrir menú"
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menu && (
          <nav className="md:hidden px-5 py-3 flex flex-col" style={{ borderTop: '1px solid var(--border)' }}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenu(false)}
                className="py-2.5 text-sm"
                style={({ isActive }) => ({ color: isActive ? 'var(--text)' : 'var(--text-muted)' })}>
                {n.label}
              </NavLink>
            ))}
            <Link to="/login" onClick={() => setMenu(false)}
              className="mt-2 py-3 rounded-xl text-sm text-center k-cta">
              Entrar al panel
            </Link>
          </nav>
        )}
      </header>

      {/* `key` en el main: al cambiar de página el navegador conserva el scroll,
          y una página legal larga se abría por la mitad. */}
      <main key={pathname} className="flex-1">{children}</main>

      <Footer />
    </div>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  const dir = [EMPRESA.telefono, EMPRESA.email, EMPRESA.domicilioFiscal].filter(Boolean)

  return (
    <footer className="mt-20" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      <div className="max-w-[1120px] mx-auto px-5 py-14 grid gap-10 md:grid-cols-3">
        <div>
          <KrossLockup size={26} />
          <p className="text-sm leading-relaxed mt-4 max-w-[320px]" style={{ color: 'var(--text-faint)' }}>
            {MENSAJES.resumen}
          </p>

          {EMPRESA.redes.length > 0 && (
            <div className="flex items-center gap-2 mt-5">
              {EMPRESA.redes.map((r) => (
                <a key={r.nombre} href={r.url} target="_blank" rel="noopener noreferrer"
                  title={r.nombre} aria-label={`${EMPRESA.marca} en ${r.nombre}`}
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <RedIcon red={r} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide mb-3" style={{ color: 'var(--text-faint)' }}>Contacto</p>
          <ul className="space-y-2.5 text-sm">
            {EMPRESA.telefono && (
              <li className="flex gap-2.5">
                <Phone size={16} className="mt-0.5 shrink-0 opacity-50" />
                <a href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} className="hover:underline">{EMPRESA.telefono}</a>
              </li>
            )}
            {EMPRESA.email && (
              <li className="flex gap-2.5">
                <Mail size={16} className="mt-0.5 shrink-0 opacity-50" />
                <a href={`mailto:${EMPRESA.email}`} className="hover:underline break-all">{EMPRESA.email}</a>
              </li>
            )}
            {EMPRESA.domicilioFiscal && (
              <li className="flex gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 opacity-50" />
                <span>{EMPRESA.domicilioFiscal}</span>
              </li>
            )}
            <li className="flex gap-2.5">
              <Clock size={16} className="mt-0.5 shrink-0 opacity-50" />
              <span>{EMPRESA.horario}</span>
            </li>
          </ul>
          {dir.length === 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
              Datos de contacto pendientes de configurar.
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide mb-3" style={{ color: 'var(--text-faint)' }}>Legal</p>
          <ul className="space-y-2.5 text-sm">
            {LEGAL.map((l) => (
              <li key={l.to}><Link to={l.to} className="hover:underline">{l.label}</Link></li>
            ))}
          </ul>

          {/* Aviso obligatorio del Libro de Reclamaciones (D.S. 011-2011-PCM).
              Va en el pie de TODA la web, no escondido en una sola página. */}
          <Link to="/libro-de-reclamaciones"
            className="mt-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-3"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text)' }}>
            <BookOpen size={20} className="shrink-0" />
            <span className="text-[11px] leading-tight uppercase tracking-wide">
              Libro de Reclamaciones
              <span className="block normal-case tracking-normal" style={{ color: 'var(--text-faint)' }}>
                Presenta aquí tu reclamo o queja
              </span>
            </span>
          </Link>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-5 text-xs flex flex-wrap gap-x-3 gap-y-1"
          style={{ color: 'var(--text-faint)' }}>
          <span>© {year} {EMPRESA.razonSocial || EMPRESA.marca}.</span>
          {EMPRESA.ruc && <span>RUC {EMPRESA.ruc}.</span>}
          <span>Todos los derechos reservados.</span>
        </div>
      </div>
    </footer>
  )
}

/** Solo en desarrollo: recuerda qué datos obligatorios siguen vacíos. En
 *  producción no se pinta nada — al comprador no le importa nuestro pendiente. */
function PendientesBanner() {
  const faltan = import.meta.env.DEV ? camposPendientes() : []
  if (faltan.length === 0) return null
  return (
    <div className="text-xs px-5 py-2" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
      Faltan datos del comercio en <code>src/config/empresa.ts</code>: {faltan.join(', ')}.
    </div>
  )
}
