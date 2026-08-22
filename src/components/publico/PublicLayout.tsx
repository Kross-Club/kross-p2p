import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ShoppingCart, Menu, X, Phone, Mail, MapPin, Clock, BookOpen } from 'lucide-react'
import { KrossIcon } from '../KrossLogo'
import { RedIcon } from './RedIcon'
import { EMPRESA, camposPendientes } from '../../config/empresa'
import { useCarrito } from '../../lib/carrito'

// ─── Marco de la web pública (krossclub.app) ─────────────────────────────────
// Header y footer viven aquí para que TODAS las páginas públicas lleven lo
// mismo: los datos de contacto, las redes que sí existen, los enlaces legales y
// el aviso del Libro de Reclamaciones. Que el pie esté completo en todas las
// URLs es literalmente uno de los requisitos de la pasarela; tenerlo en un solo
// componente es lo que impide que una página nueva salga sin él.

const NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/servicios', label: 'Servicios', end: false },
  { to: '/contacto', label: 'Contacto', end: false },
  { to: '/libro-de-reclamaciones', label: 'Reclamaciones', end: false },
]

const LEGAL = [
  { to: '/terminos', label: 'Términos y condiciones' },
  { to: '/cambios-y-devoluciones', label: 'Cambios y devoluciones' },
  { to: '/privacidad', label: 'Política de privacidad' },
  { to: '/libro-de-reclamaciones', label: 'Libro de Reclamaciones' },
]

export default function PublicLayout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const { unidades } = useCarrito()
  const { pathname } = useLocation()

  return (
    <div className="min-h-dvh flex flex-col bg-white text-gray-900">
      <PendientesBanner />

      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="max-w-[1120px] mx-auto px-5 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 mr-auto" onClick={() => setMenu(false)}>
            <span className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center">
              <KrossIcon size={36} />
            </span>
            <span className="font-black text-lg tracking-tight">{EMPRESA.marca}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                    isActive ? 'text-[var(--brand-dark)] bg-gray-100' : 'text-gray-500 hover:text-gray-900'
                  }`
                }>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <Link to="/carrito" aria-label={`Carrito de compras: ${unidades} producto(s)`}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200">
            <ShoppingCart size={18} />
            {unidades > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] font-black text-white flex items-center justify-center"
                style={{ background: 'var(--brand-dark)' }}>
                {unidades}
              </span>
            )}
          </Link>

          <button onClick={() => setMenu((m) => !m)} aria-label="Abrir menú"
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 text-gray-700">
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menu && (
          <nav className="md:hidden border-t border-gray-100 px-5 py-3 flex flex-col">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  `py-2.5 text-sm font-bold ${isActive ? 'text-[var(--brand-dark)]' : 'text-gray-600'}`
                }>
                {n.label}
              </NavLink>
            ))}
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
    <footer className="mt-16 text-gray-300" style={{ background: 'var(--brand-dark, #060C1A)' }}>
      <div className="max-w-[1120px] mx-auto px-5 py-12 grid gap-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center"><KrossIcon size={36} /></span>
            <span className="font-black text-lg text-white">{EMPRESA.marca}</span>
          </div>
          <p className="text-sm leading-relaxed text-gray-400">
            Software peruano para vender, entregar y fidelizar en el comercio contraentrega.
            Vendemos servicios de suscripción para marcas que despachan sus pedidos en Lima y provincia.
          </p>

          {EMPRESA.redes.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              {EMPRESA.redes.map((r) => (
                <a key={r.nombre} href={r.url} target="_blank" rel="noopener noreferrer"
                  title={r.nombre} aria-label={`${EMPRESA.marca} en ${r.nombre}`}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20">
                  <RedIcon red={r} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="font-black text-white text-sm mb-3">Contacto</p>
          <ul className="space-y-2.5 text-sm">
            {EMPRESA.telefono && (
              <li className="flex gap-2.5">
                <Phone size={16} className="mt-0.5 shrink-0 opacity-60" />
                <a href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} className="hover:text-white">{EMPRESA.telefono}</a>
              </li>
            )}
            {EMPRESA.email && (
              <li className="flex gap-2.5">
                <Mail size={16} className="mt-0.5 shrink-0 opacity-60" />
                <a href={`mailto:${EMPRESA.email}`} className="hover:text-white break-all">{EMPRESA.email}</a>
              </li>
            )}
            {EMPRESA.domicilioFiscal && (
              <li className="flex gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 opacity-60" />
                <span>{EMPRESA.domicilioFiscal}</span>
              </li>
            )}
            <li className="flex gap-2.5">
              <Clock size={16} className="mt-0.5 shrink-0 opacity-60" />
              <span>{EMPRESA.horario}</span>
            </li>
          </ul>
          {dir.length === 0 && (
            <p className="text-xs text-amber-300/80 mt-2">
              Datos de contacto pendientes de configurar.
            </p>
          )}
        </div>

        <div>
          <p className="font-black text-white text-sm mb-3">Legal</p>
          <ul className="space-y-2.5 text-sm">
            {LEGAL.map((l) => (
              <li key={l.to}><Link to={l.to} className="hover:text-white">{l.label}</Link></li>
            ))}
          </ul>

          {/* Aviso obligatorio del Libro de Reclamaciones (D.S. 011-2011-PCM).
              Va en el pie de TODA la web, no escondido en una sola página. */}
          <Link to="/libro-de-reclamaciones"
            className="mt-4 flex items-center gap-2.5 rounded-2xl border-2 border-white/20 px-3.5 py-3 hover:border-white/40">
            <BookOpen size={20} className="shrink-0 text-white" />
            <span className="text-[11px] leading-tight font-bold text-white">
              LIBRO DE RECLAMACIONES
              <span className="block font-medium text-gray-400">Presenta aquí tu reclamo o queja</span>
            </span>
          </Link>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-[1120px] mx-auto px-5 py-5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
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
    <div className="bg-amber-100 text-amber-900 text-xs font-bold px-5 py-2">
      Faltan datos del comercio en <code>src/config/empresa.ts</code>: {faltan.join(', ')}.
    </div>
  )
}
