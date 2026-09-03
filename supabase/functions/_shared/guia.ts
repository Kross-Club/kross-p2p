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
import { shalomApiKey, shalomLatApiKey } from './shalom.ts'
import { SHALOM_LAT_BASE, trackBody } from './shalom-lat.ts'
import { normalizeYear } from './olva.ts'
import { idsDeGuia, mensajeDeClave, mensajeDeGuia } from './mensaje-de-guia.ts'
import type { Courier } from './mensaje-de-guia.ts'
export type { Courier } from './mensaje-de-guia.ts'

/** Lo que el pedido necesita aportar para registrar una guía. */
export interface GuiaSession {
  id: string
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  /** Si el saldo YA cruzó cuando la guía se registra —pasa cuando el proveedor
   *  rechazó la emisión y el pago llegó antes que la guía manual—, la clave de
   *  recojo sale junto con ella: la promesa era contra el pago, y ya pagó. */
  saldo_verification?: string | null
  /** La clave de retiro, si este pedido la tiene: la guía automática de Shalom
   *  la elige, y la manual la copia del comprobante físico (`set_tracking`
   *  con `clave`). Sin ella no hay entrega automática — la manda una persona. */
  shalom_pickup_code?: string | null
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
    // Los nombres, con el vocabulario del courier (`idsDeGuia`): en Shalom el
    // número es el "Nro. de orden" de su propio voucher.
    ids: idsDeGuia(courier, {
      numero: numeroOk ? numero : null,
      codigo: courier === 'SHALOM' && codigoOk ? codigo : null,
      oseId,
    }),
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
  opts: { yaSuscrito?: boolean; pdfUrl?: string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('order_sessions').update(g.tracking).eq('id', session.id)
  if (error) return { ok: false, error: error.message }

  // El saldo DERIVADO, no asumido (misma regla que el acuse de pay360-webhook):
  // a quien pagó el total no se le habla de un saldo que no existe — su clave
  // de recojo va sin condición. Y un saldo YA cruzado cuenta como pagado: si el
  // pago llegó antes que la guía, la deuda no existe.
  const pagado = session.payment_verification === 'MATCHED' ? Number(session.advance_amount ?? 0) : 0
  const saldo = session.saldo_verification === 'MATCHED'
    ? 0
    : Math.max(0, Number(session.product_price ?? 0) - pagado)

  await chatMessage(
    session.id,
    mensajeDeGuia(g.courier, g.ids, saldo),
    'all',
    // `guia` con su PDF: es lo que el chat pinta como tarjeta con el botón
    // "Ver mi guía de Shalom". Sin PDF —la guía registrada a mano no lo trae—
    // el mensaje sale igual, sin botón.
    { type: 'guia', media_url: opts.pdfUrl ?? null },
  )
  // La CLAVE, solo si ya no queda nada por pagar: el mensaje de arriba acaba de
  // prometer "junto con la guía te entregaremos tu clave de recojo", y esta es
  // la entrega. Con saldo pendiente NO sale — la suelta el webhook cuando el
  // saldo cruce. Y solo si el pedido la tiene: la eligió la emisión automática,
  // o la copió Logística del comprobante físico al registrar a mano.
  if (saldo === 0 && session.shalom_pickup_code) {
    await chatMessage(session.id, mensajeDeClave(session.shalom_pickup_code), 'all')
  }
  await broadcast(session.id, 'tracking_update', g.tracking)
  if (!opts.yaSuscrito) await suscribirWebhook(g)
  return { ok: true }
}

/**
 * Suscribe el envío al webhook del proveedor para recibir cada transición al
 * instante. Best-effort: si falla —webhook sin configurar, cupo lleno, red— el
 * barrido de pg_cron cubre igual. La suscripción exige numero+codigo; con solo
 * ose_id no hay qué suscribir. Solo Shalom: Olva API Perú no tiene webhook.
 *
 * Se intenta con el titular (Shalom PE) y, si no se pudo, con la contingencia
 * (Shalom LAT): los dos empujan a la misma función `shalom-webhook` y los dos
 * rastrean la misma guía. Suscribirla en el que esté vivo es lo que hace que un
 * proveedor caído cueste 30 minutos de espera y no el aviso entero.
 */
async function suscribirWebhook(g: Extract<GuiaNormalizada, { ok: true }>): Promise<void> {
  const { tracking_numero: numero, tracking_codigo: codigo } = g.tracking
  if (g.courier !== 'SHALOM' || !numero || !codigo) return

  const intento = async (
    quien: string, url: string, headers: Record<string, string>, body: unknown,
  ): Promise<boolean> => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) return true
      console.error(`registrarGuia: suscripción webhook ${quien} falló`, r.status, await r.text().catch(() => ''))
    } catch (e) {
      console.error(`registrarGuia: suscripción webhook ${quien} falló`, e)
    }
    return false
  }

  const key = await shalomApiKey()
  if (key && await intento('PE',
    'https://api.shalom-api-peru.com/v1/tracking/subscriptions',
    { 'X-API-Key': key }, { numero, codigo })) return

  const keyLat = await shalomLatApiKey()
  if (!keyLat) return
  await intento('LAT',
    `${SHALOM_LAT_BASE}/tracking/subscriptions`,
    { 'x-api-key': keyLat }, trackBody({ numero, codigo }))
}
