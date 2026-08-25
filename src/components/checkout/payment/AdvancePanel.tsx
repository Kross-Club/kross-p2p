// ─── SALES ENGINE · Panel del adelanto (vista de Ventas) ─────────────────────
// Lo que el equipo necesita para decidir si despacha: si el adelanto cuadró, y
// si no, qué hacer al respecto.
//
// Aquí vivía también el visor del comprobante —la captura de Yape que el
// comprador subía, abierta con URL firmada— y la ayuda del código de 3 dígitos
// para buscar el pago a mano en la app de la marca. Se eliminaron con el flujo
// manual: con 360pay no hay captura que revisar ni pago que buscar, porque el
// cupón lo cobra el banco y el webhook lo confirma en segundos.

import type { ReactElement } from 'react'
import { AlertTriangle, Check, Clock } from 'lucide-react'

interface AdvancePanelProps {
  advanceAmount: number
  verification: string | null
  /** Motivo escrito por el cobro. Puede venir aun habiendo cuadrado. */
  reason: string | null
  /** '360PAY' = el adelanto se cobra en línea con un cupón. NULL = la tienda no
   *  tiene cobro conectado y el adelanto lo coordina Ventas por el chat. */
  provider?: string | null
}

export default function AdvancePanel({
  advanceAmount, verification, reason, provider = null,
}: AdvancePanelProps): ReactElement | null {
  // Sin adelanto no hay nada que verificar.
  if (!advanceAmount || advanceAmount <= 0) return null

  const matched = verification === 'MATCHED'

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '1.5px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        {matched
          ? <Check size={15} className="flex-shrink-0" style={{ color: 'var(--ok-fg)' }} />
          : <Clock size={15} className="flex-shrink-0" style={{ color: '#F59E0B' }} />}
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          Adelanto S/{advanceAmount}
          <span className="ml-1 whitespace-nowrap" style={{ color: matched ? '#16A34A' : '#F59E0B' }}>
            {matched ? '✓ Verificado' : '· Sin cobrar'}
          </span>
        </p>
      </div>

      {/* El motivo, literal. Es lo que dice por qué un pedido con adelanto sigue
          sin cobrar, y sin él el panel solo mostraría un reloj naranja. */}
      {reason && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{reason}</span>
        </p>
      )}

      {/* La ayuda accionable depende de si la tienda cobra en línea o no. */}
      {!matched && (
        <p className="text-[11px] text-gray-500 mt-1.5">
          {provider === '360PAY'
            ? 'El cupón está emitido y aún sin pagar. El cliente puede pagarlo desde su Yape cuando quiera; si no lo hace, coordina por el chat.'
            : 'Esta marca no tiene cobro en línea conectado: coordina el adelanto por el chat.'}
        </p>
      )}
    </div>
  )
}
