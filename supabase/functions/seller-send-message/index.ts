import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Notifications: Web Push first, WhatsApp fallback ─────────────────────────
// (Inlined so it deploys from the Dashboard editor, which doesn't bundle shared
//  files.) WhatsApp is a no-op until the store has wa_enabled + wa_phone_number_id
//  and the global WHATSAPP_TOKEN secret exist.
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

async function trySendPush(sub: unknown, payload: object): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)); return true } catch { return false }
}

async function sendWhatsApp(storeId: string | null | undefined, to: string | null, var1: string, var2: string): Promise<string> {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token || !storeId || !to) return 'skipped'
  const { data: store } = await supabase.from('stores').select('wa_enabled, wa_phone_number_id, nombre').eq('id', storeId).maybeSingle()
  if (!store?.wa_enabled || !store?.wa_phone_number_id) return 'skipped'
  let num = (to || '').replace(/\D/g, '')
  if (num.length === 9) num = `51${num}`
  if (!num) return 'skipped'
  const template = Deno.env.get('WHATSAPP_TEMPLATE') ?? 'pedido_novedad'
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'es'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: num, type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [
          { type: 'text', text: (var1 || 'Hola').slice(0, 60) },   // {{1}} = nombre del comprador
          { type: 'text', text: (var2 || '').slice(0, 300) },      // {{2}} = link a su pedido
        ] }] },
      }),
    })
    return res.ok ? 'sent' : 'failed'
  } catch { return 'failed' }
}

interface NotifyInput {
  buyerId?: string | null; sessionId: string; storeId?: string | null
  title: string; body: string; url: string; tag: string
  type: 'message' | 'call' | 'status'; icon?: string | null; badge?: string | null
  waName?: string; waLink?: string   // WhatsApp template vars: {{1}} name, {{2}} link
}

async function notifyBuyer(n: NotifyInput): Promise<void> {
  let subs: { subscription: unknown }[] = []
  if (n.buyerId) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('buyer_id', n.buyerId).eq('sub_role', 'buyer')
    subs = data ?? []
  }
  if (subs.length === 0) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('session_id', n.sessionId).eq('sub_role', 'buyer')
    subs = data ?? []
  }

  let pushOk = 0
  if (subs.length > 0) {
    const payload = { title: n.title, body: n.body, url: n.url, tag: n.tag, type: n.type, icon: n.icon ?? undefined, badge: n.badge ?? undefined }
    const results = await Promise.all(subs.map(s => trySendPush(s.subscription, payload)))
    pushOk = results.filter(Boolean).length
  }

  let whatsapp = 'not_needed'
  if (pushOk === 0) {
    let phone: string | null = null
    if (n.buyerId) { const { data: b } = await supabase.from('buyers').select('phone').eq('id', n.buyerId).maybeSingle(); phone = b?.phone ?? null }
    if (!phone) { const { data: s } = await supabase.from('order_sessions').select('buyer_phone').eq('id', n.sessionId).maybeSingle(); phone = s?.buyer_phone ?? null }
    whatsapp = await sendWhatsApp(n.storeId, phone, n.waName ?? 'Hola', n.waLink ?? 'https://krossclub.app')
  }

  try {
    await supabase.from('notifications_log').insert({
      store_id: n.storeId ?? null, buyer_id: n.buyerId ?? null, session_id: n.sessionId,
      kind: n.type, push_count: pushOk, whatsapp, detail: n.body.slice(0, 120),
    })
  } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, seller_name, seller_role, body, type, offer } = await req.json() as {
    session_id: string
    seller_name: string
    seller_role?: string
    body: string
    type: 'text' | 'audio' | 'image' | 'offer'
    offer?: { product_id?: string; nombre: string; precio: number; image?: string | null }
  }

  if (!session_id || !body) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id,
      sender_role: 'seller',
      sender_name: seller_name || 'Kross',
      sender_role_label: seller_role ?? null,
      type: type || 'text',
      body,
      offer: offer ?? null,
    })
    .select()
    .single()

  if (error || !msg) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Broadcast to buyer's realtime channel
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [{ topic: `order:${session_id}`, event: 'new_message', payload: msg }],
    }),
  })

  // Push notification to buyer — try by buyer_id first (account-linked), fallback to session_id
  const { data: sessionRow } = await supabase
    .from('order_sessions')
    .select('token, buyer_id, buyer_name, seller_avatar, store_id')
    .eq('id', session_id)
    .single()

  // Brand logo (notification large icon) + slug (to build the buyer's order link)
  let storeLogo: string | null = null
  let storeSlug: string | null = null
  if (sessionRow?.store_id) {
    const { data: store } = await supabase.from('stores').select('logo_url, slug').eq('id', sessionRow.store_id).maybeSingle()
    storeLogo = store?.logo_url ?? null
    storeSlug = store?.slug ?? null
  }

  if (sessionRow) {
    const displayName = seller_name || 'Kross'
    const preview = type === 'text' ? body.slice(0, 80) : '🎵 Mensaje de audio'
    const buyerFirst = (sessionRow.buyer_name ?? 'Hola').split(' ')[0]
    const orderLink = storeSlug
      ? `https://${storeSlug}.krossclub.app/p/${sessionRow.token}`
      : `https://krossclub.app/p/${sessionRow.token}`
    // Push first; falls back to WhatsApp if the buyer has no reachable push.
    await notifyBuyer({
      buyerId: sessionRow.buyer_id,
      sessionId: session_id,
      storeId: sessionRow.store_id,
      waName: buyerFirst,
      waLink: orderLink,
      title: `💬 ${displayName}`,
      body: preview,
      url: `/p/${sessionRow.token}`,
      tag: `msg-${session_id}`,
      type: 'message',
      icon: sessionRow.seller_avatar ?? storeLogo,
      badge: storeLogo,
    })
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
