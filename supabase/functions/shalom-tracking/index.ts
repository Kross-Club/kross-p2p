import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Proxy de tracking contra Shalom API Perú (https://shalom-api-peru.com/docs).
// OJO: misma familia que Olva API Perú — proveedor INDEPENDIENTE, no la API
// oficial de Shalom; puede cambiar o caerse sin aviso.
//
// Solo se usa el "modo estado" (X-API-Key + numero/ose_id): devuelve la línea
// de tiempo del envío, que es todo lo que la fase canónica necesita. El "modo
// detallado" exige además credenciales de la cuenta Shalom Pro
// (X-Shalom-Email/Password o sesión ssk_), que NO tenemos ni mandamos — y su
// primera llamada hace un login real contra Shalom (~90 s). El modo estado no
// paga esa latencia.
//
// La key jamás toca el frontend ni el repo: se lee del secret SHALOM_API_KEY
// y, si no está, del Vault del proyecto vía el RPC shalom_api_key() (service
// role). Límite del proveedor: 60 requests/min por key → 429.
const SHALOM_API_BASE = 'https://api.shalom-api-peru.com'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

let cachedKey: string | null = null
async function shalomApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('SHALOM_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data, error } = await supabase.rpc('shalom_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as
    { numero?: unknown; codigo?: unknown; ose_id?: unknown }

  // Identificadores del envío (comprobante físico / POST /v1/orders):
  //   numero = la guía (8–10 dígitos) · ose_id = id interno de Shalom ·
  //   codigo = 4 alfanuméricos, que por sí solo NO resuelve el estado.
  const numero = String(body.numero ?? '').replace(/\D/g, '')
  const oseId = String(body.ose_id ?? '').replace(/\D/g, '')
  const codigo = String(body.codigo ?? '').trim().toUpperCase()
  const numeroOk = /^\d{8,10}$/.test(numero)
  const oseOk = oseId.length > 0
  if ((!numeroOk && !oseOk) || (codigo && !/^[A-Z0-9]{4}$/.test(codigo))) {
    return json({ ok: false, stage: 'validation' }, 400)
  }

  const key = await shalomApiKey()
  if (!key) {
    console.error('shalom-tracking: sin SHALOM_API_KEY (ni secret ni Vault)')
    return json({ ok: false, stage: 'config' }, 500)
  }

  const params = new URLSearchParams()
  if (numeroOk) params.set('numero', numero)
  if (oseOk) params.set('ose_id', oseId)
  if (codigo) params.set('codigo', codigo)

  let r: Response
  try {
    r = await fetch(`${SHALOM_API_BASE}/v1/tracking?${params}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
    })
  } catch (e) {
    console.error('shalom-tracking: red caída hacia el proveedor', e)
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  if (!r.ok) {
    // El detalle crudo del proveedor va SOLO a los logs (regla del repo: ningún
    // texto de terceros frente a compradores/vendedores).
    console.error('shalom-tracking: upstream', r.status, await r.text().catch(() => ''))
    if (r.status === 400) return json({ ok: false, stage: 'validation' }, 400)
    // A diferencia de Olva API Perú, aquí guía inexistente SÍ es 404.
    if (r.status === 404) return json({ ok: false, stage: 'not_found' }, 404)
    if (r.status === 429) return json({ ok: false, stage: 'rate_limit' }, 429)
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  const data = await r.json().catch(() => null) as
    { detailed?: unknown; status?: unknown; order?: unknown } | null
  if (!data || typeof data !== 'object' || !data.status || typeof data.status !== 'object') {
    console.error('shalom-tracking: respuesta sin status del proveedor')
    return json({ ok: false, stage: 'upstream' }, 502)
  }

  return json({
    ok: true,
    detailed: data.detailed === true,
    status: data.status,
    // Solo llega con credenciales Shalom Pro (modo detallado); hoy es null.
    order: data.order && typeof data.order === 'object' ? data.order : null,
  })
})
