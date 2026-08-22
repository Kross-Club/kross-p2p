// ─── SALES ENGINE · Emisión del cupón de adelanto (360pay) ───────────────────
// Lo que define toda la pantalla: la respuesta NO dice si se pagó. Dice cómo
// pagar. El "sí, entró" llega después por el webhook, y el front lo ve por el
// polling del pedido.
//
// Nunca lanza. Un fallo al emitir y una red caída piden cosas distintas de la
// UI, y un catch genérico las aplana.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface CouponIssued {
  ok: true
  /** Enlace que abre Yape pre-llenado. Lo arma el servidor: el front no conoce
   *  los identificadores de Yape ni puede alterar a qué servicio apunta.
   *  `null` = sin botón; el cupón se paga tecleando el código en Yape. */
  deeplink: string | null
  consumerCode: string
  amountPen: number
  /** El adelanto ya estaba pagado (reapertura del modal, o el webhook ganó). */
  alreadyPaid?: boolean
}

export interface CouponFailed {
  ok: false
  /** `network_after` es el único que NO se reintenta solo: el cupón pudo
   *  crearse, y dos cupones vivos significan que el banco cobra el más antiguo
   *  — o sea, el comprador pagaría el que no era. */
  stage: 'validation' | 'config' | 'coupon' | 'network_before' | 'network_after'
  code?: string
  userMessage?: string
}

export type CouponResult = CouponIssued | CouponFailed

const STAGES = ['validation', 'config', 'coupon', 'network_before', 'network_after'] as const

export async function issueCoupon(input: { orderToken: string }): Promise<CouponResult> {
  let body: Record<string, unknown>
  try {
    const res = await fetch(`${BASE}/pay360-coupon`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_token: input.orderToken }),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    // Ni siquiera se alcanzó NUESTRO backend: no se emitió nada.
    return { ok: false, stage: 'network_before' }
  }

  if (body.ok === true) {
    return {
      ok: true,
      // Solo un `https://` cuenta como enlace. Un '' o un esquema raro pintaría
      // un botón que no abre nada, que es peor que no tener botón.
      deeplink: typeof body.deeplink === 'string' && body.deeplink.startsWith('https://')
        ? body.deeplink : null,
      consumerCode: typeof body.consumer_code === 'string' ? body.consumer_code : '',
      amountPen: typeof body.amount_pen === 'number' ? body.amount_pen : 0,
      alreadyPaid: body.already_paid === true || undefined,
    }
  }

  const stage = (STAGES as readonly string[]).includes(body.stage as string)
    ? body.stage as CouponFailed['stage']
    // Un 5xx sin sobre reconocible viene de ANTES de tocar 360pay (o de un
    // proxy): tratarlo como network_before mantiene el reintento seguro.
    : 'network_before'

  return {
    ok: false,
    stage,
    code: typeof body.code === 'string' ? body.code : undefined,
    userMessage: typeof body.user_message === 'string' ? body.user_message : undefined,
  }
}
