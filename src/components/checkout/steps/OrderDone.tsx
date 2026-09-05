// ─── Pedido confirmado: el ticket ────────────────────────────────────────────
// La pantalla que define el KPI del refactor: llegar aquí es la conversión.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el adelanto no está cobrado, para él sigue siendo un pedido
// registrado que un asesor va a coordinar.
//
// Rediseño del 05-set-2026 (ver `01-SALES-ENGINE.md` § Pantalla final): esta
// pantalla se diseña para SER CAPTURADA. El comprador que más nos importa —en
// provincia, con poca costumbre digital— no instala la app ni vuelve al chat;
// guarda capturas. Así que todo lo que va a necesitar el día que le avisen que
// su paquete llegó cabe aquí, en su idioma: qué pidió, dónde lo recoge y con
// qué dirección, cuánto pagó y cuánto falta, su guía si ya salió, qué llevar,
// qué sigue y a quién llamar. Nada que lo obligue a volver.
//
// Aquí vivía un polling de 22 consultas que esperaba a que el cruce manual
// encontrara su yape. Murió con el flujo manual: hoy esta pantalla solo se
// alcanza con el pago YA confirmado por el webhook (`paid`), o sin nada que
// esperar —la tienda no cobra en línea, o el comprador pidió que lo llamen—.
// Lo que sí se espera, y poco, es LA GUÍA: el webhook del pago la dispara en
// segundo plano, así que puede nacer mientras el comprador mira esta pantalla.

import { useEffect, useState } from 'react'
import { Camera, Check, ExternalLink, MessageCircle, Phone } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { buildTicket } from '../../../lib/checkout/ticket'
import type { TicketGuide } from '../../../lib/checkout/ticket'
import { AgencyService } from '../../../lib/checkout/services/AgencyService'
import { getSession } from '../../../lib/order-api'
import { enlaceDeGuia } from '../../../lib/hoja-de-guia'
import { useStore } from '../../../lib/store-context'
import type { AgencyBranch, CheckoutState, PaymentVerification } from '../../../lib/checkout/types'

interface OrderDoneProps {
  orderCode: string
  state: CheckoutState
  /** Precio efectivo del pack, el mismo que vio en el paso 3. */
  price: number
  packName: string | null
  verification: PaymentVerification
  /** Token del pedido: abre su chat en `/p/:token`. */
  token?: string | null
  /** El comprador eligió que lo contacte un asesor en vez de pagar ahora: no
   *  se muestra la caja del adelanto, porque no hay pago en vuelo. */
  unpaid?: boolean
}

/** Cuánto se espera la guía: cada 4 s durante un minuto. Más que eso y el
 *  comprador ya se fue; la guía le llega igual por el chat y el aviso. */
const GUIDE_POLL_MS = 4_000
const GUIDE_POLL_MAX = 15

export default function OrderDone({ orderCode, state, price, packName, verification, token, unpaid }: OrderDoneProps) {
  const { store } = useStore()
  const paid = verification === 'MATCHED'
  const isAgency = state.deliveryMethod === 'AGENCIA'

  // La sede en palabras y con dirección. El catálogo ya está cargado porque el
  // comprador acaba de elegirla; si por lo que sea no está, el ticket cae al
  // distrito y no promete una dirección que no tiene.
  const [branch, setBranch] = useState<AgencyBranch | null>(null)
  const { agency, branchId } = state.pickup
  useEffect(() => {
    if (!isAgency || !agency || !branchId) return
    let alive = true
    AgencyService.getBranch(agency, branchId)
      .then(b => { if (alive) setBranch(b) })
      .catch(() => { /* el ticket cae al distrito */ })
    return () => { alive = false }
  }, [isAgency, agency, branchId])

  // La guía, si nace mientras mira. Solo con el adelanto confirmado —es lo que
  // autoriza a emitirla— y solo en agencia. El botón abre el mejor documento
  // disponible, con la misma regla que la tarjeta del chat: el PDF del courier
  // si la API lo trajo, y si no la hoja de guía de la app.
  const [guide, setGuide] = useState<TicketGuide | null>(null)
  useEffect(() => {
    if (!paid || !isAgency || !token) return
    let alive = true
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      tries += 1
      try {
        const d = await getSession(token)
        const s = d.session
        if (!alive) return
        if (s.tracking_numero || s.tracking_ose_id) {
          const pdf = d.messages.find(m => m.type === 'guia' && m.media_url)?.media_url ?? null
          setGuide({
            courier: s.tracking_courier ?? null,
            numero: s.tracking_numero ?? null,
            codigo: s.tracking_codigo ?? null,
            oseId: s.tracking_ose_id ?? null,
            href: pdf ?? enlaceDeGuia(token),
          })
          return
        }
      } catch { /* sin red o sin pedido: se reintenta hasta el tope */ }
      if (alive && tries < GUIDE_POLL_MAX) timer = setTimeout(tick, GUIDE_POLL_MS)
    }
    timer = setTimeout(tick, GUIDE_POLL_MS)
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [paid, isAgency, token])

  const ticket = buildTicket({ state, price, packName, paid, unpaid: !!unpaid, branch, guide })
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

          {ticket.balance && (
            <div className="px-4 py-3" style={{ background: '#FFFBEB' }}>
              <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#92400E' }}>
                {ticket.balance.label}
              </dt>
              <dd className="text-lg font-black tabular-nums" style={{ color: '#78350F' }}>{ticket.balance.value}</dd>
              {ticket.balance.detail && (
                <dd className="text-sm leading-snug mt-0.5" style={{ color: '#92400E' }}>{ticket.balance.detail}</dd>
              )}
            </div>
          )}

          {ticket.bring.length > 0 && (
            <div className="px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{COPY.doneBringTitle}</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {ticket.bring.map(b => (
                    <li key={b} className="flex items-start gap-2 text-[15px] font-bold text-gray-900 leading-snug">
                      <Check size={16} strokeWidth={3} className="mt-0.5 flex-shrink-0" style={{ color: '#16A34A' }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}

          <div className="px-4 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{COPY.doneNextTitle}</dt>
            <dd className="text-[15px] text-gray-900 leading-snug">{ticket.next}</dd>
          </div>

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

      {/* El chat es soporte y seguimiento, ya no "el canal": el ticket, la
          guía y el teléfono sostienen al que no entra. Sigue siendo la ÚNICA
          acción, y salir sigue siendo la X de la cabecera (`requestClose`). */}
      {token && (
        <>
          <a
            href={`/p/${token}`}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-base
              bg-green-500 text-white shadow-lg shadow-green-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
          >
            <MessageCircle size={18} strokeWidth={2.5} />
            {COPY.doneOpenChat}
          </a>
          <p className="text-[11px] text-gray-400 mt-2 px-4 text-center">{COPY.doneChatHint}</p>
        </>
      )}
    </div>
  )
}
