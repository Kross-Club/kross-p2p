import { applyTracking, isObj, supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import type { TrackedRow } from '../_shared/tracking.ts'
import { derivePhase, normalizeYear } from '../_shared/olva.ts'
import { readLatPayload } from '../_shared/olva-lat.ts'
import { ensureLatWebhook, olvaLatApiKey, subscribeAtLat, trackAtLat } from '../_shared/olva-lat-api.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Barrido de tracking Olva (02-SMART-LOGISTICS §3). Lo invoca pg_cron cada
// 30 min a los :15/:45 (sección 23.e de setup-kross.sql), intercalado con el de
// Shalom; no recibe parámetros, no expone datos (solo conteos) y es idempotente.
// El reflejo vive en `_shared/tracking.ts`, compartido con el refresh manual.
//
// Desde que Olva tiene DOS rieles, este barrido hace tres cosas por corrida:
//
//   1. **Suscribe al webhook** las guías vivas que aún no lo estén. Las
//      suscripciones de Olva LAT son GRATIS (no consumen cuota) y son lo que
//      convierte el tracking de Olva de "cada 30 min" a "al instante". Cubre
//      también las guías anteriores a este riel, que nadie suscribió al
//      registrarlas.
//   2. **Consulta el riel 1** (Olva API Perú), guía por guía, como siempre: su
//      límite es por minuto (60 req/min) y da para 50 envíos por corrida.
//   3. **Cae al riel 2 solo donde el 1 falló**, y con tope propio. La cuota de
//      Olva LAT es MENSUAL: barrer con él a lo ancho quemaría el plan en días.
//      El respaldo real de este riel es el webhook, no la consulta.
const OLVA_API_BASE = 'https://api.olva-api-peru.com'
const MAX_PER_RUN = 50
/** Cuántas guías puede rescatar el riel 2 en una corrida. A 2 corridas/hora son
 *  ~480 consultas/día en el peor caso —el riel 1 caído entero—, que ya roza un
 *  plan de 5.000/mes: por eso el rescate es un parche de horas, no un modo de
 *  operación. Si el riel 1 se cae de verdad, lo que sostiene el tracking es el
 *  webhook, que no gasta nada. */
const MAX_LAT_PER_RUN = 10
/** Suscripciones por corrida. Son gratis; el tope existe para no alargar la
 *  invocación cuando una marca registra cien guías de golpe. */
const MAX_SUBS_PER_RUN = 25

const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

let cachedKey: string | null = null
async function olvaApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('OLVA_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const { data, error } = await supabase.rpc('olva_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const key = await olvaApiKey()
  const latKey = await olvaLatApiKey()
  if (!key && !latKey) {
    console.error('olva-tracking-sync: sin key de ningún riel (ni secret ni Vault)')
    return json({ ok: false, stage: 'config' }, 500)
  }

  // El webhook se registra solo la primera vez que arranca una instancia sin
  // secret guardado (mismo patrón que `ensureWebhook` de Shalom). Best-effort:
  // si falla, este barrido sigue cubriendo el tracking.
  if (latKey) await ensureLatWebhook(latKey)

  // Los envíos vivos, los menos chequeados primero (índice 23.b).
  const { data: rows, error: qErr } = await supabase
    .from('order_sessions')
    .select(`${TRACKED_COLUMNS}, olva_lat_subscribed_at`)
    .eq('status', 'active')
    .eq('tracking_courier', 'OLVA')
    .or('tracking_phase.is.null,tracking_phase.neq.ENTREGADO')
    .order('tracking_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN)
  if (qErr) {
    console.error('olva-tracking-sync: query', qErr.message)
    return json({ ok: false, stage: 'query' }, 500)
  }

  type Fila = TrackedRow & { olva_lat_subscribed_at: string | null }
  const trackable = (rows ?? []).filter((r: Fila) => r.tracking_numero) as Fila[]

  // ─── 1. Suscribir al push lo que aún no lo esté (gratis) ───────────────────
  let subscribed = 0
  if (latKey) {
    for (const row of trackable) {
      if (row.olva_lat_subscribed_at || subscribed >= MAX_SUBS_PER_RUN) continue
      const r = await subscribeAtLat(latKey, row.tracking_numero!)
      // Se marca también si el proveedor dice que ya existía (`validation`):
      // reintentarla cada media hora para siempre no la va a crear dos veces.
      if (r.ok || r.stage === 'validation') {
        await supabase.from('order_sessions')
          .update({ olva_lat_subscribed_at: new Date().toISOString() }).eq('id', row.id)
        subscribed++
      }
    }
  }

  // ─── 2 y 3. Consultar, con el riel 2 de rescate ────────────────────────────
  let checked = 0, transitions = 0, failed = 0, rescatados = 0
  const now = new Date().toISOString()

  for (const row of trackable) {
    // El año de emisión quedó registrado con la guía; si faltara (pedido viejo),
    // el año actual de Lima es la única lectura razonable. Lo usan LOS DOS
    // rieles: el 1 lo exige en la ruta y el 2 lo acepta como `orderCode` — y sin
    // mandárselo asume el año en curso, que es un "no existe" en enero para una
    // guía de diciembre.
    const year = normalizeYear(row.tracking_year, Date.now())
    let reflejado = false

    if (key) {
      let r: Response | null = null
      try {
        r = await fetch(`${OLVA_API_BASE}/v1/tracking/${row.tracking_numero}/${year}`, {
          headers: { 'X-API-Key': key, Accept: 'application/json' },
        })
      } catch (e) {
        console.error('olva-tracking-sync: red caída hacia el riel 1', e)
      }

      if (r?.status === 429) {
        // Rate limit del riel 1: cortar la corrida entera. Seguir con el riel 2
        // sería cambiar un límite por minuto —que se pasa solo— por cuota
        // mensual, que no vuelve.
        console.error('olva-tracking-sync: rate limit del riel 1; corta la corrida')
        break
      }

      if (r?.ok) {
        checked++
        const data = await r.json().catch(() => null) as
          { details?: unknown; realtime?: unknown } | null
        const details = data && Array.isArray(data.details) ? data.details.filter(isObj) : []
        const realtime = data && Array.isArray(data.realtime) ? data.realtime.filter(isObj) : []
        const { transitioned } = await applyTracking(row, {
          phase: derivePhase([...details, ...realtime]),
          demoraIso: null,
        })
        if (transitioned) transitions++
        reflejado = true
      } else if (r) {
        // 502 del riel 1 = guía inexistente O Olva caído, indistinguibles
        // (verificado contra la API real). Por eso aquí NO se acusa a la guía en
        // el chat como hace el sync de Shalom con su `not_found`: el detalle
        // crudo va a los logs y la última palabra la tiene el riel 2.
        console.error('olva-tracking-sync: riel 1 falló', row.id, r.status, await r.text().catch(() => ''))
      }
    }

    if (reflejado) continue

    // ─── Rescate por el riel 2 ───────────────────────────────────────────────
    if (latKey && rescatados < MAX_LAT_PER_RUN) {
      const r = await trackAtLat(latKey, row.tracking_numero!, year)
      rescatados++
      if (r.ok) {
        checked++
        const { phase } = readLatPayload(r.data)
        const { transitioned } = await applyTracking(row, { phase, demoraIso: null })
        if (transitioned) transitions++
        continue
      }
      if (r.stage === 'quota' || r.stage === 'rate_limit') {
        // Cuota agotada: no tiene sentido pedir 9 veces más lo mismo.
        console.error('olva-tracking-sync: riel 2 sin cuota; se apaga el rescate en esta corrida')
        rescatados = MAX_LAT_PER_RUN
      }
      // `not_found` del riel 2 SÍ significa que la guía no existe, pero no se
      // acusa acá: un número mal copiado se corrige en el pedido, y este job
      // barre sin nadie mirando. Queda en los logs y el vendedor lo ve al tocar
      // "Actualizar" en el chat, que ahora sí distingue el caso.
    }

    failed++
    await supabase.from('order_sessions').update({ tracking_checked_at: now }).eq('id', row.id)
  }

  return json({
    ok: true, active: trackable.length, checked, transitions, failed, subscribed, rescatados,
  })
})
