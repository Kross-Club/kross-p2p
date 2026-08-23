const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BNlgNwxGrQAL6HpxmipTikb7UDu0oj5vcqFURdW7tMhYuVLA-aX3OCZ1yyPGYjetYnRhsbm4kNldMsJqVVEeiSs'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Safe helpers — Safari on iOS (outside an installed PWA) has no Notification API,
// and touching it throws, which would blank the whole page.
export const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window
export const notifPermission = (): NotificationPermission => (notifSupported() ? Notification.permission : 'default')
export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && notifSupported()

// ─── Preferencias por dispositivo (equipo) ────────────────────────────────────
// Qué avisos quiere ESTE navegador. Viven en localStorage para pintar la UI y
// decidir el sonido en primer plano; el servidor guarda una copia en la fila de
// la suscripción y filtra al enviar (el push ni siquiera llega si está apagado).
export interface PushPrefs {
  new_client: boolean
  new_message: boolean
}
const PREFS_KEY = 'kross_push_prefs'

export function getPushPrefs(): PushPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    const p = raw ? JSON.parse(raw) : {}
    return { new_client: p.new_client !== false, new_message: p.new_message !== false }
  } catch {
    return { new_client: true, new_message: true }
  }
}

export function storePushPrefs(p: PushPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

/** Endpoint de la suscripción activa de este navegador, si existe. */
export async function getPushEndpoint(): Promise<string | null> {
  try {
    if (!pushSupported()) return null
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

export async function subscribePush(opts: {
  sessionId?: string
  sellerId?: string
  buyerId?: string
  role: 'buyer' | 'seller'
}): Promise<boolean> {
  try {
    if (!pushSupported()) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const prefs = getPushPrefs()
    await fetch(`${BASE}/save-push-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: opts.sessionId ?? null,
        seller_id: opts.sellerId ?? null,
        buyer_id: opts.buyerId ?? null,
        sub_role: opts.role,
        subscription: sub.toJSON(),
        // Solo aplican al equipo; para el comprador van en true y no filtran nada.
        notify_new_client: prefs.new_client,
        notify_new_message: prefs.new_message,
      }),
    })

    return true
  } catch {
    return false
  }
}

/** Da de baja ESTE dispositivo: borra la suscripción del navegador y del servidor. */
export async function unsubscribePush(): Promise<boolean> {
  try {
    if (!pushSupported()) return true
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await fetch(`${BASE}/save-push-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe', endpoint }),
    })
    return true
  } catch {
    return false
  }
}

/** Guarda las preferencias local y (si hay suscripción) en el servidor. */
export async function updatePushPrefs(prefs: PushPrefs): Promise<void> {
  storePushPrefs(prefs)
  try {
    const endpoint = await getPushEndpoint()
    if (!endpoint) return
    await fetch(`${BASE}/save-push-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_prefs',
        endpoint,
        notify_new_client: prefs.new_client,
        notify_new_message: prefs.new_message,
      }),
    })
  } catch { /* la copia local ya quedó; el próximo subscribe la sincroniza */ }
}
