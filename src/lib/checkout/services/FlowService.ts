// ─── SALES ENGINE · Emisión de la orden de pago (Flow) ───────────────────────
// Lo que define toda la pantalla, y en qué se diferencia de 360pay: la
// respuesta trae un ENLACE, y el comprador SALE de la PWA a pagar en la página
// de Flow. No hay espera acá —no hay `AWAITING`— porque mientras paga no está
// mirando esta pantalla. Vuelve solo: Flow lo devuelve con un POST del
// navegador que `flow-return` convierte en un 302 a su pedido.
//
// Nunca lanza. Un fallo al emitir y una red caída piden cosas distintas de la
// UI, y un catch genérico las aplana.

import { esDeeplinkDeYape } from '../../../../supabase/functions/_shared/flow-yape-deeplink.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface FlowOrderIssued {
  ok: true
  /** A dónde mandar al comprador. Lo arma el SERVIDOR (`url?token=`). */
  payUrl: string
  amountPen: number
  /** El cobro ya estaba pagado (reapertura del modal, o el webhook ganó). */
  alreadyPaid?: boolean
  /**
   * El enlace que abre la app de Yape con la compra lista, sin pasar por la
   * página de Flow. Viene solo cuando el servidor pudo sacarlo (ver
   * `_shared/flow-yape-deeplink.ts`) y solo vale en un celular: en escritorio
   * abre la web de Yape, que no cobra. El front decide; `payUrl` sigue siendo
   * el camino oficial y siempre viene.
   */
  yapeDeeplink?: string
}

export interface FlowOrderFailed {
  ok: false
  /** `network_after` es el único que NO se reintenta solo: la orden pudo
   *  crearse. `flow-order` consulta la anterior antes de emitir otra, así que
   *  reintentar es seguro — pero se le dice al comprador que espere un poco. */
  stage: 'validation' | 'config' | 'order' | 'network_before' | 'network_after'
  code?: string
  userMessage?: string
}

export type FlowOrderResult = FlowOrderIssued | FlowOrderFailed

const STAGES = ['validation', 'config', 'order', 'network_before', 'network_after'] as const

/**
 * Pide la orden. `tipo`/`cobroId` igual que en `pay360-coupon`: sin nada es
 * el adelanto; `'saldo'` el segundo cobro; `cobroId` un cobro extra.
 */
export async function createFlowOrder(input: {
  orderToken: string
  tipo?: 'saldo'
  cobroId?: string
}): Promise<FlowOrderResult> {
  let body: Record<string, unknown>
  try {
    const res = await fetch(`${BASE}/flow-order`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input.cobroId
        ? { order_token: input.orderToken, cobro_id: input.cobroId }
        : { order_token: input.orderToken, tipo: input.tipo }),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    // Ni siquiera se alcanzó NUESTRO backend: no se emitió nada.
    return { ok: false, stage: 'network_before' }
  }

  if (body.ok === true) {
    // Solo un `https://` cuenta como enlace. Un '' o un esquema raro navegaría
    // a la nada, que es peor que no navegar.
    const payUrl = typeof body.pay_url === 'string' && body.pay_url.startsWith('https://') ? body.pay_url : ''
    if (!payUrl && body.already_paid !== true) return { ok: false, stage: 'order', code: 'no_pay_url' }
    // El deeplink pasa por el mismo filtro que en el servidor: es una URL que
    // vino de un HTML ajeno y se va a entregar al teléfono del comprador.
    const yapeDeeplink = typeof body.yape_deeplink === 'string' && esDeeplinkDeYape(body.yape_deeplink)
      ? body.yape_deeplink : undefined
    return {
      ok: true,
      payUrl,
      amountPen: typeof body.amount_pen === 'number' ? body.amount_pen : 0,
      alreadyPaid: body.already_paid === true || undefined,
      yapeDeeplink,
    }
  }

  const stage = (STAGES as readonly string[]).includes(body.stage as string)
    ? body.stage as FlowOrderFailed['stage']
    : 'network_before'

  return {
    ok: false,
    stage,
    code: typeof body.code === 'string' ? body.code : undefined,
    userMessage: typeof body.user_message === 'string' ? body.user_message : undefined,
  }
}

/**
 * Salir a pagar. En la MISMA pestaña, a propósito: es la lección de §17.d de
 * `06-360PAY.md` — la navegación tiene que ser la del propio tap, y una
 * pestaña nueva desde una PWA instalada es la que después no vuelve. Aparte,
 * el POST de retorno de Flow llega a la pestaña que navegó, y esa tiene que
 * ser la del pedido.
 */
export function goToFlow(payUrl: string): void {
  window.location.assign(payUrl)
}
