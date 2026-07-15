// Centralized buyer notification with WhatsApp fallback.
//
// Strategy: try Web Push first (free). If we can't reach the buyer by push at
// all (no subscription / all sends failed), fall back to a WhatsApp message so
// they still get the alert on the channel everyone in Peru keeps open.
//
// SAFE BY DEFAULT: the WhatsApp path is a no-op ('skipped') until the brand has
// wa_enabled + wa_phone_number_id AND the global WHATSAPP_TOKEN secret exist.
// So deploying this changes nothing until you flip WhatsApp on per store.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  type: 'message' | 'call' | 'status'
  icon?: string | null
  badge?: string | null
}

async function trySendPush(sub: unknown, payload: PushPayload): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)); return true } catch { return false }
}

export type WhatsAppResult = 'sent' | 'skipped' | 'failed' | 'not_needed'

// WhatsApp Cloud API (Meta). Uses ONE global token (Kross's BSP account) + a
// per-store phone_number_id, so each brand sends from its own number. Requires a
// pre-approved template (default name 'pedido_novedad') with 2 body variables:
//   {{1}} = nombre de la marca, {{2}} = preview del mensaje.
async function sendWhatsApp(opts: {
  supabase: SupabaseClient
  storeId?: string | null
  to?: string | null
  preview: string
}): Promise<WhatsAppResult> {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token || !opts.storeId || !opts.to) return 'skipped'

  const { data: store } = await opts.supabase
    .from('stores')
    .select('wa_enabled, wa_phone_number_id, nombre')
    .eq('id', opts.storeId)
    .maybeSingle()
  if (!store?.wa_enabled || !store?.wa_phone_number_id) return 'skipped'

  // Normalize to international digits (Peru default if it looks local)
  let to = (opts.to || '').replace(/\D/g, '')
  if (to.length === 9) to = `51${to}`
  if (!to) return 'skipped'

  const template = Deno.env.get('WHATSAPP_TEMPLATE') ?? 'pedido_novedad'
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'es'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: (store.nombre ?? 'Tu tienda').slice(0, 60) },
              { type: 'text', text: opts.preview.slice(0, 200) },
            ],
          }],
        },
      }),
    })
    return res.ok ? 'sent' : 'failed'
  } catch { return 'failed' }
}

export interface NotifyBuyerInput {
  supabase: SupabaseClient
  buyerId?: string | null
  sessionId: string
  storeId?: string | null
  title: string
  body: string          // also used as the WhatsApp preview
  url: string
  tag: string
  type: 'message' | 'call' | 'status'
  icon?: string | null
  badge?: string | null
}

// Push-first, WhatsApp-fallback. Returns what actually happened (for logging).
export async function notifyBuyer(n: NotifyBuyerInput): Promise<{ push: number; whatsapp: WhatsAppResult }> {
  const { supabase } = n

  // 1. Collect push subscriptions — account-linked first, then session-based
  let subs: { subscription: unknown }[] = []
  if (n.buyerId) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('buyer_id', n.buyerId).eq('sub_role', 'buyer')
    subs = data ?? []
  }
  if (subs.length === 0) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('session_id', n.sessionId).eq('sub_role', 'buyer')
    subs = data ?? []
  }

  // 2. Web Push
  let pushOk = 0
  if (subs.length > 0) {
    const payload: PushPayload = {
      title: n.title, body: n.body, url: n.url, tag: n.tag, type: n.type,
      icon: n.icon ?? undefined, badge: n.badge ?? undefined,
    }
    const results = await Promise.all(subs.map(s => trySendPush(s.subscription, payload)))
    pushOk = results.filter(Boolean).length
  }

  // 3. WhatsApp fallback — only when push couldn't reach them at all
  let whatsapp: WhatsAppResult = 'not_needed'
  if (pushOk === 0) {
    let phone: string | null = null
    if (n.buyerId) {
      const { data: b } = await supabase.from('buyers').select('phone').eq('id', n.buyerId).maybeSingle()
      phone = b?.phone ?? null
    }
    if (!phone) {
      const { data: s } = await supabase.from('order_sessions').select('buyer_phone').eq('id', n.sessionId).maybeSingle()
      phone = s?.buyer_phone ?? null
    }
    whatsapp = await sendWhatsApp({ supabase, storeId: n.storeId, to: phone, preview: n.body })
  }

  // 4. Best-effort delivery log (never breaks the request)
  try {
    await supabase.from('notifications_log').insert({
      store_id: n.storeId ?? null,
      buyer_id: n.buyerId ?? null,
      session_id: n.sessionId,
      kind: n.type,
      push_count: pushOk,
      whatsapp,
      detail: n.body.slice(0, 120),
    })
  } catch { /* ignore */ }

  return { push: pushOk, whatsapp }
}
