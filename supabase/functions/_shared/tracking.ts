import { createClient } from 'npm:@supabase/supabase-js@2'
import { mensajeDeOrigen } from './mensaje-de-guia.ts'
import { soles, textoDeCobro } from './cobro-por-chat.ts'
import { esRielEnLinea } from './comision.ts'
import { enviarSms, tiendaParaSms } from './sms.ts'
import { enlaceDelPedido, smsLlegoAgencia } from './sms-texto.ts'
import { mandarPlantillaDeRecojo } from './wa-recojo.ts'

// ─── Reflejo de tracking en el pedido — lógica COMPARTIDA entre couriers ─────
// La usan todas las entradas que deben comportarse idéntico:
//   · `shalom-tracking-sync` — el barrido de pg_cron (respaldo del webhook)
//   · `shalom-webhook`       — el push del proveedor en cada cambio de estado
//   · `olva-tracking-sync`   — el barrido de Olva (no hay webhook: es LA entrada)
//   · `olva-tracking`        — el refresh manual desde el chat (con session_id)
// Si una transición se reflejara distinto según por dónde llegó, el mismo
// pedido hablaría dos idiomas. Por eso vive aquí y no duplicada. Lo específico
// de cada courier (su API, su mapeo de hitos/textos a fase) vive en su propio
// módulo: `shalom.ts` y `olva.ts`.

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

export type Phase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'
export const PHASE_RANK: Record<Phase, number> = { EN_ORIGEN: 1, EN_TRANSITO: 2, EN_DESTINO: 3, ENTREGADO: 4 }

export const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export async function broadcast(sessionId: string, event: string, payload: unknown) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ messages: [{ topic: `order:${sessionId}`, event, payload }] }),
    })
  } catch { /* ignore */ }
}

/**
 * Escribe un mensaje del sistema en el hilo del pedido.
 *
 * Devuelve si se ESCRIBIÓ. Antes se tragaba el error del insert —`const { data:
 * msg }`, sin mirar `error`— y un mensaje que no entró se veía exactamente
 * igual que uno que nadie leyó: nada en el chat y nada en los logs. Es la misma
 * clase de fallo silencioso que dejó el tablero en cero (07-set-2026), y acá
 * cuesta más caro: el aviso de la guía es lo que el comprador necesita para
 * recoger. Ahora el fallo queda en los logs con su motivo y quien llama puede
 * decirlo en pantalla en vez de dar por hecho que llegó.
 */
export async function chatMessage(
  sessionId: string, body: string, visibility: 'all' | 'sellers',
  /** `type` para los mensajes que se pintan distinto (la guía, con su botón);
   *  `media_url` para el adjunto que ese botón abre (el PDF de Shalom). */
  extra: { type?: string; media_url?: string | null } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { data: msg, error } = await supabase.from('chat_messages').insert({
    session_id: sessionId, sender_role: 'system', sender_name: 'Kross',
    type: extra.type ?? 'status_update', visibility, body,
    media_url: extra.media_url ?? null,
  }).select().single()
  if (error) {
    console.error('chatMessage: no se pudo escribir', sessionId, extra.type ?? 'status_update', error.message)
    return { ok: false, error: error.message }
  }
  if (msg) await broadcast(sessionId, 'new_message', msg)
  return { ok: true }
}

export interface TrackedRow {
  id: string
  store_id: string | null
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  /** El saldo ya cruzado cuenta como pagado: sin esto, un pedido con el saldo
   *  pago recibía en EN_DESTINO un "paga tu saldo de S/X" por una deuda que no
   *  existe — y en EN_ORIGEN, una tarjeta de cobro por lo mismo. */
  saldo_verification: string | null
  /** Con qué cobra la tienda: la tarjeta de pago solo existe donde `360PAY`
   *  puede cobrarla (misma condición que `seCobraPorChat` en el panel). */
  payment_provider: string | null
  agency_name: string | null
  tracking_numero: string | null
  tracking_codigo: string | null
  tracking_ose_id: string | null
  tracking_year: string | null
  tracking_phase: string | null
  tracking_demora_at: string | null
  tracking_checked_at: string | null
  /** Para el SMS de llegada: a quién y por dónde vuelve. Opcionales porque
   *  los tests arman filas sin ellos. */
  token?: string | null
  buyer_phone?: string | null
}

