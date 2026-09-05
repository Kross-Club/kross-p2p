// ─── Olva LAT · lo que toca red y llaves (Deno) ──────────────────────────────
// El gemelo de `_shared/shalom.ts` para el segundo riel de Olva. Lo PURO —el
// mapeo de estados a fase, el parseo, la firma— vive en `olva-lat.ts` y en
// `olva-lat-orders.ts`; acá solo la key, el `fetch` y el bootstrap del webhook.
//
// La key **jamás** va al repo ni al frontend: se lee del secret de entorno
// `OLVA_LAT_API_KEY` y, si no está, del Vault del proyecto vía el RPC
// `olva_lat_api_key()` (sección 37 de setup-kross.sql, ejecutable solo por
// `service_role`). Misma escalera que `OLVA_API_KEY` y `SHALOM_API_KEY`.
//
// ⚠️ CUOTA, no rate limit. El primer riel de Olva cobra por minuto (60 req/min);
// este cobra por MES según el plan (p. ej. 5.000 consultas). Eso cambia el
// diseño: no basta con espaciar las llamadas, hay que GASTAR MENOS. Por eso
//   · el webhook es el camino principal (webhooks y suscripciones son gratis y
//     no consumen cuota — lo dice la doc del proveedor),
//   · el barrido usa este riel SOLO cuando el primero falla, y con tope propio,
//   · `/validate` es gratis y es el que alimenta el semáforo del panel.

import { supabase } from './tracking.ts'
import { OLVA_LAT_BASE, parseLatSignature, firmaVigente } from './olva-lat.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from './api-eventos.ts'
import { parseLatAgencies } from './olva-lat-orders.ts'
import type { LatAgency } from './olva-lat-orders.ts'

export { OLVA_LAT_BASE } from './olva-lat.ts'

/** En qué se quedó una llamada. Mismo contrato que el resto de proveedores:
 *  cada fallo dice su etapa, porque la UI reacciona distinto a cada una. */
export type LatStage =
  | 'validation' | 'config' | 'not_found' | 'auth' | 'quota' | 'rate_limit' | 'upstream' | 'network'

export type LatCall<T> = { ok: true; data: T } | { ok: false; stage: LatStage; status?: number }

let cachedKey: string | null = null
export async function olvaLatApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('OLVA_LAT_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const { data, error } = await supabase.rpc('olva_lat_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

let cachedWebhookSecret: string | null = null
export async function olvaLatWebhookSecret(): Promise<string | null> {
  if (cachedWebhookSecret) return cachedWebhookSecret
  const fromEnv = Deno.env.get('OLVA_LAT_WEBHOOK_SECRET')
  if (fromEnv) return (cachedWebhookSecret = fromEnv)
  const { data, error } = await supabase.rpc('olva_lat_webhook_secret')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedWebhookSecret = data)
}

/** Traduce el status HTTP del proveedor a etapa. `403` es plan vencido y `429`
 *  cuota o rate limit: los dos se ven igual desde afuera y los dos significan
 *  "hoy este riel no responde", pero se distinguen para el log. */
function stageDe(status: number): LatStage {
  if (status === 400) return 'validation'
  if (status === 401) return 'auth'
  if (status === 403) return 'quota'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limit'
  return 'upstream'
}

const TIMEOUT_MS = 20_000

/**
 * Una llamada al proveedor, con timeout y sin dejar escapar su texto crudo: el
 * detalle va SOLO a los logs (regla de la casa — ningún texto de terceros
 * frente a compradores o vendedores).
 */
