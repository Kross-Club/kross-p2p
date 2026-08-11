import { Link } from 'react-router-dom'
import { ShieldCheck, Truck, Repeat, Phone, Mail, MapPin, ChevronRight, Lock } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import TarjetaServicio from '../../components/publico/TarjetaServicio'
import { CATALOGO_VITRINA } from '../../config/catalogo'
import { EMPRESA } from '../../config/empresa'

// ─── Home pública de krossclub.app ───────────────────────────────────────────
// Antes, entrar a krossclub.app sin sesión te mandaba al login de comprador,
// que en el dominio de la plataforma es un callejón sin salida ("esta página es
// de cada marca"). Para cualquiera de fuera —un cliente nuevo o el revisor de
// una pasarela de pago— la web no decía qué se vende ni a qué precio.
//
// Esta página lo dice: qué ofrece Kross, cuánto cuesta cada servicio, cómo se
// compra y cómo contactarnos.

export default function HomePage() {
  return (
    <PublicLayout>
      <section className="text-white" style={{ background: 'linear-gradient(160deg, #060C1A 0%, #0D1F3C 60%, #0A2540 100%)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16 md:py-24">
          <p className="text-xs font-black tracking-widest mb-3" style={{ color: '#7DE8FF' }}>
            SOFTWARE PARA COMERCIO CONTRAENTREGA · PERÚ
          </p>
          <h1 className="text-3xl md:text-5xl font-black leading-tight max-w-[720px]">
            Vende, entrega y fideliza desde una sola app con tu marca.
          </h1>
          <p className="mt-4 text-base md:text-lg max-w-[620px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Kross es el sistema que usan las marcas peruanas que venden contraentrega: tu propia
            aplicación instalable, checkout guiado, seguimiento del pedido en chat y campañas para
            que el cliente vuelva a comprar. Contratas por suscripción mensual, sin permanencia.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/servicios"
              className="px-6 py-3.5 rounded-2xl font-black text-sm text-gray-900 bg-white hover:bg-gray-100">
              Ver servicios y precios
            </Link>
            <Link to="/contacto"
              className="px-6 py-3.5 rounded-2xl font-black text-sm text-white border-2 border-white/25 hover:border-white/50">
              Hablar con ventas
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-[1120px] mx-auto px-5 py-14">
        <h2 className="text-2xl md:text-3xl font-black">Qué hacemos por tu marca</h2>
        <p className="text-gray-600 mt-2 max-w-[640px]">
          Kross cubre las tres fases del comercio contraentrega. Contratas el plan que necesitas y
          sumas módulos cuando creces.
        </p>
        <div className="grid gap-5 md:grid-cols-3 mt-8">
          <Bloque icon={<ShieldCheck size={22} />} titulo="Vender"
            texto="Checkout guiado, validación de identidad por DNI y asistente de cierre para que el pedido llegue confirmado, no a medias." />
          <Bloque icon={<Truck size={22} />} titulo="Entregar"
            texto="Cobertura por distrito, envíos a provincia por agencia y panel de motorizados con el estado real de cada entrega." />
          <Bloque icon={<Repeat size={22} />} titulo="Fidelizar"
            texto="Puntos, recordatorios de reposición y campañas de recompra por WhatsApp sobre el historial de tus compradores." />
        </div>
      </section>

      <section id="catalogo" className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-[1120px] mx-auto px-5 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-black">Servicios y precios</h2>
              <p className="text-gray-600 mt-2">
                Todos los precios están en soles (S/) e incluyen IGV. Puedes contratar más de uno.
              </p>
            </div>
            <Link to="/servicios" className="text-sm font-black flex items-center gap-1" style={{ color: 'var(--brand-dark)' }}>
              Ver el catálogo completo <ChevronRight size={16} />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOGO_VITRINA.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
          </div>
        </div>
      </section>

      <section className="max-w-[1120px] mx-auto px-5 py-14">
        <h2 className="text-2xl md:text-3xl font-black">Cómo se compra</h2>
        <div className="grid gap-5 md:grid-cols-4 mt-8">
          <Paso n={1} titulo="Elige tu servicio" texto="Agrega al carrito el plan y los módulos que necesitas." />
          <Paso n={2} titulo="Revisa tu carrito" texto="Cambia cantidades y confirma el total antes de pagar." />
          <Paso n={3} titulo="Completa tus datos" texto="Razón social o nombre, RUC o DNI, correo y teléfono para la factura." />
          <Paso n={4} titulo="Paga y activamos" texto="Registramos tu pedido con un código y activamos el servicio." />
        </div>

        <div className="mt-8 flex items-center gap-3 text-sm text-gray-600 rounded-2xl bg-gray-50 border border-gray-200 px-5 py-4">
          <Lock size={18} className="shrink-0 text-green-600" />
          <p>
            Toda la web viaja cifrada con HTTPS (certificado SSL) en cada una de sus páginas, y los
            datos de tu pedido se guardan en servidores con acceso restringido.
          </p>
        </div>
      </section>

      <section className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-[1120px] mx-auto px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-black">¿Hablamos?</h2>
          <p className="text-gray-600 mt-2">Atendemos {EMPRESA.horario.toLowerCase()}.</p>
          <div className="grid gap-4 md:grid-cols-3 mt-6">
            {EMPRESA.telefono && (
              <Contacto icon={<Phone size={18} />} label="Teléfono"
                valor={EMPRESA.telefono} href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} />
            )}
            {EMPRESA.email && (
              <Contacto icon={<Mail size={18} />} label="Correo" valor={EMPRESA.email} href={`mailto:${EMPRESA.email}`} />
            )}
            {EMPRESA.domicilioFiscal && (
              <Contacto icon={<MapPin size={18} />} label="Dirección" valor={EMPRESA.domicilioFiscal} />
            )}
          </div>
          <Link to="/contacto" className="inline-flex items-center gap-1 mt-6 text-sm font-black" style={{ color: 'var(--brand-dark)' }}>
            Ver todos los datos de contacto <ChevronRight size={16} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}

function Bloque({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="rounded-3xl border border-gray-200 p-6">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3 text-white" style={{ background: 'var(--brand-dark)' }}>
        {icon}
      </div>
      <h3 className="font-black text-lg">{titulo}</h3>
      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{texto}</p>
    </div>
  )
}

function Paso({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className="rounded-3xl bg-gray-50 border border-gray-200 p-5">
      <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white" style={{ background: 'var(--brand-dark)' }}>{n}</span>
      <h3 className="font-black mt-3">{titulo}</h3>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed">{texto}</p>
    </div>
  )
}

function Contacto({ icon, label, valor, href }: { icon: React.ReactNode; label: string; valor: string; href?: string }) {
  const cuerpo = (
    <div className="rounded-2xl bg-white border border-gray-200 px-5 py-4 h-full">
      <p className="text-xs font-black text-gray-400 uppercase tracking-wide flex items-center gap-2">{icon} {label}</p>
      <p className="font-bold mt-1.5 break-words">{valor}</p>
    </div>
  )
  return href ? <a href={href} className="block hover:opacity-80">{cuerpo}</a> : cuerpo
}