/** Columnas que toda entrada lee del pedido para poder reflejar. */
export const TRACKED_COLUMNS =
  'id, store_id, product_price, advance_amount, payment_verification, saldo_verification, payment_provider, agency_name, ' +
  'tracking_numero, tracking_codigo, tracking_ose_id, tracking_year, tracking_phase, tracking_demora_at, tracking_checked_at, ' +
  'token, buyer_phone'

export type ConSaldo = Pick<TrackedRow,
  'product_price' | 'advance_amount' | 'payment_verification' | 'saldo_verification'>

export function saldoOf(row: ConSaldo): number {
  // Un saldo YA cruzado es deuda que no existe (misma regla que `registrarGuia`).
  if (row.saldo_verification === 'MATCHED') return 0
  const pagado = row.payment_verification === 'MATCHED' ? Number(row.advance_amount ?? 0) : 0
  return Math.max(0, Number(row.product_price ?? 0) - pagado)
}

/** ¿La tarjeta del saldo ya está en el hilo? El vendedor pudo mandarla a mano
 *  antes de que el courier reporte — repetírsela cobra dos veces a la vista. */
async function yaSeCobroElSaldoPorChat(sessionId: string): Promise<boolean> {
  const { count } = await supabase.from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId).eq('type', 'cobro').is('cobro_id', null)
  return (count ?? 0) > 0
}

// La acción de seguimiento de cada transición. Solo se llama hacia ADELANTE.
async function onTransition(row: TrackedRow, phase: Phase) {
  const agencia = row.agency_name ?? 'la agencia'

  if (phase === 'EN_ORIGEN') {
    // El aviso que la tarjeta de la guía promete ("por acá te avisamos apenas
    // pase"): en Shalom la pre-guía se vuelve oficial exactamente aquí.
    const courier = String(row.agency_name ?? '').toUpperCase() === 'OLVA' ? 'OLVA' as const : 'SHALOM' as const
    await chatMessage(row.id, mensajeDeOrigen(courier), 'all')

    // Y LA COBRANZA EMPIEZA AQUÍ, no en destino: el envío ya es un hecho y el
    // saldo se paga por la app mientras el paquete viaja — cobrar recién cuando
    // llegó deja al comprador pagando con el paquete en el mostrador. La
    // tarjeta es LA MISMA que manda el vendedor a mano (`type: 'cobro'`, copy
    // de `_shared/cobro-por-chat.ts`): el comprador la paga de verdad, con su
    // cupón emitido al tocar el botón. Solo si hay deuda de verdad (adelanto
    // cruzado, saldo sin cruzar), la tienda cobra en línea, y nadie la mandó ya.
    const saldo = saldoOf(row)
    if (saldo > 0 && row.payment_verification === 'MATCHED' && esRielEnLinea(row.payment_provider)
      && !(await yaSeCobroElSaldoPorChat(row.id))) {
      await chatMessage(row.id, textoDeCobro(soles(saldo)), 'all', { type: 'cobro' })
    }
    return
  }

  if (phase === 'EN_TRANSITO') {
    await chatMessage(row.id, `🚚 ¡Tu pedido va en camino a tu agencia ${agencia}! Por aquí te avisamos apenas llegue.`, 'all')
    return
  }

  if (phase === 'EN_DESTINO') {
    // LA COBRANZA (02 §3): el tracking decide cuándo, la conversación cobra.
    // Saldo DERIVADO, no asumido — a quien pagó el total no se le habla de un
    // saldo que no existe. Y NUNCA "lo pagas al recoger": el saldo se paga por
    // la app; la clave de recojo se entrega contra el saldo pagado.
    const saldo = saldoOf(row)
    const cobro = saldo > 0
      ? `Paga tu saldo de S/${saldo} con Yape desde este mismo enlace de tu pedido —nunca en la agencia— y te entregamos tu clave de recojo para retirarlo con tu DNI.`
      : 'Como ya pagaste el total, tu clave de recojo va por este chat: retíralo con tu DNI cuando quieras.'
    await chatMessage(row.id, `📍 ¡Tu pedido ya llegó a tu agencia ${agencia}! ${cobro}`, 'all')
    // Y el SMS, siempre: es el paso 1 de la cascada de recojo (doc 08) y el
    // aviso que más recojos salva. Quien no tiene push ni volverá al chat se
    // entera por aquí. Best-effort: un SMS que falla queda en api_events y no
    // frena el reflejo.
    try {
      const tienda = await tiendaParaSms(row.store_id)
      const r = await enviarSms({ storeId: row.store_id, sessionId: row.id }, row.buyer_phone, smsLlegoAgencia({
        tienda: tienda.nombre, agencia, saldo, link: enlaceDelPedido(tienda.slug, row.token),
      }))
      await supabase.from('notifications_log').insert({
        store_id: row.store_id, session_id: row.id, kind: 'status', push_count: 0,
        whatsapp: 'not_needed', sms: r.result, detail: r.error ?? `llegada a ${agencia}`,
      })
    } catch (e) {
      console.error('tracking reflect: fallo el SMS de llegada', row.id, e)
    }
    // El vendedor entra a cobrar: su aviso es la "cola de llamadas" v1.
    await chatMessage(
      row.id,
      saldo > 0
        ? `📞 Pedido EN DESTINO (${agencia}). Cobrar el saldo de S/${saldo} por la app y coordinar el recojo — llamar al comprador si no responde.`
        // La clave ya no se "envía" a mano: el chat la entrega solo contra el
        // pago (o con la guía, si pagó el total). Confirmar es lo que queda.
        : `📞 Pedido EN DESTINO (${agencia}) con todo pagado. Confirmar que tiene su clave de recojo y coordinar el retiro.`,
      'sellers'
    )
    // Paso 1 de la cascada de recojo, por WhatsApp: el riel de los
    // recordatorios desde el 06-set-2026 (ver `_shared/wa-recojo.ts` — el SMS
    // costaba más de lo que el pedido deja). Si la marca no aprobó su plantilla
    // no manda nada, y el chat y el push salen igual.
    await mandarPlantillaDeRecojo(row.id, row.store_id, 'listo')
    return
  }

  if (phase === 'ENTREGADO') {
    await chatMessage(row.id, '🎉 ¡Tu pedido fue entregado! Gracias por tu compra — cualquier cosa, por aquí seguimos.', 'all')
    // El pipeline NO se mueve solo: la persona confirma (regla del contrato).
    await chatMessage(row.id, `✅ ${row.agency_name ?? 'El courier'} marca el envío como ENTREGADO. Confirmar la entrega en el pipeline para que cuente en la tasa.`, 'sellers')
  }
}