export async function latFetch<T = unknown>(
  path: string,
  init: RequestInit & { key: string; timeoutMs?: number; sessionId?: string | null },
): Promise<LatCall<T>> {
  const { key, timeoutMs, sessionId, ...rest } = init
  // La operación sale del path (`/track` → `track`), como en el emisor de
  // Shalom LAT: basta para leer la lista de Conexiones y evita pasarle un
  // rótulo a cada llamada.
  const ctx = {
    proveedor: 'OLVA_LAT' as const,
    op: path.replace(/^\/+/, '').split('?')[0].replace(/\//g, '.') || 'raiz',
    sessionId: sessionId ?? null,
  }
  const inicio = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? TIMEOUT_MS)
  let r: Response
  try {
    r = await fetch(`${OLVA_LAT_BASE}${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: { 'x-api-key': key, Accept: 'application/json', ...(rest.headers ?? {}) },
    })
  } catch (e) {
    await anotarSinRespuesta(ctx, e, Date.now() - inicio)
    return { ok: false, stage: 'network' }
  } finally {
    clearTimeout(t)
  }

  if (!r.ok) {
    // El texto crudo del proveedor NO va al chat; va al registro de la
    // plataforma (§42), que existe para poder reclamárselo con datos.
    await anotarRespuesta(ctx, r, Date.now() - inicio)
    return { ok: false, stage: stageDe(r.status), status: r.status }
  }
  const data = await r.json().catch(() => null)
  if (data === null) {
    await anotar({ ...ctx, outcome: 'FALLO', detail: 'respuesta no-JSON', httpStatus: r.status })
    return { ok: false, stage: 'upstream', status: r.status }
  }
  return { ok: true, data: data as T }
}

// ─── Tracking ────────────────────────────────────────────────────────────────

/** `POST /track` — la consulta que SÍ consume cuota. Sin año: a diferencia del
 *  primer riel, acá basta el número de guía. */
export const trackAtLat = (key: string, orderNumber: string) =>
  latFetch(`/track`, {
    key,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber }),
  })

/** `POST /tracking/subscriptions` — GRATIS (no consume cuota): a partir de acá
 *  el proveedor empuja cada cambio de estado al webhook. Es el camino barato y
 *  el que hace que el pedido se entere al instante en vez de en media hora. */
export const subscribeAtLat = (key: string, orderNumber: string) =>
  latFetch(`/tracking/subscriptions`, {
    key,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber }),
  })

/** `GET /validate` — GRATIS. Dice si la key vive y cuánta cuota queda; es lo
 *  que alimenta el semáforo del panel sin gastar una consulta. */
export const validateAtLat = (key: string) =>
  latFetch<{ valid?: boolean; limit?: number; currentUsage?: number; remaining?: number }>(
    `/validate`, { key, timeoutMs: 8_000 })

// ─── Agencias ────────────────────────────────────────────────────────────────

// El catálogo cambia de mes en mes, no de minuto en minuto, y **consultarlo sí
// gasta cuota**: se cachea por instancia y POR DEPARTAMENTO. Sin esto, cada guía
// emitida costaría dos consultas en vez de una — la del catálogo y la del
// registro—, y a fin de mes eso es la mitad del plan gastada en releer lo mismo.
const cachedAgencies = new Map<string, { at: number; list: LatAgency[] }>()
const AGENCIAS_TTL_MS = 30 * 60 * 1000

export async function latAgencies(key: string, department?: string | null): Promise<LatAgency[]> {
  const clave = (department ?? '').trim().toUpperCase()
  const ya = cachedAgencies.get(clave)
  if (ya && Date.now() - ya.at < AGENCIAS_TTL_MS) return ya.list

  const qs = clave ? `?department=${encodeURIComponent(clave)}` : ''
  const r = await latFetch(`/agencies${qs}`, { key })
  if (!r.ok) return []
  const list = parseLatAgencies(r.data)
  // Una lista vacía no se cachea: puede ser un departamento mal escrito, y
  // guardarla dejaría 30 min de guías cayendo en SKIPPED por lo mismo.
  if (list.length) cachedAgencies.set(clave, { at: Date.now(), list })
  return list
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Verifica `X-Olva-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<body>")>` en
 * tiempo constante, con ventana anti-replay de 5 min. Idéntico en forma al de
 * Shalom y al de 360pay: si un día se repite una tercera vez, se factoriza.
 */
export async function firmaValida(raw: string, header: string | null, secret: string): Promise<boolean> {
  const partes = parseLatSignature(header)
  if (!partes || !firmaVigente(partes.t, Date.now())) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${partes.t}.${raw}`))
  const esperada = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  if (esperada.length !== partes.v1.length) return false
  let diff = 0
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ partes.v1.charCodeAt(i)
  return diff === 0
}

/**
 * Bootstrap del webhook, autónomo y sin que el secret pase por ningún chat:
 * si no hay secret local, hace el `PUT /webhooks` con la URL de
 * `olva-lat-webhook` y guarda el `whsec_…` DIRECTO en Vault vía el RPC
 * `store_olva_lat_webhook_secret` (sección 37). Best-effort: si falla, el
 * barrido sigue cubriendo el tracking y se reintenta en el próximo arranque.
 *
 * ⚠️ El `PUT` PISA el webhook configurado y emite un secret nuevo. Por eso solo
 * corre cuando no tenemos ninguno: con secret local no se toca nada, que es lo
 * que evita que dos despliegues se roten el webhook uno al otro.
 */
let bootstrapIntentado = false
export async function ensureLatWebhook(key: string): Promise<void> {
  if (bootstrapIntentado) return
  bootstrapIntentado = true
  try {
    if (await olvaLatWebhookSecret()) return
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/olva-lat-webhook`
    const r = await latFetch<{ secret?: unknown; signing_secret?: unknown; webhookSecret?: unknown }>(
      '/webhooks', {
        key,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, enabled: true }),
      })
    if (!r.ok) {
      console.error('[olva-lat] registro del webhook falló', r.stage, r.status ?? '')
      return
    }
    // La doc enseña el secret como `whsec_…` pero no fija el nombre del campo:
    // se acepta cualquiera de los tres razonables antes que perder el bootstrap.
    const d = r.data as Record<string, unknown>
    const secret = [d.secret, d.signing_secret, d.webhookSecret]
      .find(v => typeof v === 'string' && v) as string | undefined
    if (!secret) {
      console.error('[olva-lat] el PUT /webhooks no devolvió secret')
      return
    }
    const { error } = await supabase.rpc('store_olva_lat_webhook_secret', { secret })
    if (error) console.error('[olva-lat] no se pudo guardar el secret en Vault', error.message)
    else {
      cachedWebhookSecret = secret
      console.log('[olva-lat] webhook registrado y secret guardado en Vault')
    }
  } catch (e) {
    console.error('[olva-lat] bootstrap del webhook falló', String(e).slice(0, 200))
  }
}
