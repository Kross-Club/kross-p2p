import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id } = await req.json() as { session_id: string }
  if (!session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, status')
    .eq('id', session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  const roomName = `order-${session.id}`
  const at = new AccessToken(
    Deno.env.get('LIVEKIT_API_KEY')!,
    Deno.env.get('LIVEKIT_API_SECRET')!,
    { identity: `seller-${session.id}`, name: 'Teddy · Kross', ttl: '1h' }
  )
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })

  return new Response(
    JSON.stringify({
      livekit_url: Deno.env.get('LIVEKIT_URL')!,
      livekit_token: await at.toJwt(),
      room_name: roomName,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
