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
// qué dirección, cuánto pagó y cuánto falta, qué llevar, qué sigue y a quién
// llamar. Nada que lo obligue a volver.
//
// Aquí vivía un polling de 22 consultas que esperaba a que el cruce manual
// encontrara su yape. Murió con el flujo manual: hoy esta pantalla solo se
// alcanza con el pago YA confirmado por el webhook (`paid`), o sin nada que
// esperar —la tienda no cobra en línea, o el comprador pidió que lo llamen—.

import { useEffect, useState } from 'react'
import { Camera, Check, MessageCircle, Phone } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { buildTicket } from '../../../lib/checkout/ticket'
import { AgencyService } from '../../../lib/checkout/services/AgencyService'
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

export default function OrderDone({ orderCode, state, price, packName, verification, token, unpaid }: OrderDoneProps) {
  const { store } = useStore()
  const paid = verification === 'MATCHED'

  // La sede en palabras y con dirección. El catálogo ya está cargado porque el
  // comprador acaba de elegirla; si por lo que sea no está, el ticket cae al
  // distrito y no promete una dirección que no tiene.
  const [branch, setBranch] = useState<AgencyBranch | null>(null)
  const { agency, branchId } = state.pickup
  const wantsBranch = state.deliveryMethod === 'AGENCIA' && !!agency && !!branchId
  useEffect(() => {
    if (!wantsBranch || !agency || !branchId) return
    let alive = true
    AgencyService.getBranch(agency, branchId)
      .then(b => { if (alive) setBranch(b) })
      .catch(() => { if (alive) setBranch(null) })
    return () => { alive = false }
  }, [wantsBranch, agency, branchId])

  const ticket = buildTicket({ state, price, packName, paid, unpaid: !!unpaid, branch: wantsBranch ? branch : null })
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

      {/* El chat sigue siendo la ÚNICA acción: ahí vive el rastreo y por ahí
          se paga el saldo. Pero ya no es la única forma de no perderse: el
          ticket de arriba y el aviso al celular sostienen al que no entra.
          Salir sigue siendo la X de la cabecera (ver `requestClose`). */}
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
