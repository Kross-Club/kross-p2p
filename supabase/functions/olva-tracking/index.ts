import { applyTracking, isObj, supabase, TRACKED_COLUMNS } from '../_shared/tracking.ts'
import type { TrackedRow } from '../_shared/tracking.ts'
import { derivePhase, normalizeYear } from '../_shared/olva.ts'
import type { TrackingPhase } from '../_shared/olva.ts'
import { readLatPayload } from '../_shared/olva-lat.ts'
import { olvaLatApiKey, trackAtLat } from '../_shared/olva-lat-api.ts'
import { olvaApiKey } from '../_shared/olva-key.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from '../_shared/api-eventos.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Proxy de tracking de guías Olva, con DOS RIELES.
//
//   1. **Olva API Perú** (`api.olva-api-peru.com`) — el de siempre. Rastrea por
//      numero + año de emisión y da TEXTOS, de los que la fase sale por
//      heurística.
//   2. **Olva LAT** (`api.olva-api.lat`) — la contingencia. Rastrea por número a
//      secas y da un ENUM cerrado de estados.
//
// Los dos son proveedores INDEPENDIENTES, no la API oficial de Olva Courier:
// pueden cambiar o caerse sin aviso, igual que el buscador del que sale
// olva.json. Que sean dos es justamente la respuesta a eso — antes, un `502`
// del primero dejaba el pedido a ciegas hasta la próxima barrida.
//
// El segundo entra SOLO si el primero no contesta: su cuota es MENSUAL (no por
// minuto), así que cada consulta de más se paga en días sin servicio a fin de
// mes. Y trae un regalo que el primero no puede dar: un **404 de verdad**. El
// primer proveedor devuelve `502` tanto para una guía inexistente como para
// Olva caído (verificado contra la API real), y por eso este proxy nunca decía
// `not_found`; ahora lo dice cuando quien lo dice es el riel que sabe.
//
// Con `session_id`, además REFLEJA la lectura en el pedido vía `applyTracking`
// (mismo camino que el barrido `olva-tracking-sync`): el refresh manual desde
// el chat y el job hablan el mismo idioma — avisos de transición incluidos.
// Solo se refleja si la guía consultada ES la registrada en ese pedido: una
// consulta suelta no puede estampar otra guía a un pedido.
//
// Ninguna key toca el frontend ni el repo: salen de los secrets OLVA_API_KEY /
// OLVA_LAT_API_KEY y, si no están, del Vault del proyecto (RPC `olva_api_key()`
// y `olva_lat_api_key()`, secciones 21 y 37 — solo service role).
const OLVA_API_BASE = 'https://api.olva-api-peru.com'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** Lo que este proxy devuelve, venga del riel que venga. */
interface Lectura {
  phase: TrackingPhase | null
  general: unknown
  details: Record<string, unknown>[]
  realtime: Record<string, unknown>[]
  via: 'PERU' | 'LAT'
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
  const latKey = await olvaLatApiKey()
  if (!key && !latKey) {
    console.error('olva-tracking: sin key de ningún riel (ni secret ni Vault)')
    return json({ ok: false, stage: 'config' }, 500)
  }

  // ─── Riel 1: Olva API Perú ─────────────────────────────────────────────────
  let lectura: Lectura | null = null
  let stage: 'not_found' | 'rate_limit' | 'upstream' | 'validation' = 'upstream'

  const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : null
  const ctxPeru = { proveedor: 'OLVA' as const, op: 'tracking.consulta', sessionId }
  const inicio = Date.now()

  if (key) {
    let r: Response | null = null
    try {
      r = await fetch(`${OLVA_API_BASE}/v1/tracking/${track}/${year}`, {
        headers: { 'X-API-Key': key, Accept: 'application/json' },
      })
    } catch (e) {
      await anotarSinRespuesta(ctxPeru, e, Date.now() - inicio)
    }

    if (r?.ok) {
      const data = await r.json().catch(() => null) as
        { general?: unknown; details?: unknown; realtime?: unknown } | null
      if (data && typeof data === 'object') {
        const details = Array.isArray(data.details) ? data.details.filter(isObj) : []
        const realtime = Array.isArray(data.realtime) ? data.realtime.filter(isObj) : []
        lectura = {
          phase: derivePhase([...details, ...realtime]),
          general: data.general ?? null, details, realtime, via: 'PERU',
        }
      } else {
        await anotar({ ...ctxPeru, outcome: 'FALLO', detail: 'respuesta no-JSON', httpStatus: r.status })
      }
    } else if (r) {
      // El detalle crudo del proveedor NO va al chat (regla del repo: ningún
      // texto de terceros frente a compradores/vendedores). Va al registro de
      // la plataforma, que existe para poder reclamárselo (§42).
      await anotarRespuesta(ctxPeru, r, Date.now() - inicio)
      if (r.status === 400) stage = 'validation'
      else if (r.status === 429) stage = 'rate_limit'
      // 404/502 del riel 1 NO se traducen a `not_found`: su 502 significa "guía
      // inexistente O Olva caído" y no los distingue. Se deja `upstream` y que
      // decida el riel 2, que sí sabe.
    }
  }

  // ─── Riel 2: Olva LAT, solo si el primero no respondió ─────────────────────
  if (!lectura && latKey && stage !== 'validation') {
    const inicioLat = Date.now()
    const r = await trackAtLat(latKey, track)
    if (!r.ok) {
      await anotar({
        proveedor: 'OLVA_LAT', op: 'tracking.consulta', sessionId,
        outcome: r.stage === 'not_found' ? 'RECHAZO' : r.status && r.status >= 500 ? 'FALLO' : r.status ? 'RECHAZO' : 'SIN_RESPUESTA',
        httpStatus: r.status ?? null, errorCode: r.stage, duracionMs: Date.now() - inicioLat,
      })
    }
    if (r.ok) {
      const { phase, tracking } = readLatPayload(r.data)
      lectura = {
        phase,
        // Traducido al vocabulario que el primer riel ya hablaba, para que el
        // chat no tenga que saber por dónde llegó la noticia.
        general: tracking && {
          fecha_envio: tracking.events.at(-1)?.date ?? null,
          id_envio: tracking.trackingNumber,
          remitente: null,
          consignado: null,
          origen: tracking.origin.agency,
          destino: tracking.destination.agency,
        },
        details: (tracking?.events ?? []).map(e => ({
          fecha: e.date, estado: e.status, descripcion: e.detail, ubicacion: e.location,
        })),
        realtime: [],
        via: 'LAT',
      }
    } else if (r.stage === 'not_found') {
      // ESTA sí es una guía que no existe: el riel 2 devuelve 404 de verdad.
      stage = 'not_found'
    } else if (r.stage === 'rate_limit' || r.stage === 'quota') {
      stage = 'rate_limit'
    }
  }

  if (!lectura) return json({ ok: false, stage }, stage === 'not_found' ? 404 : stage === 'rate_limit' ? 429 : 502)

  if (sessionId) {
    const { data: row } = await supabase
      .from('order_sessions')
      .select(TRACKED_COLUMNS)
      .eq('id', sessionId)
      .eq('tracking_courier', 'OLVA')
      .eq('tracking_numero', track)
      .maybeSingle()
    if (row) await applyTracking(row as TrackedRow, { phase: lectura.phase, demoraIso: null })
  }

  return json({
    ok: true,
    phase: lectura.phase,
    general: lectura.general ?? null,
    details: lectura.details,
    realtime: lectura.realtime,
    via: lectura.via,
  })
})
