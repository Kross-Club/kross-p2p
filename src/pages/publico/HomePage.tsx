import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign, Zap, Truck, Repeat, ChevronRight, Lock, Check, X,
  Phone, Mail, MapPin, Store, BadgeCheck,
} from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import TarjetaServicio from '../../components/publico/TarjetaServicio'
import { CATALOGO_VITRINA } from '../../config/catalogo'
import { EMPRESA } from '../../config/empresa'
import {
  MENSAJES, CIFRAS, PILARES, COMPARATIVA, PASOS_COBRO, GARANTIAS, type IconoPilar,
} from '../../config/propuesta'

// ─── Portada de krossclub.app ────────────────────────────────────────────────
//
// Qué vende esta página, en una línea: **Kross es la tecnología de tu tienda**,
// y lo que la distingue es CUÁNDO entra la plata.
//
// El rediseño de ago-2026 cambió las dos cosas que decía la portada anterior:
//
//  · **El posicionamiento.** Decía "software para comercio contraentrega".
//    Contraentrega significa que todo el dinero se cobra en la puerta, y eso
//    dejó de ser lo que hace el producto: el checkout cobra la mitad o el total
//    del pedido dentro del formulario, con Yape validado solo, y el saldo es lo
//    único que queda contra entrega. Por eso la sección «Esto ya no es
//    contraentrega» está arriba del catálogo: la suposición hay que romperla
//    antes de hablar de precios.
//  · **El tono.** Era el celeste del sistema viejo. Ahora es ink + lima, el
//    manual v2.0 — era el pendiente de su §10.1.
//
// Los textos y las cifras NO viven acá: salen de `src/config/propuesta.ts`,
// para que el detalle de cada servicio y los términos digan lo mismo.
//
// Nota sobre el lima (§4.2, máximo tres apariciones por pantalla): esta es una
// página larga y la regla se aplica por pantalla vista, no por documento. Por
// viewport hay como mucho tres: la junta del lockup, el indicador de la nav y
// un dato de dinero cobrado.

const ICONOS: Record<IconoPilar, ReactNode> = {
  cobro: <DollarSign size={20} />,
  venta: <Zap size={20} />,
  despacho: <Truck size={20} />,
  recompra: <Repeat size={20} />,
}

