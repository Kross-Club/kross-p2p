// ─── Pedido confirmado ───────────────────────────────────────────────────────
// La pantalla que define el KPI del refactor: llegar aquí es la conversión.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el adelanto no está cobrado, para él sigue siendo un pedido
// registrado que un asesor va a coordinar.
//
// Aquí vivía un polling de 22 consultas que esperaba a que el cruce manual
// encontrara su yape. Murió con el flujo manual: hoy esta pantalla solo se
// alcanza con el pago YA confirmado por el webhook (`paid`), o sin nada que
// esperar —la tienda no cobra en línea, o el comprador pidió que lo llamen—.
// Consultar en esos casos era gastarle la batería a cambio de nada.

import { Check, MessageCircle } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import type { PaymentVerification } from '../../../lib/checkout/types'

interface OrderDoneProps {
  orderCode: string
  advance: number
  verification: PaymentVerification
  /** Token del pedido: abre su chat en `/p/:token`. */
  token?: string | null
  /** El comprador eligió que lo contacte un asesor en vez de pagar ahora: no
   *  se muestra la caja del adelanto, porque no hay pago en vuelo. */
  unpaid?: boolean
}

export default function OrderDone({ orderCode, advance, verification, token, unpaid }: OrderDoneProps) {
  const paid = verification === 'MATCHED'

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
          style={paid
            ? { background: '#F0FDF4', color: '#15803D' }
            : { background: '#F3F4F6', color: '#4B5563' }}>
          {paid
            ? <>✅ {COPY.verifyMatched}</>
            : <>
                {COPY.advancePendingByChat}
                {/* Poder cerrar sin miedo es lo que evita el mensaje de "¿mi
                    pedido se registró?" media hora después. */}
                <span className="block mt-1 text-[11px] opacity-80">{COPY.verifyingCanClose}</span>
              </>}
        </div>
      )}

      {/* El chat es lo que convierte "ya compré" en "sé por dónde me van a
          escribir", y ahí vive el rastreo de la entrega. Es la ÚNICA acción de
          esta pantalla, en verde sólido: un segundo botón compitiendo ("Listo")
          repartía el toque entre irse y entrar, y el que se va sin pasar por el
          chat es exactamente el que después no reconoce quién le escribe — el
          motivo número uno de que un pedido COD no se recoja.
          Salir sigue existiendo: la X de la cabecera, que con el pedido ya
          registrado cierra directo, sin retenerlo con nada (ver `requestClose`
          en CheckoutModal). Ofrecerse, no empujar, se sostiene: es una salida
          menos ruidosa, no una salida cerrada. */}
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
          <p className="text-[11px] text-gray-400 mt-2 px-4">{COPY.doneChatHint}</p>
        </>
      )}
    </div>
  )
}
