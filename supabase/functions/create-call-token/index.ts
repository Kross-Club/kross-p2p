import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-kross-token, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = req.headers.get('x-kross-token')
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, buyer_name, product_name, status')
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

  // Notify seller of this specific store
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

  return new Response(
    JSON.stringify({ livekit_url: Deno.env.get('LIVEKIT_URL')!, livekit_token: livekitToken, room_name: roomName }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
