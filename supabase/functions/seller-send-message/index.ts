import { createClient } from 'npm:@supabase/supabase-js@2'

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

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
