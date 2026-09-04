// ─── CONEXIONES · el estado de las APIs de terceros y sus fallos ─────────────
// La mitad de lectura de §42. Responde tres preguntas y ninguna más:
//
//   `estado`   → ¿cuál de mis integraciones está viva, cuál viene fallando y
//                cuál ni siquiera está montada?
//   `eventos`  → ¿qué falló exactamente, cuándo, y con qué respuesta?
//   `evento`   → tengo esta referencia apuntada (KX-…): enséñamela.
//
// Quién puede: **solo por JWT verificado**, y solo un admin. Quien administra
// la plataforma ve todo; el admin de una marca ve el mismo tablero pero sus
// eventos son los de SU tienda — el texto crudo de un proveedor puede traer
// datos de un pedido, y los pedidos de una marca no son de otra.
//
// Acá NO se pide `admin_auth_id` como en `manage-store`: ese atajo existe por
// compatibilidad con un front viejo y su id lo conoce cualquiera. Esta pantalla
// nace después, así que nace sin la deuda.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { administraLaPlataforma } from '../_shared/alcance.ts'
import { shalomApiKey, shalomLatApiKey } from '../_shared/shalom.ts'
import { olvaApiKey } from '../_shared/olva-key.ts'
import { SHALOM_LAT_BASE } from '../_shared/shalom-lat.ts'
import {
  esProveedor, INTEGRACIONES, saludDe, type Proveedor, type Salud,
} from '../_shared/integraciones.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const COLUMNAS =
  'ref, provider, op, outcome, http_status, error_code, detail, provider_ref, store_id, session_id, duration_ms, created_at'

/** Un chequeo barato y con timeout corto: el panel no espera a nadie. */
async function ping(url: string, headers: Record<string, string> = {}): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

/**
 * A quién se le puede preguntar "¿estás vivo?" sin gastar. Los que no están acá
 * devuelven `null`, que NO es lo mismo que estar caídos: es que no exponen un
 * chequeo gratis (preguntarle un DNI a RENIEC cuesta, mandar un WhatsApp
 * también). Para esos, el veredicto sale del historial de fallos.
 */
