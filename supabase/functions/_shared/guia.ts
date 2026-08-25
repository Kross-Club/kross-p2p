// ─── Registrar la guía en el pedido — COMPARTIDO entre sus dos orígenes ──────
// La guía puede entrar al pedido por dos caminos:
//   · A MANO — Logística la copia del comprobante físico en `TrackingBar`
//     (`order-manage` · set_tracking). Fue el único durante todo el tracking.
//   · SOLA — `shalom-order` la pide al proveedor cuando el adelanto cuadra.
//
// Lo que pasa DESPUÉS tiene que ser idéntico venga por donde venga: mismas
// validaciones, mismo mensaje al comprador, misma suscripción al webhook. Por
// eso vive acá y no duplicado — misma razón por la que el reflejo de fases vive
// en `tracking.ts` (si un pedido hablara dos idiomas según por dónde llegó la
// noticia, la mitad de los envíos quedaría fuera de la cascada).

import { broadcast, chatMessage, supabase } from './tracking.ts'
import { shalomApiKey } from './shalom.ts'
import { normalizeYear } from './olva.ts'

export type Courier = 'SHALOM' | 'OLVA'

/** Lo que el pedido necesita aportar para registrar una guía. */
export interface GuiaSession {
  id: string
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  agency_name: string | null
}

export interface GuiaInput {
  courier?: string | null
  numero?: string | null
  codigo?: string | null
  ose_id?: string | null
  /** Solo Olva: año de emisión (YY). Sin él su API no rastrea. */
  year?: string | null
}

export interface TrackingPatch {
  tracking_courier: Courier
  tracking_numero: string | null
  tracking_codigo: string | null
  tracking_ose_id: string | null
  tracking_year: string | null
  tracking_phase: null
  tracking_phase_at: null
  tracking_demora_at: null
  tracking_checked_at: null
}

export type GuiaNormalizada =
  | { ok: true; courier: Courier; tracking: TrackingPatch; ids: string }
  | { ok: false; error: 'unsupported_courier' | 'invalid_tracking' }

/**
 * Valida como la API real de cada courier: Shalom exige numero (8–10 dígitos)
 * Y codigo (4 alfanuméricos) juntos, o solo ose_id; Olva rastrea por numero +
 * año de emisión, sin código.
 */
export function normalizarGuia(t: GuiaInput, agencyName: string | null, now = Date.now()): GuiaNormalizada {
  const courier = String(t.courier ?? agencyName ?? '').toUpperCase()
  if (courier !== 'SHALOM' && courier !== 'OLVA') return { ok: false, error: 'unsupported_courier' }

  const numero = String(t.numero ?? '').replace(/\D/g, '')
  const codigo = String(t.codigo ?? '').trim().toUpperCase()
  const oseId = String(t.ose_id ?? '').replace(/\D/g, '')
  const numeroOk = courier === 'SHALOM' ? /^\d{8,10}$/.test(numero) : /^\d{6,15}$/.test(numero)
  const codigoOk = /^[A-Z0-9]{4}$/.test(codigo)
  // Si no llega, es el año actual de Lima — la guía se registra al despachar.
  const year = courier === 'OLVA' ? normalizeYear(t.year, now) : null
  const valid = courier === 'SHALOM'
    ? (numeroOk && codigoOk) || !!oseId
    : numeroOk && !!year
  if (!valid) return { ok: false, error: 'invalid_tracking' }

  return {
    ok: true,
    courier,
    tracking: {
      tracking_courier: courier,
      tracking_numero: numeroOk ? numero : null,
      tracking_codigo: courier === 'SHALOM' && codigoOk ? codigo : null,
      tracking_ose_id: courier === 'SHALOM' && oseId ? oseId : null,
      tracking_year: year,
      // Guía nueva = tracking desde cero: el sync recalcula la fase.
      tracking_phase: null, tracking_phase_at: null,
      tracking_demora_at: null, tracking_checked_at: null,
    },
    ids: courier === 'OLVA' ? `Guía ${numero}`
      : numeroOk ? `Guía ${numero} · Código ${codigo}` : `Orden de servicio ${oseId}`,
  }
}

/**
 * Escribe la guía en el pedido, se la manda al comprador y suscribe el envío al
 * webhook del proveedor. Devuelve el error de base si no se pudo escribir —el
 * resto (mensaje, broadcast, suscripción) es best-effort y nunca tumba el
 * registro: una guía escrita sin aviso se arregla; un aviso sin guía, no.
 */
export async function registrarGuia(
  session: GuiaSession,
  g: Extract<GuiaNormalizada, { ok: true }>,
  /** `yaSuscrito`: la guía nació suscrita al webhook (el generador manda
   *  `track: true` en la misma llamada que la emite). Suscribirla otra vez
   *  gastaría una request del cupo para no cambiar nada. */
  opts: { yaSuscrito?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('order_sessions').update(g.tracking).eq('id', session.id)
  if (error) return { ok: false, error: error.message }

  // El saldo DERIVADO, no asumido (misma regla que el acuse de pay360-webhook):
  // a quien pagó el total no se le habla de un saldo que no existe — su clave
  // de recojo va sin condición.
  const pagado = session.payment_verification === 'MATCHED' ? Number(session.advance_amount ?? 0) : 0
  const saldo = Math.max(0, Number(session.product_price ?? 0) - pagado)
  const cobroCopy = saldo > 0
    ? `Tu saldo de S/${saldo} lo pagas cuando quieras por esta misma app —nunca en la agencia— y apenas lo pagues te entregamos tu clave de recojo.`
    : 'Como ya pagaste el total, junto con la guía te entregaremos tu clave de recojo.'

  await chatMessage(
    session.id,
    `📦 ¡Tu envío ya está registrado en ${g.courier}! ${g.ids}. `
      + `${g.courier === 'OLVA' ? 'Guárdala' : 'Guárdalos'} para el recojo. `
      + cobroCopy + ' Por aquí te avisamos cuando tu pedido llegue a tu agencia.',
    'all',
  )
  await broadcast(session.id, 'tracking_update', g.tracking)
  if (!opts.yaSuscrito) await suscribirWebhook(g)
  return { ok: true }
}

/**
 * Suscribe el envío al webhook del proveedor para recibir cada transición al
 * instante. Best-effort: si falla —webhook sin configurar, cupo lleno, red— el
 * barrido de pg_cron cubre igual. La suscripción exige numero+codigo; con solo
 * ose_id no hay qué suscribir. Solo Shalom: Olva API Perú no tiene webhook.
 */
async function suscribirWebhook(g: Extract<GuiaNormalizada, { ok: true }>): Promise<void> {
  const { tracking_numero: numero, tracking_codigo: codigo } = g.tracking
  if (g.courier !== 'SHALOM' || !numero || !codigo) return
  try {
    const key = await shalomApiKey()
    if (!key) return
    const r = await fetch('https://api.shalom-api-peru.com/v1/tracking/subscriptions', {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, codigo }),
    })
    if (!r.ok) console.error('registrarGuia: suscripción webhook falló', r.status, await r.text().catch(() => ''))
  } catch (e) {
    console.error('registrarGuia: suscripción webhook falló', e)
  }
}
