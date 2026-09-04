import { applyTracking, isObj, supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import type { TrackedRow } from '../_shared/tracking.ts'
import { derivePhase, normalizeYear } from '../_shared/olva.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from '../_shared/api-eventos.ts'
import { olvaApiKey } from '../_shared/olva-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Barrido de tracking Olva (02-SMART-LOGISTICS §3). A diferencia de Shalom,
// aquí el barrido ES la única entrada: Olva API Perú no tiene webhook ni
// endpoint batch, así que se consulta guía por guía (GET /v1/tracking). Lo
// invoca pg_cron cada 30 min a los :15/:45 (sección 23.d de setup-kross.sql),
// intercalado con el de Shalom; no recibe parámetros, no expone datos (solo
// conteos) y es idempotente. El reflejo vive en `_shared/tracking.ts`,
// compartido con el refresh manual de `olva-tracking`.
//
// El límite del proveedor es 60 req/min por key: se barren hasta 50 envíos por
// corrida (los menos chequeados primero), que a 2 corridas/hora cubre de sobra
// el volumen actual sin rozar el límite. Si algún día quedan cortos, subir la
// frecuencia del cron antes que el tamaño del lote.
const OLVA_API_BASE = 'https://api.olva-api-peru.com'
const MAX_PER_RUN = 50


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const key = await olvaApiKey()
  if (!key) {
    console.error('olva-tracking-sync: sin OLVA_API_KEY (ni secret ni Vault)')
    return new Response(JSON.stringify({ ok: false, stage: 'config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Los envíos vivos, los menos chequeados primero (índice 23.b).
  const { data: rows, error: qErr } = await supabase
    .from('order_sessions')
    .select(TRACKED_COLUMNS)
    .eq('status', 'active')
    .eq('tracking_courier', 'OLVA')
    .or('tracking_phase.is.null,tracking_phase.neq.ENTREGADO')
    .order('tracking_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN)
  if (qErr) {
    console.error('olva-tracking-sync: query', qErr.message)
    return new Response(JSON.stringify({ ok: false, stage: 'query' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const trackable = (rows ?? []).filter((r: TrackedRow) => r.tracking_numero)

  let checked = 0, transitions = 0, failed = 0
  const now = new Date().toISOString()
  // Un latido por corrida, no por guía: la línea de tiempo del panel necesita
  // saber que el proveedor contestó, no cuántas veces (§42 del esquema).
  let latido = false

  for (const row of trackable as TrackedRow[]) {
    // El año de emisión quedó registrado con la guía; si faltara (pedido viejo),
    // el año actual de Lima es la única lectura razonable.
    const year = normalizeYear(row.tracking_year, Date.now())

    const ctx = { proveedor: 'OLVA' as const, op: 'tracking.consulta', sessionId: row.id }
    const inicio = Date.now()
    let r: Response
    try {
      r = await fetch(`${OLVA_API_BASE}/v1/tracking/${row.tracking_numero}/${year}`, {
        headers: { 'X-API-Key': key, Accept: 'application/json' },
      })
    } catch (e) {
      await anotarSinRespuesta(ctx, e, Date.now() - inicio)
      break
    }

    if (r.status === 429) {
      await anotarRespuesta(ctx, r, Date.now() - inicio)
      break
    }

    checked++
    if (!r.ok) {
      // 502 del proveedor = guía inexistente O Olva caído, indistinguibles
      // (verificado contra la API real). Por eso aquí NO se acusa a la guía en
      // el chat como hace el sync de Shalom con su `not_found`: solo se audita
      // el chequeo, y el detalle crudo va al registro de la plataforma.
      failed++
      await anotarRespuesta(ctx, r, Date.now() - inicio)
      await supabase.from('order_sessions').update({ tracking_checked_at: now }).eq('id', row.id)
      continue
    }
    if (!latido) {
      latido = true
      await anotar({ proveedor: 'OLVA', op: 'tracking.consulta', outcome: 'OK', duracionMs: Date.now() - inicio })
    }

    const data = await r.json().catch(() => null) as
      { details?: unknown; realtime?: unknown } | null
    const details = data && Array.isArray(data.details) ? data.details.filter(isObj) : []
    const realtime = data && Array.isArray(data.realtime) ? data.realtime.filter(isObj) : []
    const { transitioned } = await applyTracking(row, {
      phase: derivePhase([...details, ...realtime]),
      demoraIso: null,
    })
    if (transitioned) transitions++
  }

  return new Response(
    JSON.stringify({ ok: true, active: trackable.length, checked, transitions, failed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
