// ─── Pedido confirmado: el ticket y el recorrido ─────────────────────────────
// Lo que el comprador ve cuando su pedido ya existe. Vivía DENTRO del modal del
// checkout (`OrderDone`) y por eso era frágil: una X y no se veía nunca más.
// Desde el 07-set-2026 tiene URL propia (`/pedido/:token`, `MiPedidoPage`), que
// es lo que la hace recargable — y recargar es justo lo que hace el comprador
// para ver si su envío avanzó.
//
// Este archivo solo PINTA. El ticket se lo dan armado: desde el checkout con el
// estado del formulario, y desde la página con la fila del pedido
// (`ticket-desde-pedido.ts`). Así la misma pantalla sirve a los dos sin que
// ninguno sepa del otro.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el adelanto no está cobrado, para él sigue siendo un pedido
// registrado que un asesor va a coordinar. Eso lo resuelve `buildTicket`.
//
// Tres bloques, en orden:
//
//   1. EL TICKET: qué pidió, dónde lo recoge y con qué dirección, a nombre de
//      quién, y su guía con número apenas exista. Diseñado para capturarse.
//   2. EL RECORRIDO: en qué va el pedido y qué viene, como una línea vertical
//      de puntos. El saldo y el DNI no son cajas sueltas que gritan: son el
//      detalle del paso donde tocan.
//   3. LA APP: "¿te avisamos cuando llegue?" con un solo botón. En Android sale
//      el aviso del sistema y, al aceptar, se activan los avisos y se abre el
//      pedido. En iPhone Apple no deja instalar con un clic: se enseñan los dos
//      toques. Y el chat ya no se ofrece desde acá: seguimiento y consultas son
//      cosa de la app —el ticket, la guía y el teléfono sostienen al que no la
//      instala—.

import { useEffect, useState } from 'react'
import { Camera, Check, Download, ExternalLink, Phone, Smartphone } from 'lucide-react'
import { COPY } from '../../lib/checkout/checkout.config'
import type { Ticket, TicketStep } from '../../lib/checkout/ticket'
import { useStore } from '../../lib/store-context'
import { subscribePush } from '../../lib/push'
import { useIsDesktop } from '../../lib/use-desktop'
import { AndroidSteps, IOSSteps, isInstalled } from '../InstallBanner'

interface Props {
  /** Ya armado por quien llama: el checkout desde el formulario, la página
   *  desde la fila del pedido. Esta pantalla no consulta nada. */
  ticket: Ticket
  orderCode: string
  /** ¿El adelanto cruzó? Solo pinta de verde la primera frase. */
  paid: boolean
  /** Token del pedido: la llave de `/pedido/:token`, que la app abre al
   *  instalarse. */
  token?: string | null
  /** Id del pedido: a él se suscribe el push cuando el comprador instala. */
  sessionId?: string | null
}

