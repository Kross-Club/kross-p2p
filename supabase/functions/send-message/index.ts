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

const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:kross@kross.pe'
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

async function trySendPush(sub: object, payload: object) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  try {
    await webpush.sendNotification(sub as any, JSON.stringify(payload))
  } catch { /* expired/invalid subscription — ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { token, type, body, media_url } = await req.json() as {
    token: string
    type: 'text' | 'audio' | 'image'
    body?: string
    media_url?: string
  }

  if (!token) return new Response('Missing token', { status: 400, headers: corsHeaders })

  // Look up session
  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, buyer_name, assigned_seller_id, status')
    .eq('token', token)
    .single()

  if (!session || session.status !== 'active') {
    return new Response('Not found', { status: 404, headers: corsHeaders })
  }

  // Insert message
  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: session.id,
      sender_role: 'buyer',
      sender_name: null,
      type: type || 'text',
      body: body ?? null,
      media_url: media_url ?? null,
    })
    .select()
    .single()

  if (error || !msg) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Broadcast to realtime channel
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [{ topic: `order:${session.id}`, event: 'new_message', payload: msg }],
    }),
  })

  // Push notification to assigned seller
  if (session.assigned_seller_id) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('seller_id', session.assigned_seller_id)
      .eq('role', 'seller')

    const buyerFirstName = (session.buyer_name ?? 'Cliente').split(' ')[0]
    const preview = type === 'text' ? (body ?? '').slice(0, 80) : '🎵 Mensaje de audio'

    await Promise.all((subs ?? []).map(row =>
      trySendPush(row.subscription, {
        title: `💬 ${buyerFirstName}`,
        body: preview,
        url: `/vendedor/chats`,
        tag: `msg-${session.id}`,
        type: 'message',
      })
    ))
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
