import { createClient } from 'npm:@supabase/supabase-js@2'

// ─── Reflejo de tracking Shalom en el pedido — lógica COMPARTIDA ─────────────
// La usan dos entradas que deben comportarse idéntico:
//   · `shalom-tracking-sync` — el barrido de pg_cron cada 30 min (respaldo)
//   · `shalom-webhook`       — el push del proveedor en cada cambio de estado
// Si una transición se reflejara distinto según por dónde llegó, el mismo
// pedido hablaría dos idiomas. Por eso vive aquí y no duplicada.

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

export type Phase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'
export const PHASE_RANK: Record<Phase, number> = { EN_ORIGEN: 1, EN_TRANSITO: 2, EN_DESTINO: 3, ENTREGADO: 4 }

// Hito → fase, del más avanzado al menos (mismo mapeo determinista que
// ShalomTrackingService). `demora` no está: es una alerta, no una fase.
const PHASE_BY_MILESTONE: [string, Phase][] = [
  ['entregado', 'ENTREGADO'],
  ['reparto', 'EN_DESTINO'],
  ['destino', 'EN_DESTINO'],
  ['transito', 'EN_TRANSITO'],
  ['origen', 'EN_ORIGEN'],
  ['registrado', 'EN_ORIGEN'],
]

export const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function derivePhase(status: Record<string, unknown>): Phase | null {
  for (const [milestone, phase] of PHASE_BY_MILESTONE) {
    if (isObj(status[milestone])) return phase
  }
  return null
}

