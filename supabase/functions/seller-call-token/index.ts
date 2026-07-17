import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Notifications: Web Push first, WhatsApp fallback (inlined; no shared import
//    so it deploys from the Dashboard editor). WhatsApp is a no-op until the store
//    has wa_enabled + wa_phone_number_id and the WHATSAPP_TOKEN secret exist. ──
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

async function trySendPush(sub: unknown, payload: object): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)); return true } catch { return false }
}

async function sendWhatsApp(storeId: string | null | undefined, to: string | null, var1: string, var2: string, var3: string): Promise<{ result: string; error?: string }> {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token || !storeId || !to) return { result: 'skipped' }
  const { data: store } = await supabase.from('stores').select('wa_enabled, wa_phone_number_id, nombre').eq('id', storeId).maybeSingle()
  if (!store?.wa_enabled || !store?.wa_phone_number_id) return { result: 'skipped' }
  let num = (to || '').replace(/\D/g, '')
  if (num.length === 9) num = `51${num}`
  if (!num) return { result: 'skipped' }
  const template = Deno.env.get('WHATSAPP_TEMPLATE') ?? 'pedido_novedad'
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'es'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: num, type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [
          { type: 'text', text: (var1 || 'Hola').slice(0, 60) },       // {{1}} = nombre del comprador
          { type: 'text', text: (var2 || 'tu pedido').slice(0, 80) },  // {{2}} = producto
          { type: 'text', text: (var3 || '').slice(0, 300) },          // {{3}} = link a su pedido
        ] }] },
      }),
    })
    if (res.ok) return { result: 'sent' }
    const errTxt = await res.text().catch(() => '')
    return { result: 'failed', error: `[${template}/${lang}→${num}] ${errTxt}`.slice(0, 280) }
  } catch (e) { return { result: 'failed', error: String(e).slice(0, 200) } }
}

interface NotifyInput {
  buyerId?: string | null; sessionId: string; storeId?: string | null
  title: string; body: string; url: string; tag: string
  type: 'message' | 'call' | 'status'; icon?: string | null; badge?: string | null
  waName?: string; waProduct?: string; waLink?: string
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
  let waError: string | undefined
  if (pushOk === 0) {
    let phone: string | null = null
    if (n.buyerId) { const { data: b } = await supabase.from('buyers').select('phone').eq('id', n.buyerId).maybeSingle(); phone = b?.phone ?? null }
    if (!phone) { const { data: s } = await supabase.from('order_sessions').select('buyer_phone').eq('id', n.sessionId).maybeSingle(); phone = s?.buyer_phone ?? null }
    const r = await sendWhatsApp(n.storeId, phone, n.waName ?? 'Hola', n.waProduct ?? 'tu pedido', n.waLink ?? 'https://krossclub.app')
    whatsapp = r.result
    waError = r.error
  }

  try {
    await supabase.from('notifications_log').insert({
      store_id: n.storeId ?? null, buyer_id: n.buyerId ?? null, session_id: n.sessionId,
      kind: n.type, push_count: pushOk, whatsapp, detail: waError ?? n.body.slice(0, 120),
    })
  } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, seller_name } = await req.json() as { session_id: string; seller_name?: string }
  if (!session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, status, token, buyer_id, buyer_name, store_id, product_name, seller_name, seller_role, seller_avatar')
    .eq('id', session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  const displayName = seller_name || session.seller_name || 'Kross'
  const sellerAvatar: string | null = session.seller_avatar ?? null

  // Brand logo (large icon) + slug (buyer order link for the WhatsApp fallback)
  let storeLogo: string | null = null
  let storeSlug: string | null = null
  if (session.store_id) {
    const { data: store } = await supabase.from('stores').select('logo_url, slug').eq('id', session.store_id).maybeSingle()
    storeLogo = store?.logo_url ?? null
    storeSlug = store?.slug ?? null
  }
  const buyerFirst = (session.buyer_name ?? 'Hola').split(' ')[0]
  const orderLink = storeSlug
    ? `https://${storeSlug}.krossclub.app/p/${session.token}`
    : `https://krossclub.app/p/${session.token}`

  const roomName = `order-${session.id}`
  const at = new AccessToken(
    Deno.env.get('LIVEKIT_API_KEY')!,
    Deno.env.get('LIVEKIT_API_SECRET')!,
    { identity: `seller-${session.id}`, name: `${displayName} · Kross`, ttl: '1h' }
  )
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
  // Recording is driven entirely by the livekit-webhook (starts when both parties
  // connect, stops when one hangs up) so we only record the real call duration.

  // Ring the buyer even in background/closed. Push first; WhatsApp fallback if
  // they have no reachable push (e.g. never installed the app).
  await notifyBuyer({
    buyerId: session.buyer_id,
    sessionId: session.id,
    storeId: session.store_id,
    waName: buyerFirst,
    waProduct: session.product_name ?? 'tu pedido',
    waLink: orderLink,
    title: '📞 Llamada entrante',
    body: `${displayName} te está llamando`,
    url: `/p/${session.token}`,
    tag: `call-${session.id}`,
    type: 'call',
    icon: sellerAvatar ?? storeLogo,
    badge: storeLogo,
  })

  // Broadcast the incoming call to a buyer-wide channel so it rings no matter
  // where the buyer is in the app (not only inside that order's chat).
  if (session.buyer_id) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({
        messages: [{
          topic: `buyer:${session.buyer_id}:calls`,
          event: 'incoming_call',
          payload: {
            session_id: session.id,
            token: session.token,
            seller_name: displayName,
            seller_role: session.seller_role,
            seller_avatar: sellerAvatar,
            product_name: session.product_name,
          },
        }],
      }),
    })
  }

  return new Response(
    JSON.stringify({
      livekit_url: Deno.env.get('LIVEKIT_URL')!,
      livekit_token: await at.toJwt(),
      room_name: roomName,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
