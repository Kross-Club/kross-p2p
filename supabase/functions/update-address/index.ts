import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

async function broadcast(sessionId: string, event: string, payload: unknown) {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({ messages: [{ topic: `order:${sessionId}`, event, payload }] }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, address, lat, lng, by } = await req.json() as {
    session_id: string
    address: string
    lat?: number
    lng?: number
    by: 'buyer' | 'seller'
  }
  if (!session_id || !address || !by) return new Response('Missing fields', { status: 400, headers: corsHeaders })

  const hasGps = typeof lat === 'number' && typeof lng === 'number'

  const update: Record<string, unknown> = { address }
  if (by === 'buyer') {
    // A buyer edit is only "verified" when confirmed with GPS.
    update.address_verified = hasGps
    if (hasGps) { update.address_lat = lat; update.address_lng = lng }
  }
  // A seller edit keeps whatever GPS verification existed (they can't self-verify).

  const { data: session } = await supabase
    .from('order_sessions')
    .update(update)
    .eq('id', session_id)
    .select('id, buyer_id, address, address_verified')
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  // Keep the buyer's account default address in sync when the buyer edits
  if (by === 'buyer' && session.buyer_id) {
    await supabase.from('buyers').update({ address }).eq('id', session.buyer_id)
  }

  // Log it in the chat + notify both sides
  await supabase.from('chat_messages').insert({
    session_id,
    sender_role: 'system',
    type: 'status_update',
    body: by === 'buyer'
      ? `📍 El comprador actualizó la dirección de entrega${hasGps ? ' (validada por GPS)' : ''}`
      : '📍 Se actualizó la dirección de entrega',
  })
  await broadcast(session_id, 'address_update', { address: session.address, address_verified: session.address_verified })

  return new Response(JSON.stringify({ ok: true, address: session.address, address_verified: session.address_verified }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