// Las fechas del proveedor vienen "YYYY-MM-DD HH:mm:ss" en hora de Lima (UTC-5).
export function limaDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(`${v.trim().replace(' ', 'T')}-05:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

let cachedKey: string | null = null
export async function shalomApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('SHALOM_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const { data, error } = await supabase.rpc('shalom_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

let cachedWebhookSecret: string | null = null
export async function webhookSecret(): Promise<string | null> {
  if (cachedWebhookSecret) return cachedWebhookSecret
  const fromEnv = Deno.env.get('SHALOM_WEBHOOK_SECRET')
  if (fromEnv) return (cachedWebhookSecret = fromEnv)
  const { data, error } = await supabase.rpc('shalom_webhook_secret')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedWebhookSecret = data)
}

// Bootstrap del webhook, autónomo y sin que el secret pase por ningún chat:
// si no hay secret local y el proveedor no tiene webhook configurado, registra
// la URL de `shalom-webhook` (el ping de verificación lo responde esa función
// sola) y guarda el signing_secret DIRECTO en Vault vía el RPC
// store_shalom_webhook_secret (sección 24). Best-effort: si falla, el barrido
// sigue cubriendo el tracking y se reintenta en el próximo arranque.
let ensureWebhookTried = false
export async function ensureWebhook(apiKey: string): Promise<void> {
  if (ensureWebhookTried) return
  ensureWebhookTried = true
  try {
    if (await webhookSecret()) return
    const cfg = await fetch('https://api.shalom-api-peru.com/v1/webhooks', {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    }).then(r => (r.ok ? r.json() : null)).catch(() => null) as { configured?: unknown } | null
    if (!cfg) return
    if (cfg.configured === true) {
      // Hay webhook en el proveedor pero no tenemos su secret: NO se pisa.
      console.error('shalom webhook: configurado en el proveedor sin secret local — rotar con POST /v1/webhooks/rotate y guardar el nuevo en Vault')
      return
    }
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shalom-webhook`
    const r = await fetch('https://api.shalom-api-peru.com/v1/webhooks', {
      method: 'PUT',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const body = await r.json().catch(() => null) as { signing_secret?: unknown; verified?: unknown } | null
    if (!r.ok || !body || typeof body.signing_secret !== 'string' || !body.signing_secret) {
      console.error('shalom webhook: registro falló', r.status)
      return
    }
    const { error } = await supabase.rpc('store_shalom_webhook_secret', { secret: body.signing_secret })
    if (error) console.error('shalom webhook: no se pudo guardar el secret en Vault', error.message)
    else console.log('shalom webhook: registrado y secret guardado en Vault; verified =', body.verified === true)
  } catch (e) {
    console.error('shalom webhook: bootstrap falló', e)
  }
}

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

export async function chatMessage(sessionId: string, body: string, visibility: 'all' | 'sellers') {
  const { data: msg } = await supabase.from('chat_messages').insert({
    session_id: sessionId, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility, body,
  }).select().single()
  if (msg) await broadcast(sessionId, 'new_message', msg)
}

export interface TrackedRow {
  id: string
  store_id: string | null
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  agency_name: string | null
  tracking_numero: string | null
  tracking_codigo: string | null
  tracking_ose_id: string | null
  tracking_phase: string | null
  tracking_demora_at: string | null
  tracking_checked_at: string | null
}

/** Columnas que ambas entradas leen del pedido para poder reflejar. */
export const TRACKED_COLUMNS =
  'id, store_id, product_price, advance_amount, payment_verification, agency_name, ' +
  'tracking_numero, tracking_codigo, tracking_ose_id, tracking_phase, tracking_demora_at, tracking_checked_at'

// Plantilla WA de recojo por tienda (stores.wa_recojo_template). Se resuelve
// una vez por invocación; NULL = esa marca no auto-envía WhatsApp.
const waTemplateCache = new Map<string, string | null>()
async function waRecojoTemplate(storeId: string | null): Promise<string | null> {
  if (!storeId) return null
  if (waTemplateCache.has(storeId)) return waTemplateCache.get(storeId)!
  const { data } = await supabase.from('stores')
    .select('wa_enabled, wa_recojo_template').eq('id', storeId).maybeSingle()
  const tpl = data?.wa_enabled && typeof data?.wa_recojo_template === 'string' && data.wa_recojo_template
    ? data.wa_recojo_template : null
  waTemplateCache.set(storeId, tpl)
  return tpl
}

function saldoOf(row: TrackedRow): number {
  const pagado = row.payment_verification === 'MATCHED' ? Number(row.advance_amount ?? 0) : 0
  return Math.max(0, Number(row.product_price ?? 0) - pagado)
}

// La acción de seguimiento de cada transición. Solo se llama hacia ADELANTE.
async function onTransition(row: TrackedRow, phase: Phase) {
  const agencia = row.agency_name ?? 'la agencia'

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
      ? `Paga tu saldo de S/${saldo} por esta misma app —nunca en la agencia— y te entregamos tu clave de recojo para retirarlo con tu DNI.`
      : 'Como ya pagaste el total, tu clave de recojo va por este chat: retíralo con tu DNI cuando quieras.'
    await chatMessage(row.id, `📍 ¡Tu pedido ya llegó a tu agencia ${agencia}! ${cobro}`, 'all')
    // El vendedor entra a cobrar: su aviso es la "cola de llamadas" v1.
    await chatMessage(
      row.id,
      saldo > 0
        ? `📞 Pedido EN DESTINO (${agencia}). Cobrar el saldo de S/${saldo} por la app y coordinar el recojo — llamar al comprador si no responde.`
        : `📞 Pedido EN DESTINO (${agencia}) con el total ya pagado. Enviar la clave de recojo y coordinar el retiro.`,
      'sellers'
    )
    // WhatsApp de recojo/cobro si la marca lo configuró. Reusa send-wa-template
    // (mismo proyecto): el log en notifications_log y la nota al chat van gratis.
    const tpl = await waRecojoTemplate(row.store_id)
    if (tpl) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-wa-template`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ session_id: row.id, template: tpl, mapping: ['name', 'product', 'link'] }),
        })
      } catch (e) {
        console.error('shalom reflect: fallo enviando WA de recojo', row.id, e)
      }
    }
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
  if (error) console.error('shalom reflect: update', row.id, error.message)
  else if (update.tracking_phase || update.tracking_demora_at) {
    await broadcast(row.id, 'tracking_update', update)
  }
  return { transitioned }
}
