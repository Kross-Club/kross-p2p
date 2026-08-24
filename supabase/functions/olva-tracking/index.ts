import { applyTracking, isObj, supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import type { TrackedRow } from '../_shared/tracking.ts'
import { derivePhase, normalizeYear } from '../_shared/olva.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Proxy de tracking contra Olva API Perú (https://olva-api-peru.com/docs/).
// OJO: es un proveedor INDEPENDIENTE, no la API oficial de Olva Courier — puede
// cambiar o caerse sin aviso, igual que el buscador del que sale olva.json.
//
// Con `session_id`, además REFLEJA la lectura en el pedido vía `applyTracking`
// (mismo camino que el barrido `olva-tracking-sync`): el refresh manual desde
// el chat y el job hablan el mismo idioma — avisos de transición incluidos.
// Solo se refleja si la guía consultada ES la registrada en ese pedido: una
// consulta suelta no puede estampar otra guía a un pedido.
//
// La key jamás toca el frontend ni el repo: se lee del secret OLVA_API_KEY y,
// si no está, del Vault del proyecto vía el RPC olva_api_key() (service role).
// Límite del proveedor: 60 requests/min por key → 429.
const OLVA_API_BASE = 'https://api.olva-api-peru.com'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

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

  const body = await req.json().catch(() => ({})) as
    { track?: unknown; year?: unknown; session_id?: unknown }
  const track = String(body.track ?? '').replace(/\D/g, '')
  const year = normalizeYear(body.year, Date.now())
  if (track.length < 6 || track.length > 15 || !year) {
    return json({ ok: false, stage: 'validation' }, 400)
  }

  const key = await olvaApiKey()
  if (!key) {
    console.error('olva-tracking: sin OLVA_API_KEY (ni secret ni Vault)')
    return json({ ok: false, stage: 'config' }, 500)
  }

  let r: Response
  try {
    r = await fetch(`${OLVA_API_BASE}/v1/tracking/${track}/${year}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
    })
  } catch (e) {
    console.error('olva-tracking: red caída hacia el proveedor', e)
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  if (!r.ok) {
    // El detalle crudo del proveedor va SOLO a los logs (regla del repo: ningún
    // texto de terceros frente a compradores/vendedores).
    console.error('olva-tracking: upstream', r.status, await r.text().catch(() => ''))
    if (r.status === 400) return json({ ok: false, stage: 'validation' }, 400)
    if (r.status === 404) return json({ ok: false, stage: 'not_found' }, 404)
    if (r.status === 429) return json({ ok: false, stage: 'rate_limit' }, 429)
    // 502 del proveedor: puede ser guía inexistente O Olva caído — no lo
    // distingue, así que aquí tampoco se inventa la diferencia.
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  const data = await r.json().catch(() => null) as
    { general?: unknown; details?: unknown; realtime?: unknown } | null
  if (!data || typeof data !== 'object') {
    console.error('olva-tracking: respuesta no-JSON del proveedor')
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  const details = Array.isArray(data.details) ? data.details.filter(isObj) : []
  const realtime = Array.isArray(data.realtime) ? data.realtime.filter(isObj) : []
  const phase = derivePhase([...details, ...realtime])

  if (typeof body.session_id === 'string' && body.session_id) {
    const { data: row } = await supabase
      .from('order_sessions')
      .select(TRACKED_COLUMNS)
      .eq('id', body.session_id)
      .eq('tracking_courier', 'OLVA')
      .eq('tracking_numero', track)
      .maybeSingle()
    if (row) await applyTracking(row as TrackedRow, { phase, demoraIso: null })
  }

  return json({ ok: true, phase, general: data.general ?? null, details, realtime })
})
