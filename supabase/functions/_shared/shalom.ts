import { isObj, supabase } from './tracking.ts'
import type { Phase } from './tracking.ts'
import { SHALOM_LAT_BASE, signingSecretOf } from './shalom-lat.ts'
import { anotar } from './api-eventos.ts'

// ─── Shalom — lo ESPECÍFICO del courier ──────────────────────────────────────
// El reflejo compartido (fase hacia adelante, avisos de transición, cobranza al
// llegar a destino) vive en `tracking.ts`, común a todos los couriers; aquí va
// solo lo que es de Shalom: su mapeo de hitos, sus fechas, su key y su webhook.
// Se re-exporta lo compartido para que los imports existentes sigan valiendo.

export {
  applyTracking, broadcast, chatMessage, isObj, PHASE_RANK, supabase, TRACKED_COLUMNS,
} from './tracking.ts'
export type { Phase, TrackedRow } from './tracking.ts'

// Hito → fase, del más avanzado al menos (mismo mapeo determinista que
// ShalomTrackingService). `demora` no está: es una alerta, no una fase.
const PHASE_BY_MILESTONE: [string, Phase][] = [
  ['entregado', 'ENTREGADO'],
  ['reparto', 'EN_DESTINO'],
  ['destino', 'EN_DESTINO'],
  ['transito', 'EN_TRANSITO'],
  ['origen', 'EN_ORIGEN'],
]

// `registrado` NO está en esta tabla a propósito, y no es un olvido: la guía
// existe pero el paquete puede seguir en nuestro almacén. Mapearlo a EN_ORIGEN
// —como se hacía— borraba el hueco entre "emití la guía" y "la dejé en la
// agencia", que es donde se pierde la plata en contraentrega. Sin fase, el
// pedido se queda en la columna `registrado` del tablero hasta que el courier
// diga `origen`, que es cuando el paquete de verdad ya salió de nuestras manos.

export function derivePhase(status: Record<string, unknown>): Phase | null {
  for (const [milestone, phase] of PHASE_BY_MILESTONE) {
    if (isObj(status[milestone])) return phase
  }
  return null
}

