// ─── Pedido confirmado ───────────────────────────────────────────────────────
// La pantalla que define el KPI del refactor: llegar aquí es la conversión.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el cruce automático no encontró el yape, para él sigue siendo un
// pedido registrado que un asesor está revisando — porque en la mayoría de esos
// casos el fallo es nuestro (la notificación no llegó, el lector estaba caído),
// no suyo.

import { Check } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import type { PaymentVerification } from '../../../lib/checkout/types'

interface OrderDoneProps {
  orderCode: string
  advance: number
  verification: PaymentVerification
  onClose: () => void
}

export default function OrderDone({ orderCode, advance, verification, onClose }: OrderDoneProps) {
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
        {advance > 0 ? COPY.doneAdvance : COPY.doneCod}
      </p>

      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Tu pedido</p>
      <p className="text-base font-black text-gray-800 mb-4">{orderCode}</p>

      {advance > 0 && (
        <div className="mx-auto max-w-[300px] rounded-2xl px-4 py-3 text-xs mb-5"
          style={verification === 'MATCHED'
            ? { background: '#F0FDF4', color: '#15803D' }
            : { background: '#F3F4F6', color: '#4B5563' }}>
          {verification === 'MATCHED'
            ? <>✅ {COPY.verifyMatched}</>
            : <>
                {COPY.verifying}
                {/* Poder cerrar sin miedo es lo que evita el mensaje de "¿mi
                    pedido se registró?" media hora después. */}
                <span className="block mt-1 text-[11px] opacity-80">{COPY.verifyingCanClose}</span>
              </>}
        </div>
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
