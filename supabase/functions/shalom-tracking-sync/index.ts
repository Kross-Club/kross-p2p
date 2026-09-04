import {
  applyTracking, chatMessage, ensureLatWebhook, ensureWebhook,
  shalomApiKey, shalomLatApiKey, supabase, TRACKED_COLUMNS, type TrackedRow,
} from '../_shared/shalom.ts'
import { rastrearLote } from '../_shared/shalom-rastreo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Barrido de tracking Shalom (02-SMART-LOGISTICS §3) — el RESPALDO del webhook.
// Lo invoca pg_cron cada 30 min (sección 23.d de setup-kross.sql); no recibe
// parámetros, no expone datos (solo conteos) y es idempotente, así que
// invocarlo de más solo refresca. El reflejo vive en `_shared/tracking.ts`,
// compartido con `shalom-webhook`: el push del proveedor llega al instante y
// este barrido cubre lo que el webhook no entregó (cupo lleno, caída, evento
// perdido, suscripción expirada a los ~21 días).
//
// A quién se le pregunta lo decide `_shared/shalom-rastreo.ts`: titular Shalom
// PE en lote (`POST /v1/tracking/batch`, 50 por request, errores por ítem con
// custom_id) y, si se cae a mitad de la corrida, contingencia Shalom LAT
// (`POST /track/batch`) con lo que quedó pendiente. Una corrida puede terminar
// con lecturas de los dos y el pedido no nota la diferencia.
const MAX_ENVIOS = 500 // 10 lotes de 50; los 60 req/min de cada proveedor ni se acercan

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const [keyPE, keyLAT] = await Promise.all([shalomApiKey(), shalomLatApiKey()])
  if (!keyPE && !keyLAT) {
    console.error('shalom-tracking-sync: sin llave de ningún proveedor (ni secret ni Vault)')
    return json({ ok: false, stage: 'config' }, 500)
  }

  // Bootstrap de los webhooks (una vez por arranque, best-effort): registra la
  // URL de `shalom-webhook` en cada proveedor que aún no la tenga, con el
  // secret directo a Vault. Los dos empujan a la misma función.
  if (keyPE) await ensureWebhook(keyPE)
  if (keyLAT) await ensureLatWebhook(keyLAT)

  // Los envíos vivos, los menos chequeados primero (índice 23.b).
  const { data: rows, error: qErr } = await supabase
    .from('order_sessions')
    .select(TRACKED_COLUMNS)
    .eq('status', 'active')
    .eq('tracking_courier', 'SHALOM')
    .or('tracking_phase.is.null,tracking_phase.neq.ENTREGADO')
    .order('tracking_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_ENVIOS)
  if (qErr) {
    console.error('shalom-tracking-sync: query', qErr.message)
    return json({ ok: false, stage: 'query' }, 500)
  }

  const activos = (rows ?? []) as TrackedRow[]
  const { lecturas, proveedores, corte } = await rastrearLote(activos)
  const porId = new Map(activos.map(r => [r.id, r]))
  const now = new Date().toISOString()

  let checked = 0, transitions = 0, failed = 0
  for (const lectura of lecturas) {
    const row = porId.get(lectura.id)
    if (!row) continue
    checked++

    if (!lectura.ok) {
      failed++
      // Guía mal registrada: se avisa UNA vez (solo en el primer chequeo); el
      // detalle crudo del proveedor va solo a los logs.
      if (lectura.notFound && !row.tracking_checked_at) {
        await chatMessage(row.id, `⚠️ ${row.agency_name ?? 'El courier'} no encuentra el envío registrado (¿guía o código mal digitados?). Revisar el comprobante y volver a registrar la guía.`, 'sellers')
      }
      await supabase.from('order_sessions').update({ tracking_checked_at: now }).eq('id', row.id)
      continue
    }

    const { transitioned } = await applyTracking(row, {
      phase: lectura.phase,
      demoraIso: lectura.demoraIso,
      oseId: lectura.oseId,
    })
    if (transitioned) transitions++
  }

  return json({
    ok: true,
    active: activos.length,
    checked,
    transitions,
    failed,
    // Con qué proveedor(es) se resolvió la corrida y por qué se cortó, si se
    // cortó: es lo que se mira cuando el titular está caído.
    proveedores,
    corte,
  })
})
