// ─── SALES ENGINE · Verificación del adelanto (Yape) ─────────────────────────
// El detector de yapes es un servicio EXTERNO que ya existe y está pagado; su
// integración se hará después. Este archivo es la costura: define el contrato y
// trae una implementación mock para que Fase 3 se pueda construir y probar
// completa. Enchufar el real es cambiar la implementación, no la UI.
//
// Reglas que NO son negociables al enchufarlo:
//   · La transición a `confirmado` la hace el BACKEND al recibir el match. El
//     front solo se suscribe al cambio y repinta.
//   · Un comprobante UNMATCHED nunca se rechaza automáticamente ni se le dice al
//     comprador que su pago no existe. Solo se enruta a revisión humana.
//   · Si a los 20 s sigue PENDING, se deja de bloquear la UI. El pedido ya está
//     registrado y el comprador puede cerrar la ventana.

import type { PaymentVerification } from '../types'

export interface VerificationResult {
  status: PaymentVerification
  matchedAt: string | null
  /** Por qué no cuadró — para quien revisa, jamás para el comprador. */
  reason: string | null
}

export interface PaymentVerifier {
  /**
   * Arranca el cotejo apenas se sube la imagen, NO al hacer submit. Así, cuando
   * el comprador toca "Terminar pedido", el match casi siempre ya está resuelto.
   */
  start(input: { orderId: string; voucherUrl: string; amount: number }): Promise<void>

  /**
   * Escucha el veredicto. Devuelve la función para cancelar la suscripción.
   * El real se apoyará en Realtime de Supabase sobre el pedido.
   */
  subscribe(orderId: string, onResult: (result: VerificationResult) => void): () => void
}

/**
 * Mock: deja todo en PENDING y no inventa un veredicto. Un mock que simulara
 * MATCHED daría una falsa sensación de que el flujo automático ya funciona —
 * hasta que exista el servicio real, todo pedido con adelanto va a revisión
 * humana, que es exactamente lo que pasa hoy en producción.
 */
export const mockVerifier: PaymentVerifier = {
  async start() {
    // No hace nada: el comprobante queda subido y visible para el asesor.
  },
  subscribe(_orderId, onResult) {
    const timer = setTimeout(
      () => onResult({ status: 'PENDING', matchedAt: null, reason: 'Verificación automática aún no integrada' }),
      0,
    )
    return () => clearTimeout(timer)
  },
}

let verifier: PaymentVerifier = mockVerifier

/** Enchufa el verificador real cuando el servicio externo esté integrado. */
export function setPaymentVerifier(next: PaymentVerifier): void {
  verifier = next
}

export const PaymentVerificationService: PaymentVerifier = {
  start: input => verifier.start(input),
  subscribe: (orderId, onResult) => verifier.subscribe(orderId, onResult),
}
