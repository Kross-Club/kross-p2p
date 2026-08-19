// ─── SALES ENGINE · Fallos del cobro en línea ────────────────────────────────
// Módulo puro: mapea el fallo que devuelve `culqi-charge` a la copy que ve el
// comprador y a la decisión de QUÉ puede hacer después. La distinción crítica:
//
//   network_before → el cargo nunca se envió: reintentar es gratis.
//   network_after  → el cargo SALIÓ y la respuesta se perdió: reintentar es
//                    arriesgar un doble cobro. La UI espera y consulta.
//
// El `user_message` de Culqi (cuando viene) se muestra tal cual: es copy
// pensada para el pagador y trae el motivo real ("sin saldo suficiente"), que
// es lo que decide si el comprador vuelve a intentar.

export type CulqiFailStage =
  | 'validation'      // entrada mal formada o pedido inelegible
  | 'config'          // la tienda no puede cobrar en línea (sin llaves, scope…)
  | 'token'           // el código de aprobación no fue aceptado (vencido/usado/typo)
  | 'charge'          // el cargo fue rechazado (saldo, límite, antifraude)
  | 'network_before'  // red caída ANTES de enviar el cargo
  | 'network_after'   // red caída DESPUÉS de enviarlo: el dinero pudo salir

export interface CulqiFailure {
  stage: CulqiFailStage
  code?: string
  userMessage?: string
}

const FALLBACK: Record<CulqiFailStage, string> = {
  validation: 'Revisa tu número y tu código de aprobación.',
  config: 'No pudimos procesar el pago en línea. Un asesor te escribirá para coordinarlo.',
  token: 'Tu código no fue aceptado. Genera uno nuevo en Yape e inténtalo de nuevo.',
  charge: 'El cargo no pasó. Revisa tu saldo de Yape e inténtalo con un código nuevo.',
  network_before: 'No pudimos conectar con el servicio de pagos. Inténtalo de nuevo.',
  network_after: 'Estamos confirmando tu pago. No vuelvas a pagar: si tu Yape ya se descontó, tu pedido se confirma solo.',
}

/** Copy del fallo. Prefiere el user_message de Culqi; nunca devuelve vacío. */
export function culqiFailureCopy(f: CulqiFailure): string {
  const msg = f.userMessage?.trim()
  return msg || FALLBACK[f.stage] || FALLBACK.charge
}

/**
 * ¿El reintento necesita un código de aprobación NUEVO?
 * token → sí (vencido o quemado) · charge → sí (el token es single-use: aunque
 * el rechazo fue por saldo, el mismo código ya no sirve) · network_before → no
 * (nunca se usó) · network_after → NO HAY reintento (ver arriba).
 */
export function needsNewOtp(f: CulqiFailure): boolean {
  return f.stage === 'token' || f.stage === 'charge'
}

/** ¿Se le puede ofrecer el botón de reintentar? network_after jamás. */
export function canRetry(f: CulqiFailure): boolean {
  return f.stage !== 'network_after'
}
