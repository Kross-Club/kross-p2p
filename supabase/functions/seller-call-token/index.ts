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

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

async function trySendPush(sub: object, payload: object) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)) } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, seller_name } = await req.json() as { session_id: string; seller_name?: string }
  if (!session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, status, token, buyer_id, store_id, product_name, seller_name, seller_role, seller_avatar')
    .eq('id', session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  const displayName = seller_name || session.seller_name || 'Kross'
  const sellerAvatar: string | null = session.seller_avatar ?? null

  // Brand logo as the large-icon fallback so the buyer sees THEIR brand, not Kross
  let storeLogo: string | null = null
  if (session.store_id) {
    const { data: store } = await supabase.from('stores').select('logo_url').eq('id', session.store_id).maybeSingle()
    storeLogo = store?.logo_url ?? null
  }

  const roomName = `order-${session.id}`
  const at = new AccessToken(
    Deno.env.get('LIVEKIT_API_KEY')!,
    Deno.env.get('LIVEKIT_API_SECRET')!,
    { identity: `seller-${session.id}`, name: `${displayName} · Kross`, ttl: '1h' }
  )
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })

  // Push a CALL notification to the buyer so it rings even in background/closed
  let subs: { subscription: object }[] = []
  if (session.buyer_id) {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('buyer_id', session.buyer_id)
      .eq('sub_role', 'buyer')
    subs = data ?? []
  }
  if (subs.length === 0) {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('session_id', session.id)
      .eq('sub_role', 'buyer')
    subs = data ?? []
  }

  await Promise.all(subs.map(row =>
    trySendPush(row.subscription, {
      title: '📞 Llamada entrante',
      body: `${displayName} te está llamando`,
      url: `/p/${session.token}`,
      tag: `call-${session.id}`,
      type: 'call',
      icon: sellerAvatar ?? storeLogo ?? undefined,
      badge: storeLogo ?? undefined,
    })
  ))

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
