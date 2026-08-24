import {
  applyTracking, chatMessage, derivePhase, ensureWebhook, isObj, limaDate,
  shalomApiKey, supabase, TRACKED_COLUMNS, type TrackedRow,
} from '../_shared/shalom.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Barrido de tracking Shalom (02-SMART-LOGISTICS §3) — el RESPALDO del webhook.
// Lo invoca pg_cron cada 30 min (sección 23.d de setup-kross.sql); no recibe
// parámetros, no expone datos (solo conteos) y es idempotente, así que
// invocarlo de más solo refresca. El reflejo vive en `_shared/shalom.ts`,
// compartido con `shalom-webhook`: el push del proveedor llega al instante y
// este barrido cubre lo que el webhook no entregó (cupo lleno, caída, evento
// perdido, suscripción expirada a los ~21 días).
//
// Consulta los envíos VIVOS (guía registrada, sin ENTREGADO) en LOTE contra
// Shalom API Perú (POST /v1/tracking/batch, hasta 50 por request, errores por
// ítem con custom_id = id de la sesión).
const SHALOM_API_BASE = 'https://api.shalom-api-peru.com'
const BATCH_SIZE = 50
const MAX_BATCHES = 10 // 500 envíos por corrida; 60 req/min del proveedor ni se acercan

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const key = await shalomApiKey()
  if (!key) {
    console.error('shalom-tracking-sync: sin SHALOM_API_KEY (ni secret ni Vault)')
    return new Response(JSON.stringify({ ok: false, stage: 'config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Bootstrap del webhook (una vez por arranque, best-effort): registra la URL
  // de shalom-webhook en el proveedor si aún no hay, con el secret a Vault.
  await ensureWebhook(key)

  // Los envíos vivos, los menos chequeados primero (índice 23.b).
  const { data: rows, error: qErr } = await supabase
    .from('order_sessions')
    .select(TRACKED_COLUMNS)
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
      const demoraIso = isObj(status.demora) ? limaDate(status.demora.fecha) ?? now : null
      const { transitioned } = await applyTracking(row, {
        phase: derivePhase(status),
        demoraIso,
        // ose_id de vuelta (modo detallado) → abarata el próximo chequeo.
        oseId: order && order.ose_id != null ? String(order.ose_id) : null,
      })
      if (transitioned) transitions++
    }
  }

  return new Response(
    JSON.stringify({ ok: true, active: trackable.length, checked, transitions, failed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
