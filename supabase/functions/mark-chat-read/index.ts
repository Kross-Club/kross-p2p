import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Marks the OTHER party's messages as read. Seller opens the chat → the buyer's
// messages become read (clears the unread badge). Runs with service role so RLS
// doesn't block the write.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, reader } = await req.json() as {
    session_id: string
    reader: 'buyer' | 'seller'
  }
  if (!session_id || !reader) return new Response('Missing fields', { status: 400, headers: corsHeaders })

  const otherRoles = reader === 'seller' ? ['buyer'] : ['seller', 'system']

  await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('session_id', session_id)
    .in('sender_role', otherRoles)
    .is('read_at', null)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