export default function HomePage() {
  return (
    <PublicLayout>
      {/* ── Hero ───────────────────────────────────────────────────────────
          §5 fija 20–28 px para el titular de una PANTALLA del producto. Una
          portada no es una pantalla de trabajo: acá el titular crece, pero
          sigue en peso 500 y sin degradados, que es lo que el manual protege. */}
      <section className="max-w-[1120px] mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
        <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
          Software peruano para tiendas en línea
        </p>

        <h1 className="mt-4 text-[34px] leading-[1.05] md:text-[56px] max-w-[820px]">
          {MENSAJES.titular}
        </h1>

        <p className="mt-5 text-base md:text-lg leading-relaxed max-w-[640px]" style={{ color: 'var(--text-muted)' }}>
          {MENSAJES.bajada}
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/servicios" className="px-6 py-3.5 rounded-2xl text-sm k-cta">
            Ver planes y precios
          </Link>
          <Link to="/contacto" className="px-6 py-3.5 rounded-2xl text-sm k-cta-2">
            Hablar con ventas
          </Link>
        </div>

        <dl className="mt-14 grid gap-px sm:grid-cols-3" style={{ background: 'var(--border)' }}>
          {CIFRAS.map((c) => (
            <div key={c.etiqueta} className="px-5 py-6" style={{ background: 'var(--surface-2)' }}>
              <dt className="text-[28px] leading-none tabular">{c.dato}</dt>
              <dd className="text-[13px] mt-2.5 leading-snug" style={{ color: 'var(--text-faint)' }}>{c.etiqueta}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── El diferencial: cuándo entra la plata ───────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16">
          <h2 className="text-2xl md:text-3xl">Esto ya no es contraentrega</h2>
          <p className="mt-3 max-w-[680px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Contraentrega quiere decir que el dinero se cobra en la puerta, y que hasta ese
            momento la tienda puso el producto, el empaque y el flete. Kross mueve el cobro al
            principio: al despacho solo entran pedidos con el adelanto cobrado.
          </p>

          {/* En móvil la tabla se sale de pantalla y lo que queda cortado es
              justo la columna que importa —la de Kross—, así que ahí cada fila
              se lee como bloque y la tabla aparece recién en escritorio. */}
          <ul className="mt-8 grid gap-4 md:hidden">
            {COMPARATIVA.map((f) => (
              <li key={f.tema} className="rounded-3xl p-5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{f.tema}</p>
                <p className="mt-3 flex gap-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                  <X size={14} className="mt-0.5 shrink-0" /> {f.cod}
                </p>
                <p className="mt-2 flex gap-2 text-[13px] leading-relaxed">
                  <Check size={14} className="mt-0.5 shrink-0" /> {f.kross}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-10 overflow-x-auto hidden md:block">
            <table className="w-full min-w-[620px] text-left text-sm border-collapse">
              <thead>
                <tr style={{ color: 'var(--text-faint)' }}>
                  <th className="py-3 pr-4 font-normal text-[11px] uppercase tracking-wide w-[26%]"></th>
                  <th className="py-3 pr-4 font-normal text-[11px] uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1.5"><X size={13} /> Contraentrega pura</span>
                  </th>
                  <th className="py-3 font-normal text-[11px] uppercase tracking-wide" style={{ color: 'var(--text)' }}>
                    <span className="inline-flex items-center gap-1.5"><Check size={13} /> Con Kross</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVA.map((f) => (
                  <tr key={f.tema} style={{ borderTop: '1px solid var(--border)' }}>
                    <th scope="row" className="py-4 pr-4 align-top font-normal" style={{ color: 'var(--text-faint)' }}>
                      {f.tema}
                    </th>
                    <td className="py-4 pr-4 align-top leading-relaxed" style={{ color: 'var(--text-faint)' }}>{f.cod}</td>
                    <td className="py-4 align-top leading-relaxed" style={{ color: 'var(--text)' }}>{f.kross}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Cómo entra la plata ─────────────────────────────────────────── */}
      <section className="max-w-[1120px] mx-auto px-5 py-16">
        <h2 className="text-2xl md:text-3xl">Cómo entra la plata</h2>
        <p className="mt-3 max-w-[680px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Cuatro pasos, todos dentro de tu app. Nadie revisa capturas de pantalla ni dicta
          códigos por el chat.
        </p>

        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {PASOS_COBRO.map((p, i) => {
            const ultimo = i === PASOS_COBRO.length - 1
            return (
              <li key={p.titulo} className="rounded-3xl p-6"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs tabular"
                  style={ultimo
                    ? { background: 'var(--ok-bg)', color: 'var(--ok-on)' }
                    : { background: 'var(--surface-3)', color: 'var(--text-faint)' }}>
                  {i + 1}
                </span>
                <h3 className="mt-4 text-[15px]">{p.titulo}</h3>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.texto}</p>
              </li>
            )
          })}
        </ol>

        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {GARANTIAS.map((g) => (
            <li key={g} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <BadgeCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Los cuatro pilares ──────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16">
          <h2 className="text-2xl md:text-3xl">Qué hace Kross por tu tienda</h2>
          <p className="mt-3 max-w-[680px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Cobrar es el principio, no el final. La misma app se queda con el pedido hasta que
            se entrega y hasta que ese cliente vuelve a comprar.
          </p>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mt-10">
            {PILARES.map((p) => (
              <div key={p.titulo} className="rounded-3xl p-6"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                  {ICONOS[p.icono]}
                </span>
                <h3 className="mt-4 text-[15px]">{p.titulo}</h3>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── White-label ─────────────────────────────────────────────────── */}
      <section className="max-w-[1120px] mx-auto px-5 py-16">
        <div className="rounded-3xl p-8 md:p-10 grid gap-8 md:grid-cols-[1.1fr_.9fr] md:items-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
              <Store size={20} />
            </span>
            <h2 className="text-2xl md:text-3xl mt-5">Tu marca adelante. Nosotros atrás.</h2>
            <p className="mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Tus clientes compran en <span className="tabular" style={{ color: 'var(--text)' }}>tumarca.krossclub.app</span>,
              una app que se instala en su celular con tu logo, tus colores y tu nombre. Kross no
              aparece en ninguna pantalla de compra: por eso es la tecnología de tu tienda y no una
              plataforma donde alquilas un puesto.
            </p>
          </div>

          <ul className="grid gap-3">
            {[
              'App instalable propia, sin App Store ni Google Play de por medio',
              'Tu subdominio, tu logo, tu paleta y tu catálogo',
              'El chat del pedido y las notificaciones salen a nombre de tu marca',
              'Tus pixeles de Meta y TikTok miden en tu Events Manager, no en el nuestro',
            ].map((linea) => (
              <li key={linea} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <Check size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                <span>{linea}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Catálogo ────────────────────────────────────────────────────── */}
      <section id="catalogo" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-10">
            <div>
              <h2 className="text-2xl md:text-3xl">Planes y precios</h2>
              <p className="mt-3" style={{ color: 'var(--text-muted)' }}>
                Suscripción mensual, sin permanencia. Todos los precios están en soles e incluyen IGV.
              </p>
            </div>
            <Link to="/servicios" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--text)' }}>
              Ver el catálogo completo <ChevronRight size={16} />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOGO_VITRINA.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
          </div>
        </div>
      </section>

      {/* ── Cómo se contrata ────────────────────────────────────────────── */}
      <section className="max-w-[1120px] mx-auto px-5 py-16">
        <h2 className="text-2xl md:text-3xl">Cómo se contrata</h2>
        <div className="grid gap-5 md:grid-cols-4 mt-10">
          <Paso n={1} titulo="Elige tu plan" texto="Agrega al carrito el plan y los módulos que necesitas." />
          <Paso n={2} titulo="Revisa tu carrito" texto="Cambia cantidades y confirma el total antes de pagar." />
          <Paso n={3} titulo="Completa tus datos" texto="Nombre o razón social, RUC o DNI, correo y teléfono para tu comprobante." />
          <Paso n={4} titulo="Paga y activamos" texto="Registramos tu pedido con un código y montamos tu tienda." />
        </div>

        <div className="mt-8 flex items-center gap-3 text-[13px] rounded-2xl px-5 py-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Lock size={18} className="shrink-0" style={{ color: 'var(--text-faint)' }} />
          <p>
            Toda la web viaja cifrada con HTTPS (certificado SSL) en cada una de sus páginas, y los
            datos de tu pedido se guardan en servidores con acceso restringido.
          </p>
        </div>
      </section>

      {/* ── Contacto ────────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16">
          <h2 className="text-2xl md:text-3xl">¿Hablamos?</h2>
          <p className="mt-3" style={{ color: 'var(--text-muted)' }}>Atendemos {EMPRESA.horario.toLowerCase()}.</p>

          <div className="grid gap-4 md:grid-cols-3 mt-8">
            {EMPRESA.telefono && (
              <Contacto icon={<Phone size={16} />} label="Teléfono"
                valor={EMPRESA.telefono} href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} />
            )}
            {EMPRESA.email && (
              <Contacto icon={<Mail size={16} />} label="Correo" valor={EMPRESA.email} href={`mailto:${EMPRESA.email}`} />
            )}
            {EMPRESA.domicilioFiscal && (
              <Contacto icon={<MapPin size={16} />} label="Dirección" valor={EMPRESA.domicilioFiscal} />
            )}
          </div>

          <Link to="/contacto" className="inline-flex items-center gap-1 mt-8 text-sm" style={{ color: 'var(--text)' }}>
            Ver todos los datos de contacto <ChevronRight size={16} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}

function Paso({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs tabular"
        style={{ background: 'var(--surface-3)', color: 'var(--text-faint)' }}>
        {n}
      </span>
      <h3 className="mt-4 text-[15px]">{titulo}</h3>
      <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{texto}</p>
    </div>
  )
}

function Contacto({ icon, label, valor, href }: { icon: ReactNode; label: string; valor: string; href?: string }) {
  const cuerpo = (
    <div className="rounded-2xl px-5 py-4 h-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
        {icon} {label}
      </p>
      <p className="mt-2 break-words text-sm">{valor}</p>
    </div>
  )
  return href ? <a href={href} className="block hover:opacity-80">{cuerpo}</a> : cuerpo
}
