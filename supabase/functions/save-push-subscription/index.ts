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

  const { session_id, seller_id, sub_role, subscription } = await req.json() as {
    session_id?: string
    seller_id?: string
    sub_role: 'buyer' | 'seller'
    subscription: object
  }

  if (!subscription || !sub_role) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  // Delete existing for this key first, then insert fresh
  if (sub_role === 'buyer' && session_id) {
    await supabase.from('push_subscriptions').delete().match({ session_id, sub_role })
  } else if (sub_role === 'seller' && seller_id) {
    await supabase.from('push_subscriptions').delete().match({ seller_id, sub_role })
  }

  const { error } = await supabase.from('push_subscriptions').insert({
    session_id: session_id ?? null,
    seller_id: seller_id ?? null,
    sub_role,
    subscription,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response('ok', { headers: corsHeaders })
})