async function pingDe(id: Proveedor, llaves: Record<string, string | null>): Promise<boolean | null> {
  if (id === 'SHALOM_PE') return ping('https://api.shalom-api-peru.com/healthz')
  if (id === 'OLVA') return ping('https://api.olva-api-peru.com/healthz')
  if (id === 'SHALOM_LAT') {
    // `/validate` además confirma que la llave sigue activa, que es la mitad
    // de las veces que una integración "se cae".
    return llaves.SHALOM_LAT ? ping(`${SHALOM_LAT_BASE}/validate`, { 'x-api-key': llaves.SHALOM_LAT }) : null
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ─── Quién pregunta ────────────────────────────────────────────────────────
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return json({ error: 'auth_requerida' }, 401)
  const { data: authed } = await supabase.auth.getUser(bearer)
  if (!authed?.user) return json({ error: 'auth_requerida' }, 401)

  const { data: me } = await supabase.from('sellers')
    .select('is_admin, is_super_admin, is_operator, store_id')
    .eq('auth_user_id', authed.user.id).maybeSingle()
  if (!me?.is_admin) return json({ error: 'prohibido' }, 403)

  const plataforma = administraLaPlataforma(me)
  /** El admin de una marca solo ve lo suyo. */
  const suTienda = plataforma ? null : String(me.store_id ?? '')
  if (!plataforma && !suTienda) return json({ error: 'prohibido' }, 403)

  const body = await req.json().catch(() => ({})) as {
    action?: string
    provider?: string
    ref?: string
    limit?: number
    /** ISO: trae los anteriores a esta fecha (paginado por tiempo). */
    antes?: string
  }

  // ─── ESTADO · el tablero ───────────────────────────────────────────────────
  if (!body.action || body.action === 'estado') {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [keyPE, keyLAT, keyOlva] = await Promise.all([
      shalomApiKey(), shalomLatApiKey(), olvaApiKey(),
    ])
    const llaves: Record<string, string | null> = { SHALOM_PE: keyPE, SHALOM_LAT: keyLAT, OLVA: keyOlva }

    // Los fallos de las últimas 24 h, de una sola consulta: una por proveedor
    // serían catorce viajes para pintar una pantalla.
    let qFallos = supabase.from('api_events')
      .select('provider, outcome, created_at, ref, http_status, error_code')
      .gte('created_at', desde).neq('outcome', 'OK')
      .order('created_at', { ascending: false }).limit(2000)
    if (suTienda) qFallos = qFallos.eq('store_id', suTienda)
    const { data: fallos } = await qFallos

    const porProveedor = new Map<string, { total: number; ultimo: Record<string, unknown> }>()
    for (const f of fallos ?? []) {
      const p = String(f.provider)
      const previo = porProveedor.get(p)
      // La lista viene de la más nueva a la más vieja: el primero es el último.
      if (previo) previo.total++
      else porProveedor.set(p, { total: 1, ultimo: f })
    }

    // Cuántas marcas tienen configurada cada integración de alcance `marca`.
    // Es lo que convierte "Flow está bien" en "Flow está bien en 2 de 5".
    const marcas = plataforma ? await configuracionPorMarca() : null

    const estados = await Promise.all(INTEGRACIONES.map(async (i) => {
      const cuenta = porProveedor.get(i.id)
      const configurado = i.alcance === 'plataforma'
        ? (i.id in llaves ? !!llaves[i.id] : !i.secreto || !!Deno.env.get(i.secreto))
        : (marcas?.[i.id] ?? 0) > 0
      const ping = configurado ? await pingDe(i.id, llaves) : null
      const salud: Salud = saludDe({ configurado, ping, fallos: cuenta?.total ?? 0 })
      return {
        ...i,
        configurado,
        ping,
        salud,
        fallos_24h: cuenta?.total ?? 0,
        ultimo_fallo: cuenta?.ultimo ?? null,
        marcas_configuradas: marcas?.[i.id] ?? null,
      }
    }))

    return json({
      integraciones: estados,
      total_marcas: marcas?.__total ?? null,
      alcance: plataforma ? 'plataforma' : 'marca',
      checked_at: new Date().toISOString(),
    })
  }

  // ─── EVENTOS · el historial ────────────────────────────────────────────────
  if (body.action === 'eventos') {
    const limite = Math.min(Math.max(Number(body.limit) || 50, 1), 200)
    let q = supabase.from('api_events').select(COLUMNAS)
      .order('created_at', { ascending: false }).limit(limite)
    if (body.provider && esProveedor(body.provider)) q = q.eq('provider', body.provider)
    if (typeof body.antes === 'string' && body.antes) q = q.lt('created_at', body.antes)
    if (suTienda) q = q.eq('store_id', suTienda)
    const { data, error } = await q
    if (error) {
      console.error('[integraciones] eventos', error.message)
      return json({ error: 'consulta' }, 500)
    }
    return json({ eventos: data ?? [] })
  }

  // ─── EVENTO · el que alguien tiene apuntado ────────────────────────────────
  if (body.action === 'evento') {
    const ref = String(body.ref ?? '').trim().toUpperCase()
    if (!ref) return json({ error: 'falta_ref' }, 400)
    let q = supabase.from('api_events').select(COLUMNAS).eq('ref', ref)
    if (suTienda) q = q.eq('store_id', suTienda)
    const { data } = await q.maybeSingle()
    return json({ evento: data ?? null })
  }

  return json({ error: 'accion_desconocida' }, 400)
})

/**
 * Cuántas marcas tienen lista cada integración que se configura por marca. Se
 * lee de las mismas columnas que el panel escribe, y por eso responde a la
 * pregunta de verdad: no "¿el riel existe?" sino "¿cuántos de mis clientes
 * pueden cobrar hoy?".
 */
async function configuracionPorMarca(): Promise<Record<string, number>> {
  const out: Record<string, number> = { PAY360: 0, FLOW: 0, META_CAPI: 0, TIKTOK_CAPI: 0, WHATSAPP: 0, __total: 0 }
  const { data: tiendas } = await supabase.from('stores')
    .select('id, active, pay360_enabled, pay360_business_id, flow_enabled, wa_enabled, wa_phone_number_id, meta_pixel_id, tiktok_pixel_id')
  const { data: secretos } = await supabase.from('store_secrets')
    .select('store_id, flow_api_key, meta_capi_token, tiktok_capi_token')
  const porTienda = new Map((secretos ?? []).map(s => [String(s.store_id), s]))

  for (const t of tiendas ?? []) {
    if (t.active === false) continue
    out.__total++
    const sec = porTienda.get(String(t.id))
    if (t.pay360_enabled && t.pay360_business_id) out.PAY360++
    if (t.flow_enabled && sec?.flow_api_key) out.FLOW++
    if (t.wa_enabled && t.wa_phone_number_id) out.WHATSAPP++
    if (t.meta_pixel_id && sec?.meta_capi_token) out.META_CAPI++
    if (t.tiktok_pixel_id && sec?.tiktok_capi_token) out.TIKTOK_CAPI++
  }
  return out
}