/**
 * Refleja UNA lectura del courier en el pedido: fase (solo hacia adelante — un
 * hito que "desaparece" o un evento repetido no retroceden ni re-avisan, lo que
 * además vuelve idempotentes los reintentos at-least-once del webhook), alerta
 * de demora (una vez), backfill de ose_id y auditoría del chequeo.
 */
export async function applyTracking(
  row: TrackedRow,
  reading: { phase: Phase | null; demoraIso: string | null; oseId?: string | null }
): Promise<{ transitioned: boolean }> {
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { tracking_checked_at: now }

  if (!row.tracking_ose_id && reading.oseId) update.tracking_ose_id = String(reading.oseId)

  if (reading.demoraIso && !row.tracking_demora_at) {
    update.tracking_demora_at = reading.demoraIso
    await chatMessage(row.id, `⚠️ ${row.agency_name ?? 'El courier'} marca DEMORA en el envío. Revisar y avisarle al comprador si aplica.`, 'sellers')
  }

  const prevRank = PHASE_RANK[row.tracking_phase as Phase] ?? 0
  const nextRank = reading.phase ? PHASE_RANK[reading.phase] : 0
  const transitioned = !!reading.phase && nextRank > prevRank
  if (transitioned && reading.phase) {
    update.tracking_phase = reading.phase
    update.tracking_phase_at = now
    await onTransition(row, reading.phase)
  }

  const { error } = await supabase.from('order_sessions').update(update).eq('id', row.id)
  if (error) console.error('tracking reflect: update', row.id, error.message)
  else if (update.tracking_phase || update.tracking_demora_at) {
    await broadcast(row.id, 'tracking_update', update)
  }
  return { transitioned }
}
