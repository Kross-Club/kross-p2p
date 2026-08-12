// ─── SALES ENGINE · Cobro del adelanto en línea ──────────────────────────────
// Gemelo de OrderService: lo único del cobro que habla con el backend. Un solo
// fetch a `culqi-charge` — SIN script externo de Culqi en toda la PWA: la
// tokenización es server-to-server, así que el checkout no carga ni un byte de
// terceros en la pantalla donde se juega la venta.
//
// Nunca lanza: el pago falla de formas que la UI tiene que DISTINGUIR (código
// vencido ≠ sin saldo ≠ red caída post-cargo), no atrapar en un catch genérico.
// El mapeo user_message → userMessage ocurre AQUÍ, una sola vez: es la frontera
// snake_case (Edge Function) / camelCase (front).

import type { CulqiFailStage, CulqiFailure } from '../culqi-errors'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface CulqiChargeOk {
  ok: true
  chargeId: string | null
  amountPen: number
  /** El cargo ya existía (retry tras red caída, o el webhook llegó primero). */
  alreadyPaid?: boolean
  /** El cargo entró pero la base no lo registró aún: el webhook lo repara. */
  unrecorded?: boolean
}

export type CulqiChargeResult = CulqiChargeOk | ({ ok: false } & CulqiFailure)

const STAGES: CulqiFailStage[] = ['validation', 'config', 'token', 'charge', 'network_before', 'network_after']

export async function chargeAdvance(input: {
  orderToken: string
  phone: string
  otp: string
}): Promise<CulqiChargeResult> {
  let res: Response
  let body: Record<string, unknown> = {}
  try {
    res = await fetch(`${BASE}/culqi-charge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_token: input.orderToken, phone: input.phone, otp: input.otp }),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    // Ni siquiera alcanzamos NUESTRO backend: el cargo no pudo enviarse.
    return { ok: false, stage: 'network_before' }
  }

  if (body.ok === true) {
    return {
      ok: true,
      chargeId: typeof body.charge_id === 'string' ? body.charge_id : null,
      amountPen: typeof body.amount_pen === 'number' ? body.amount_pen : 0,
      alreadyPaid: body.already_paid === true || undefined,
      unrecorded: body.unrecorded === true || undefined,
    }
  }

  const stage = STAGES.includes(body.stage as CulqiFailStage)
    ? body.stage as CulqiFailStage
    // Un 5xx sin sobre reconocible viene de ANTES de tocar Culqi (o de un
    // proxy): tratarlo como network_before mantiene el reintento seguro.
    : 'network_before'

  return {
    ok: false,
    stage,
    code: typeof body.code === 'string' ? body.code : undefined,
    userMessage: typeof body.user_message === 'string' ? body.user_message : undefined,
  }
}
