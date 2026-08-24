import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Proxy de tracking contra Olva API Perú (https://olva-api-peru.com/docs/).
// OJO: es un proveedor INDEPENDIENTE, no la API oficial de Olva Courier — puede
// cambiar o caerse sin aviso, igual que el buscador del que sale olva.json.
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data, error } = await supabase.rpc('olva_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

// El año de emisión viaja en 2 dígitos (YY). Acepta también 4 ("2026" → "26");
// si no llega, asume el año actual de Lima (UTC-5) — una guía se consulta casi
// siempre el mismo año en que se emitió.
function normalizeYear(input: unknown): string | null {
  if (input === undefined || input === null || input === '') {
    const lima = new Date(Date.now() - 5 * 60 * 60 * 1000)
    return String(lima.getUTCFullYear() % 100).padStart(2, '0')
  }
  const s = String(input).trim()
  if (/^\d{2}$/.test(s)) return s
  if (/^\d{4}$/.test(s)) return s.slice(2)
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as { track?: unknown; year?: unknown }
  const track = String(body.track ?? '').replace(/\D/g, '')
  const year = normalizeYear(body.year)
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

  return json({
    ok: true,
    general: data.general ?? null,
    details: Array.isArray(data.details) ? data.details : [],
    realtime: Array.isArray(data.realtime) ? data.realtime : [],
  })
})
