import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-kross-token, content-type',
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

  const token = req.headers.get('x-kross-token')
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, buyer_name, product_name, assigned_seller_id, status')
    .eq('token', token)
    .single()

  if (!session || session.status !== 'active') {
    return new Response('Not found', { status: 404, headers: corsHeaders })
  }

  const roomName = `order-${session.id}`
  const at = new AccessToken(
    Deno.env.get('LIVEKIT_API_KEY')!,
    Deno.env.get('LIVEKIT_API_SECRET')!,
    { identity: `buyer-${session.id}`, name: session.buyer_name ?? 'Comprador', ttl: '1h' }
  )
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })

  const livekitToken = await at.toJwt()

  await supabase.from('chat_messages').insert({
    session_id: session.id,
    sender_role: 'system',
    type: 'call_log',
    body: 'Comprador inició una llamada de voz',
  })

  // Notify seller via Realtime (in-app)
  const sellerChannel = session.store_id ? `seller:${session.store_id}:calls` : 'seller:calls'
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [{
        topic: sellerChannel,
        event: 'incoming_call',
        payload: {
          session_id: session.id,
          room_name: roomName,
          buyer_name: session.buyer_name,
          product_name: session.product_name,
        },
      }],
    }),
  })

  // Push notification to assigned seller (when app is in background)
  if (session.assigned_seller_id) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('seller_id', session.assigned_seller_id)
      .eq('sub_role', 'seller')

    const buyerFirstName = (session.buyer_name ?? 'Cliente').split(' ')[0]
    await Promise.all((subs ?? []).map(row =>
      trySendPush(row.subscription, {
        title: `📞 ${buyerFirstName} te llama`,
        body: session.product_name ? `Sobre: ${session.product_name}` : 'Llamada de voz entrante',
        url: `/vendedor/chats`,
        tag: `call-${session.id}`,
        type: 'call',
      })
    ))
  }

  return new Response(
    JSON.stringify({ livekit_url: Deno.env.get('LIVEKIT_URL')!, livekit_token: livekitToken, room_name: roomName }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
