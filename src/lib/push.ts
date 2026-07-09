const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// VAPID public key — matches VAPID_PUBLIC_KEY in Supabase edge function secrets
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BNlgNwxGrQAL6HpxmipTikb7UDu0oj5vcqFURdW7tMhYuVLA-aX3OCZ1yyPGYjetYnRhsbm4kNldMsJqVVEeiSs'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function subscribePush(opts: {
  sessionId?: string
  sellerId?: string
  role: 'buyer' | 'seller'
}): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

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

    await fetch(`${BASE}/save-push-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: opts.sessionId ?? null,
        seller_id: opts.sellerId ?? null,
        role: opts.role,
        subscription: sub.toJSON(),
      }),
    })

    return true
  } catch {
    return false
  }
}
