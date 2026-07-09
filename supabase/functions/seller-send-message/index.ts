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

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:kross@kross.pe'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

async function trySendPush(sub: object, payload: object) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)) } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, seller_name, body, type } = await req.json() as {
    session_id: string
    seller_name: string
    body: string
    type: 'text' | 'audio' | 'image'
  }

  if (!session_id || !body) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id,
      sender_role: 'seller',
      sender_name: seller_name || 'Teddy',
      type: type || 'text',
      body,
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

  // Push notification to buyer if they have a subscription
  const [{ data: subs }, { data: sessionRow }] = await Promise.all([
    supabase.from('push_subscriptions').select('subscription').eq('session_id', session_id).eq('sub_role', 'buyer'),
    supabase.from('order_sessions').select('token').eq('id', session_id).single(),
  ])

  if (subs && subs.length > 0 && sessionRow) {
    const preview = type === 'text' ? body.slice(0, 80) : '🎵 Mensaje de audio'
    await Promise.all(subs.map(row =>
      trySendPush(row.subscription, {
        title: `💬 ${seller_name || 'Teddy'} · Kross`,
        body: preview,
        url: `/p/${sessionRow.token}`,
        tag: `msg-${session_id}`,
        type: 'message',
      })
    ))
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
