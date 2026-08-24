import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Job de tracking Shalom (02-SMART-LOGISTICS §3). Lo invoca pg_cron cada 30 min
// (sección 23.c de setup-kross.sql); no recibe parámetros, no expone datos
// (solo conteos) y es idempotente, así que invocarlo de más solo refresca.
//
// Barre los envíos VIVOS (guía registrada, sin ENTREGADO), los consulta en
// LOTE contra Shalom API Perú (POST /v1/tracking/batch, hasta 50 por request,
// errores por ítem) y refleja cada transición en el pedido:
//   · siempre: tracking_phase/phase_at/demora_at/checked_at
//   · EN_TRANSITO → aviso al comprador
//   · EN_DESTINO  → LA COBRANZA DEL SALDO: mensaje al comprador con el saldo
//     DERIVADO (por la app, nunca en el mostrador), aviso solo-vendedores para
//     la llamada, y plantilla WhatsApp si la tienda configuró
//     stores.wa_recojo_template (vía send-wa-template, ya construido)
//   · ENTREGADO   → cierre al comprador + recordatorio solo-vendedores de
//     confirmar la entrega en el pipeline
// La fase JAMÁS mueve `stage` sola: el pipeline lo avanza una persona.
const SHALOM_API_BASE = 'https://api.shalom-api-peru.com'
const BATCH_SIZE = 50
const MAX_BATCHES = 10 // 500 envíos por corrida; 60 req/min del proveedor ni se acercan

type Phase = 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO'
const PHASE_RANK: Record<Phase, number> = { EN_ORIGEN: 1, EN_TRANSITO: 2, EN_DESTINO: 3, ENTREGADO: 4 }

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

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function derivePhase(status: Record<string, unknown>): Phase | null {
  for (const [milestone, phase] of PHASE_BY_MILESTONE) {
    if (isObj(status[milestone])) return phase
  }
  return null
}

