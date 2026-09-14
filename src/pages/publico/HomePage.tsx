import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign, Zap, Truck, Repeat, ChevronRight, Lock, Check,
  Phone, Mail, MapPin, Store, BadgeCheck,
} from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import TarjetaServicio from '../../components/publico/TarjetaServicio'
import { CATALOGO, CATALOGO_VITRINA, precioTexto, periodoTexto } from '../../config/catalogo'
import { EMPRESA } from '../../config/empresa'
import {
  MENSAJES, CIFRAS, PILARES, PARA_QUIEN, EXPERIENCIA, PASOS_COBRO, GARANTIAS, type IconoPilar,
} from '../../config/propuesta'

// ─── Portada de krossclub.app ────────────────────────────────────────────────
//
// Qué vende esta página, en una línea: **Kross es la tecnología de tu tienda**:
// el pedido se cobra completo antes de despachar y el cliente lo vive bajo la
// marca, desde el celular.
//
// El rediseño de ago-2026 cambió las dos cosas que decía la portada anterior:
//
//  · **El posicionamiento.** Decía "software para comercio contraentrega".
//    Contraentrega significa que todo el dinero se cobra en la puerta, y eso
//    dejó de ser lo que hace el producto: el checkout cobra el pedido dentro
//    del formulario, con Yape validado solo. Hasta set-2026 la portada lo
//    discutía con una comparativa «Esto ya no es contraentrega»; con el foco
//    en marcas con stock (14-set-2026) esa discusión sobra —ese cliente nunca
//    fue COD— y la sección pasó a ser para quién es y qué vive su cliente.
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

/** El plan que se contrata en la web. Sale del catálogo y no de un número
 *  escrito acá: dos sitios con el mismo precio se separan en cuanto uno cambia,
 *  y el que se queda viejo es siempre el que nadie recuerda que existe. */
const PLAN = CATALOGO.find(i => i.altaDirecta) ?? CATALOGO[0]

export default function HomePage() {
  return (
    <PublicLayout>
      {/* ── Hero ───────────────────────────────────────────────────────────
          §5 fija 20–28 px para el titular de una PANTALLA del producto. Una
          portada no es una pantalla de trabajo: acá el titular crece, pero
          sigue en peso 500 y sin degradados, que es lo que el manual protege. */}
      <section className="max-w-[1120px] mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
        <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
          Software peruano para marcas que venden en línea
        </p>

        <h1 className="mt-4 text-[34px] leading-[1.05] md:text-[56px] max-w-[820px]">
          {MENSAJES.titular}
        </h1>

        <p className="mt-5 text-base md:text-lg leading-relaxed max-w-[640px]" style={{ color: 'var(--text-muted)' }}>
          {MENSAJES.bajada}
        </p>

        {/* §54: el primer botón ya no manda a mirar, manda a EMPEZAR. El alta
            entera son dos campos y el pago, así que interponer una pantalla de
            catálogo entre la intención y el alta es gastar la intención. Quien
            todavía quiere comparar tiene los planes al lado. */}
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/empezar" className="px-6 py-3.5 rounded-2xl text-sm k-cta">
            Crear mi tienda
          </Link>
          <Link to="/servicios" className="px-6 py-3.5 rounded-2xl text-sm k-cta-2">
            Ver planes y precios
          </Link>
        </div>

        {/* El precio, junto al botón que lleva a pagarlo. Estuvo un día sin
            estar: el visitante pulsaba «Crear mi tienda» y los $67 aparecían
            por primera vez en la pantalla de Stripe. Además de perder gente,
            un precio que solo se ve en el checkout es justo lo que el
            requisito de la pasarela prohíbe (`docs/04-CUMPLIMIENTO-WEB.md`). */}
        <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          <strong className="tabular" style={{ color: 'var(--text)' }}>
            {precioTexto(PLAN.precio, PLAN.moneda)} {periodoTexto(PLAN.periodo)}
          </strong>
          {' · '}sin permanencia, cancelas cuando quieras.
        </p>

        <dl className="mt-14 grid gap-px sm:grid-cols-3" style={{ background: 'var(--border)' }}>
          {CIFRAS.map((c) => (
            <div key={c.etiqueta} className="px-5 py-6" style={{ background: 'var(--surface-2)' }}>
              <dt className="text-[28px] leading-none tabular">{c.dato}</dt>
              <dd className="text-[13px] mt-2.5 leading-snug" style={{ color: 'var(--text-faint)' }}>{c.etiqueta}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Para quién es, y qué vive su cliente ────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1120px] mx-auto px-5 py-16">
          <h2 className="text-2xl md:text-3xl">{PARA_QUIEN.titulo}</h2>
          <p className="mt-3 max-w-[680px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {PARA_QUIEN.texto}
          </p>
          <ul className="mt-6 grid gap-2.5 md:grid-cols-2 max-w-[820px]">
            {PARA_QUIEN.senas.map((s) => (
              <li key={s} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <Check size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                <span>{s}</span>
              </li>
            ))}
          </ul>

          {/* La experiencia de SU cliente, bajo SU marca. Es lo que se compra:
              no un cobrador, sino que comprarle se sienta como comprarle a una
              marca — desde el celular, sin que nadie del equipo lo persiga. */}
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {EXPERIENCIA.map((e) => (
              <div key={e.titulo} className="rounded-3xl p-5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h3 className="text-[15px]">{e.titulo}</h3>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{e.texto}</p>
              </div>
            ))}
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
                Suscripción mensual, sin permanencia. El plan se cobra en dólares con tarjeta; los
                servicios adicionales, en soles con IGV incluido.
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
        {/* El flujo REAL del alta automática (§54): dos datos, Stripe, y la
            tienda existe al volver. Antes describía un carrito con RUC y
            comprobante que el plan ya no recorre. */}
        <div className="grid gap-5 md:grid-cols-4 mt-10">
          <Paso n={1} titulo="Elige el plan" texto={`${PLAN.nombre}, ${precioTexto(PLAN.precio, PLAN.moneda)} ${periodoTexto(PLAN.periodo)}. Sin permanencia.`} />
          <Paso n={2} titulo="Pon tu marca y tu nombre" texto="Dos datos y nada más: con eso reservamos tu subdominio." />
          <Paso n={3} titulo="Paga con tarjeta" texto="La suscripción se cobra por Stripe, en dólares." />
          <Paso n={4} titulo="Entra a tu panel" texto="Al volver, tu tienda ya existe: pones tu contraseña y subes tu primer producto." />
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
