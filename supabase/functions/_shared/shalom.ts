import { isObj, supabase } from './tracking.ts'
import type { Phase } from './tracking.ts'

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
  ['registrado', 'EN_ORIGEN'],
]

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
      console.error('shalom webhook: registro falló', r.status)
      return
    }
    const { error } = await supabase.rpc('store_shalom_webhook_secret', { secret: body.signing_secret })
    if (error) console.error('shalom webhook: no se pudo guardar el secret en Vault', error.message)
    else console.log('shalom webhook: registrado y secret guardado en Vault; verified =', body.verified === true)
  } catch (e) {
    console.error('shalom webhook: bootstrap falló', e)
  }
}