// Las fechas del proveedor vienen "YYYY-MM-DD HH:mm:ss" en hora de Lima (UTC-5).
export function limaDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(`${v.trim().replace(' ', 'T')}-05:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

let cachedKey: string | null = null
export async function shalomApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  const fromEnv = Deno.env.get('SHALOM_API_KEY')
  if (fromEnv) return (cachedKey = fromEnv)
  const { data, error } = await supabase.rpc('shalom_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedKey = data)
}

let cachedWebhookSecret: string | null = null
export async function webhookSecret(): Promise<string | null> {
  if (cachedWebhookSecret) return cachedWebhookSecret
  const fromEnv = Deno.env.get('SHALOM_WEBHOOK_SECRET')
  if (fromEnv) return (cachedWebhookSecret = fromEnv)
  const { data, error } = await supabase.rpc('shalom_webhook_secret')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedWebhookSecret = data)
}

// Bootstrap del webhook, autónomo y sin que el secret pase por ningún chat:
// si no hay secret local y el proveedor no tiene webhook configurado, registra
// la URL de `shalom-webhook` (el ping de verificación lo responde esa función
// sola) y guarda el signing_secret DIRECTO en Vault vía el RPC
// store_shalom_webhook_secret (sección 24). Best-effort: si falla, el barrido
// sigue cubriendo el tracking y se reintenta en el próximo arranque.
let ensureWebhookTried = false
export async function ensureWebhook(apiKey: string): Promise<void> {
  if (ensureWebhookTried) return
  ensureWebhookTried = true
  try {
    if (await webhookSecret()) return
    const cfg = await fetch('https://api.shalom-api-peru.com/v1/webhooks', {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    }).then(r => (r.ok ? r.json() : null)).catch(() => null) as { configured?: unknown } | null
    if (!cfg) return
    if (cfg.configured === true) {
      // Hay webhook en el proveedor pero no tenemos su secret: NO se pisa.
      console.error('shalom webhook: configurado en el proveedor sin secret local — rotar con POST /v1/webhooks/rotate y guardar el nuevo en Vault')
      return
    }
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shalom-webhook`
    const r = await fetch('https://api.shalom-api-peru.com/v1/webhooks', {
      method: 'PUT',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const body = await r.json().catch(() => null) as { signing_secret?: unknown; verified?: unknown } | null
    if (!r.ok || !body || typeof body.signing_secret !== 'string' || !body.signing_secret) {
      await anotar({
        proveedor: 'SHALOM_PE', op: 'webhook.registrar',
        outcome: r.ok ? 'FALLO' : r.status >= 500 ? 'FALLO' : 'RECHAZO',
        httpStatus: r.status, detail: r.ok ? 'respuesta sin signing_secret' : null,
      })
      return
    }
    const { error } = await supabase.rpc('store_shalom_webhook_secret', { secret: body.signing_secret })
    if (error) console.error('shalom webhook: no se pudo guardar el secret en Vault', error.message)
    else console.log('shalom webhook: registrado y secret guardado en Vault; verified =', body.verified === true)
  } catch (e) {
    console.error('shalom webhook: bootstrap falló', e)
  }
}

// ─── Shalom LAT — la CONTINGENCIA (llaves y webhook) ─────────────────────────
// Lo específico de LAT (fase, payloads, firma) vive en `shalom-lat.ts`, que es
// puro y se prueba en `npm test`. Acá va solo lo que necesita Deno: sus llaves
// y el bootstrap de su webhook, con la misma plomería que el titular — secret
// de entorno primero, Vault después, y JAMÁS en el repo ni en un chat.

let cachedLatKey: string | null = null
export async function shalomLatApiKey(): Promise<string | null> {
  if (cachedLatKey) return cachedLatKey
  const fromEnv = Deno.env.get('SHALOM_LAT_API_KEY')
  if (fromEnv) return (cachedLatKey = fromEnv)
  const { data, error } = await supabase.rpc('shalom_lat_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedLatKey = data)
}

let cachedLatWebhookSecret: string | null = null
export async function latWebhookSecret(): Promise<string | null> {
  if (cachedLatWebhookSecret) return cachedLatWebhookSecret
  const fromEnv = Deno.env.get('SHALOM_LAT_WEBHOOK_SECRET')
  if (fromEnv) return (cachedLatWebhookSecret = fromEnv)
  const { data, error } = await supabase.rpc('shalom_lat_webhook_secret')
  if (error || typeof data !== 'string' || !data) return null
  return (cachedLatWebhookSecret = data)
}

// Mismo bootstrap autónomo que el titular, contra `PUT /webhooks` de LAT. Los
// dos proveedores empujan a la MISMA función (`shalom-webhook`), que prueba las
// dos firmas: un endpoint menos que deployar y ninguna ambigüedad, porque el
// secret que valida es el que dice de quién vino el evento.
let ensureLatTried = false
export async function ensureLatWebhook(apiKey: string): Promise<void> {
  if (ensureLatTried) return
  ensureLatTried = true
  try {
    if (await latWebhookSecret()) return
    const cfg = await fetch(`${SHALOM_LAT_BASE}/webhooks`, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    // Ya hay un webhook configurado del que no tenemos el secret: NO se pisa
    // (rotarlo dejaría sordo a quien lo esté usando). Se rota a mano con
    // `PUT /webhooks` + `rotateSecret: true` y se guarda el nuevo en Vault.
    if (cfg && /"?(configured|active|enabled)"?\s*:\s*true/.test(JSON.stringify(cfg))) {
      console.error('shalom LAT webhook: configurado en el proveedor sin secret local — rotar con PUT /webhooks {rotateSecret:true} y guardar el nuevo en Vault')
      return
    }
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shalom-webhook`
    const r = await fetch(`${SHALOM_LAT_BASE}/webhooks`, {
      method: 'PUT',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, rotateSecret: false }),
    })
    const secret = r.ok ? signingSecretOf(await r.json().catch(() => null)) : null
    if (!secret) {
      await anotar({
        proveedor: 'SHALOM_LAT', op: 'webhook.registrar',
        outcome: r.ok ? 'FALLO' : r.status >= 500 ? 'FALLO' : 'RECHAZO',
        httpStatus: r.status, detail: r.ok ? 'respuesta sin secreto de firma' : null,
      })
      return
    }
    const { error } = await supabase.rpc('store_shalom_lat_webhook_secret', { secret })
    if (error) console.error('shalom LAT webhook: no se pudo guardar el secret en Vault', error.message)
    else console.log('shalom LAT webhook: registrado y secret guardado en Vault')
  } catch (e) {
    console.error('shalom LAT webhook: bootstrap falló', e)
  }
}