// Las fechas del proveedor vienen "YYYY-MM-DD HH:mm:ss" en hora de Lima (UTC-5).
function limaDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(`${v.replace(' ', 'T')}-05:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

let cachedKey: string | null = null
async function shalomApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('SHALOM_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const { data, error } = await supabase.rpc('shalom_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

async function broadcast(sessionId: string, event: string, payload: unknown) {
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

async function chatMessage(sessionId: string, body: string, visibility: 'all' | 'sellers') {
  const { data: msg } = await supabase.from('chat_messages').insert({
    session_id: sessionId, sender_role: 'system', sender_name: 'Kross',
    type: 'status_update', visibility, body,
  }).select().single()
  if (msg) await broadcast(sessionId, 'new_message', msg)
}

interface TrackedRow {
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

// Plantilla WA de recojo por tienda (stores.wa_recojo_template). Se resuelve
// una vez por corrida; NULL = esa marca no auto-envía WhatsApp.
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

// La acción de seguimiento de cada transición. Solo hacia ADELANTE: si el
// proveedor retrocede un hito, no se retrocede al comprador con mensajes.
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
        console.error('shalom-tracking-sync: fallo enviando WA de recojo', row.id, e)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const key = await shalomApiKey()
  if (!key) {
    console.error('shalom-tracking-sync: sin SHALOM_API_KEY (ni secret ni Vault)')
    return new Response(JSON.stringify({ ok: false, stage: 'config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Los envíos vivos, los menos chequeados primero (índice 23.b).
  const { data: rows, error: qErr } = await supabase
    .from('order_sessions')
    .select('id, store_id, product_price, advance_amount, payment_verification, agency_name, tracking_numero, tracking_codigo, tracking_ose_id, tracking_phase, tracking_demora_at, tracking_checked_at')
    .eq('status', 'active')
    .eq('tracking_courier', 'SHALOM')
    .or('tracking_phase.is.null,tracking_phase.neq.ENTREGADO')
    .order('tracking_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE * MAX_BATCHES)
  if (qErr) {
    console.error('shalom-tracking-sync: query', qErr.message)
    return new Response(JSON.stringify({ ok: false, stage: 'query' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Solo lo consultable: numero+codigo juntos, o ose_id (regla de la API real).
  const trackable = (rows ?? []).filter((r: TrackedRow) =>
    (r.tracking_numero && r.tracking_codigo) || r.tracking_ose_id)

  let checked = 0, transitions = 0, failed = 0
  const now = new Date().toISOString()

  for (let i = 0; i < trackable.length; i += BATCH_SIZE) {
    const chunk: TrackedRow[] = trackable.slice(i, i + BATCH_SIZE)
    const items = chunk.map(r => r.tracking_ose_id
      ? { custom_id: r.id, ose_id: r.tracking_ose_id }
      : { custom_id: r.id, numero: r.tracking_numero, codigo: r.tracking_codigo })

    let payload: { results?: unknown[] } | null
    try {
      const r = await fetch(`${SHALOM_API_BASE}/v1/tracking/batch`, {
        method: 'POST',
        headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (r.status === 429) {
        console.error('shalom-tracking-sync: rate limit del proveedor; corta la corrida')
        break
      }
      if (!r.ok) {
        console.error('shalom-tracking-sync: upstream', r.status, await r.text().catch(() => ''))
        break
      }
      payload = await r.json().catch(() => null)
    } catch (e) {
      console.error('shalom-tracking-sync: red caída hacia el proveedor', e)
      break
    }
    if (!payload || !Array.isArray(payload.results)) {
      console.error('shalom-tracking-sync: respuesta sin results')
      break
    }

    const byId = new Map(chunk.map(r => [r.id, r]))
    for (const raw of payload.results) {
      if (!isObj(raw)) continue
      const row = byId.get(String(raw.custom_id ?? ''))
      if (!row) continue
      checked++

      if (raw.ok !== true) {
        failed++
        const code = isObj(raw.error) ? String(raw.error.code ?? '') : ''
        // Guía mal registrada: se avisa UNA vez (solo en el primer chequeo);
        // el detalle crudo del proveedor va solo a los logs.
        if (code === 'not_found' && !row.tracking_checked_at) {
          await chatMessage(row.id, `⚠️ ${row.agency_name ?? 'El courier'} no encuentra el envío registrado (¿guía o código mal digitados?). Revisar el comprobante y volver a registrar la guía.`, 'sellers')
        }
        console.error('shalom-tracking-sync: item falló', row.id, code)
        await supabase.from('order_sessions').update({ tracking_checked_at: now }).eq('id', row.id)
        continue
      }

      const tracking = isObj(raw.tracking) ? raw.tracking : {}
      const status = isObj(tracking.status) ? tracking.status : {}
      const order = isObj(tracking.order) ? tracking.order : null
      const phase = derivePhase(status)
      const demora = isObj(status.demora) ? limaDate(status.demora.fecha) ?? now : null

      const update: Record<string, unknown> = { tracking_checked_at: now }
      // ose_id de vuelta (modo detallado) → guardarlo abarata el próximo chequeo.
      if (!row.tracking_ose_id && order && order.ose_id != null) {
        update.tracking_ose_id = String(order.ose_id)
      }
      if (demora && !row.tracking_demora_at) {
        update.tracking_demora_at = demora
        await chatMessage(row.id, `⚠️ ${row.agency_name ?? 'El courier'} marca DEMORA en el envío. Revisar y avisarle al comprador si aplica.`, 'sellers')
      }

      const prevRank = PHASE_RANK[row.tracking_phase as Phase] ?? 0
      const nextRank = phase ? PHASE_RANK[phase] : 0
      // Solo hacia adelante: un hito que "desaparece" en el proveedor no
      // retrocede el pedido ni le habla al comprador.
      if (phase && nextRank > prevRank) {
        update.tracking_phase = phase
        update.tracking_phase_at = now
        transitions++
        await onTransition(row, phase)
      }

      const { error: upErr } = await supabase.from('order_sessions').update(update).eq('id', row.id)
      if (upErr) console.error('shalom-tracking-sync: update', row.id, upErr.message)
      else if (update.tracking_phase || update.tracking_demora_at) {
        await broadcast(row.id, 'tracking_update', update)
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, active: trackable.length, checked, transitions, failed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