export default function PedidoConfirmado({ ticket, orderCode, paid, token, sessionId }: Props) {
  const { store } = useStore()
  const phone = store.wa_display_phone?.trim() || null

  return (
    <div className="py-4">
      <div className="text-center mb-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: '#DCFCE7' }}
        >
          <Check size={28} strokeWidth={3} style={{ color: '#16A34A' }} />
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-1">{COPY.doneTitle}</h2>
        {/* La primera frase es el dinero: es lo que acaba de soltar y lo que
            va a buscar en la captura. */}
        <p className="text-sm font-bold px-4" style={{ color: paid ? '#15803D' : '#374151' }}>
          {ticket.payment}
        </p>
      </div>

      {/* ── El ticket ── */}
      <div className="rounded-2xl border-2 border-gray-900 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white">
          <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">
            {store.nombre || 'Tu pedido'}
          </span>
          <span className="text-base font-black tabular-nums">{orderCode}</span>
        </div>

        <dl className="divide-y divide-gray-100">
          {ticket.lines.map(l => (
            <div key={l.label} className="px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{l.label}</dt>
              <dd className="text-[15px] font-bold text-gray-900 leading-snug">{l.value}</dd>
              {l.detail && <dd className="text-sm text-gray-600 leading-snug mt-0.5">{l.detail}</dd>}
            </div>
          ))}

          {/* La guía: el NÚMERO como línea, porque es lo que la agencia
              pregunta y una captura no tiene botones; el botón debajo. */}
          {ticket.guide && (
            <div className="px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{ticket.guide.line.label}</dt>
              <dd className="text-[15px] font-bold text-gray-900 leading-snug tabular-nums">{ticket.guide.line.value}</dd>
              <dd className="mt-2">
                <a
                  href={ticket.guide.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-black
                    bg-gray-900 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                >
                  {COPY.doneSeeGuide} {ticket.guide.button} <ExternalLink size={13} />
                </a>
              </dd>
            </div>
          )}

          {phone && (
            <div className="px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                {COPY.doneCallStore} {store.nombre}
              </dt>
              <dd>
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-2 text-lg font-black text-gray-900 tabular-nums
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-md"
                >
                  <Phone size={18} strokeWidth={2.5} />
                  {phone}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* La captura es la persistencia de quien no va a volver. Se le dice con
          todas sus letras: no es obvio para quien no vive en apps. */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mb-5 px-4">
        <Camera size={14} className="flex-shrink-0" />
        {COPY.doneScreenshotHint}
      </p>

      {/* ── El recorrido ── */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 px-1">{COPY.doneTimelineTitle}</p>
      <Recorrido pasos={ticket.pasos} />

      {/* ── La app ── */}
      <InstalarApp token={token} sessionId={sessionId} nombre={store.nombre} logo={store.logo_url} />
    </div>
  )
}

/** La línea vertical de puntos: lo hecho en verde, lo actual con el color de
 *  la marca y latiendo, lo que viene en gris. */
function Recorrido({ pasos }: { pasos: TicketStep[] }) {
  return (
    <ol className="relative mb-6 pl-1">
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1
        const color = p.estado === 'hecho' ? '#16A34A' : p.estado === 'actual' ? 'var(--brand)' : '#D1D5DB'
        return (
          <li key={p.label} className="relative flex gap-3 pb-5">
            {!ultimo && (
              <span aria-hidden className="absolute left-[9px] top-5 bottom-0 w-0.5"
                style={{ background: p.estado === 'hecho' ? '#16A34A' : '#E5E7EB' }} />
            )}
            <span aria-hidden className="relative mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: color, boxShadow: p.estado === 'actual' ? '0 0 0 4px color-mix(in srgb, var(--brand) 25%, transparent)' : undefined }}>
              {p.estado === 'hecho' && <Check size={12} strokeWidth={3.5} className="text-white" />}
              {p.estado === 'actual' && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="min-w-0">
              <p className={`text-[15px] leading-snug ${p.estado === 'pendiente' ? 'text-gray-400 font-bold' : 'text-gray-900 font-black'}`}>
                {p.label}
              </p>
              {p.detail && (
                <p className={`text-sm leading-snug mt-0.5 ${p.estado === 'pendiente' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {p.detail}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * "¿Te avisamos cuando llegue?" y el botón de la app. Reusa el aviso de
 * instalación que `main.tsx` guarda en `__deferredInstallPrompt`; al aceptar,
 * se suscribe al push del pedido y abre `/p/:token` —que ahora es la app—.
 */
function InstalarApp({ token, sessionId, nombre, logo }: {
  token?: string | null; sessionId?: string | null; nombre: string; logo: string | null
}) {
  const desktop = useIsDesktop()
  const [prompt, setPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(
    () => (typeof window !== 'undefined' ? (window as { __deferredInstallPrompt?: never }).__deferredInstallPrompt ?? null : null),
  )
  const [instalada, setInstalada] = useState(() => (typeof window !== 'undefined' ? isInstalled() : false))
  const [ayuda, setAyuda] = useState(false)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const abrir = token ? `/p/${token}` : '/'

  useEffect(() => {
    const ready = () => setPrompt((window as { __deferredInstallPrompt?: never }).__deferredInstallPrompt ?? null)
    const installed = () => setInstalada(true)
    window.addEventListener('install-prompt-ready', ready)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('install-prompt-ready', ready)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  const instalar = async () => {
    if (!prompt) { setAyuda(true); return }
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    ;(window as { __deferredInstallPrompt?: unknown }).__deferredInstallPrompt = null
    setPrompt(null)
    if (outcome !== 'accepted') return
    // Los avisos son la razón por la que instaló: se piden en el mismo gesto.
    if (sessionId) await subscribePush({ sessionId, role: 'buyer' }).catch(() => {})
    setInstalada(true)
    window.location.assign(abrir)
  }

  return (
    <div className="rounded-2xl px-4 pt-4 pb-5 text-center"
      style={{ background: 'color-mix(in srgb, var(--brand) 8%, white)', border: '0.5px solid color-mix(in srgb, var(--brand) 35%, transparent)' }}>
      <Ilustracion logo={logo} nombre={nombre} />
      <p className="text-base font-black text-gray-900 leading-snug mt-3">{COPY.doneInstallQuestion}</p>
      <p className="text-sm text-gray-600 leading-snug mt-1 px-2">{COPY.doneInstallBody(nombre)}</p>

      {instalada ? (
        <a href={abrir} className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-base text-white
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ background: 'var(--brand)' }}>
          <Smartphone size={18} strokeWidth={2.5} /> {COPY.doneInstallOpen}
        </a>
      ) : isIOS ? (
        <div className="mt-3 flex flex-col items-center">
          <p className="text-xs text-gray-500 mb-1">{COPY.doneInstallIos}</p>
          <IOSSteps />
        </div>
      ) : (
        <>
          <button type="button" onClick={instalar}
            className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-base text-white
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: 'var(--brand)' }}>
            <Download size={18} strokeWidth={2.5} /> {COPY.doneInstallCta}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">{COPY.doneInstallSub}</p>
          {/* El navegador no dio el aviso de instalar (ya se rechazó una vez, o
              este Chrome no lo ofrece). Se enseña el camino del menú con las
              palabras exactas que va a leer, no una etiqueta inventada. */}
          {ayuda && (desktop
            ? <p className="text-[11px] text-gray-500 mt-2 px-2">{COPY.doneInstallDesktop}</p>
            : (
              <div className="mt-3">
                <p className="text-[11px] text-gray-500 mb-1">{COPY.doneInstallHelp}</p>
                <div className="flex justify-center"><AndroidSteps /></div>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

/** Un celular recibiendo los avisos del pedido, con el logo de la marca en la
 *  pantalla. Dibujado, no una foto: se pinta con el color de cada marca. */
function Ilustracion({ logo, nombre }: { logo: string | null; nombre: string }) {
  return (
    <div className="relative mx-auto w-[168px] h-[120px]" aria-hidden>
      <svg viewBox="0 0 168 120" className="w-full h-full">
        <rect x="58" y="6" width="52" height="108" rx="10" fill="#111827" />
        <rect x="62" y="12" width="44" height="96" rx="7" fill="#FFFFFF" />
        <rect x="76" y="14" width="16" height="3" rx="1.5" fill="#111827" />
        <g>
          <rect x="14" y="30" width="66" height="22" rx="7" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <rect x="21" y="36" width="10" height="10" rx="3" fill="var(--brand)" />
          <rect x="36" y="36" width="34" height="3.5" rx="1.75" fill="#111827" />
          <rect x="36" y="43" width="24" height="3" rx="1.5" fill="#9CA3AF" />
        </g>
        <g>
          <rect x="88" y="58" width="66" height="22" rx="7" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <rect x="95" y="64" width="10" height="10" rx="3" fill="#16A34A" />
          <rect x="110" y="64" width="34" height="3.5" rx="1.75" fill="#111827" />
          <rect x="110" y="71" width="20" height="3" rx="1.5" fill="#9CA3AF" />
        </g>
        <circle cx="84" cy="94" r="3" fill="var(--brand)" />
      </svg>
      <div className="absolute left-1/2 top-[38px] -translate-x-1/2 w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--brand)' }}>
        {logo
          ? <img src={logo} alt={nombre} className="w-full h-full object-cover" />
          : <Smartphone size={18} className="text-white" />}
      </div>
    </div>
  )
}
