// ─── Pedido confirmado ───────────────────────────────────────────────────────
// La pantalla que define el KPI del refactor: llegar aquí es la conversión.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el cruce automático no encontró el yape, para él sigue siendo un
// pedido registrado que un asesor está revisando — porque en la mayoría de esos
// casos el fallo es nuestro (la notificación no llegó, el lector estaba caído),
// no suyo.

import { useEffect, useState } from 'react'
import { Check, MessageCircle } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { fetchPaymentVerification } from '../../../lib/checkout/services/OrderService'
import type { PaymentVerification } from '../../../lib/checkout/types'

interface OrderDoneProps {
  orderCode: string
  advance: number
  verification: PaymentVerification
  /** Token del pedido: abre su chat en `/p/:token`. */
  token?: string | null
  /** Cobro en línea fallido y el comprador eligió que lo contacte un asesor:
   *  ni caja de verificación ni polling — no hay pago en vuelo que esperar. */
  unpaid?: boolean
  onClose: () => void
}

/** Cada cuánto se vuelve a preguntar y por cuánto tiempo. El yape cruza en
 *  segundos cuando el lector está sano; pasado el minuto y medio el comprador
 *  ya cerró o se fue al chat, y seguir preguntando solo gasta su batería. */
const POLL_MS = 4000
const POLL_LIMIT = 22

export default function OrderDone({ orderCode, advance, verification, token, unpaid, onClose }: OrderDoneProps) {
  // El estado del cruce llega DESPUÉS de esta pantalla: el comprador termina el
  // pedido y su yape puede entrar segundos más tarde. Sin esto la caja se queda
  // en "Estamos verificando" para siempre aunque el pago ya haya cuadrado, y el
  // comprador se va con la duda —que es exactamente el mensaje de WhatsApp que
  // este checkout existe para evitar.
  //
  // Con el cobro Culqi exitoso, `verification` YA llega 'MATCHED' por prop: la
  // caja nace verde y el polling ni se monta — la espera que este efecto
  // acompaña es exactamente lo que el cobro directo eliminó.
  const [live, setLive] = useState<PaymentVerification>(verification)

  useEffect(() => {
    // Ya cuadró, no hay adelanto que esperar, no hay pago en vuelo (unpaid), o
    // no hay token con qué preguntar.
    if (!token || advance <= 0 || live === 'MATCHED' || unpaid) return
    let tries = 0
    let cancelled = false

    const id = setInterval(async () => {
      if (cancelled || ++tries > POLL_LIMIT) { clearInterval(id); return }
      // Si la consulta falla se ignora en silencio: el pedido YA está registrado
      // y esto es solo un adorno. Un error de red no puede alarmar al comprador.
      const v = await fetchPaymentVerification(token)
      if (!cancelled && v === 'MATCHED') { setLive(v); clearInterval(id) }
    }, POLL_MS)

    return () => { cancelled = true; clearInterval(id) }
  }, [token, advance, live, unpaid])

  return (
    <div className="py-6 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: '#DCFCE7' }}
      >
        <Check size={30} strokeWidth={3} style={{ color: '#16A34A' }} />
      </div>

      <h2 className="text-xl font-black text-gray-900 mb-1">{COPY.doneTitle}</h2>
      <p className="text-sm text-gray-500 mb-4 px-4">
        {unpaid ? COPY.doneUnpaid : advance > 0 ? COPY.doneAdvance : COPY.doneCod}
      </p>

      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Tu pedido</p>
      <p className="text-base font-black text-gray-800 mb-4">{orderCode}</p>

      {advance > 0 && !unpaid && (
        <div className="mx-auto max-w-[300px] rounded-2xl px-4 py-3 text-xs mb-5"
          style={live === 'MATCHED'
            ? { background: '#F0FDF4', color: '#15803D' }
            : { background: '#F3F4F6', color: '#4B5563' }}>
          {live === 'MATCHED'
            ? <>✅ {COPY.verifyMatched}</>
            : <>
                {COPY.verifying}
                {/* Poder cerrar sin miedo es lo que evita el mensaje de "¿mi
                    pedido se registró?" media hora después. */}
                <span className="block mt-1 text-[11px] opacity-80">{COPY.verifyingCanClose}</span>
              </>}
        </div>
      )}

      {/* El chat es lo que convierte "ya compré" en "sé por dónde me van a
          escribir". Va ANTES del botón de cerrar y con peso visual propio, pero
          se OFRECE, no se empuja: sacarlo de aquí automáticamente, justo después
          de que entregó su plata, se siente a arrebato. Por eso "Listo" se
          queda — el que quiere cerrar tiene que poder cerrar. */}
      {token && (
        <>
          <a
            href={`/p/${token}`}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-base
              border-2 border-green-500 text-green-700 bg-white
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
          >
            <MessageCircle size={18} strokeWidth={2.5} />
            {COPY.doneOpenChat}
          </a>
          <p className="text-[11px] text-gray-400 mt-2 mb-3 px-4">{COPY.doneChatHint}</p>
        </>
      )}

      <button
        onClick={onClose}
        className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-base shadow-lg shadow-green-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
      >
        {COPY.doneClose}
      </button>
    </div>
  )
}
