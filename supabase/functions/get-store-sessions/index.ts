import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-store-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const storeId = req.headers.get('x-store-id')
  if (!storeId) return new Response('Missing store id', { status: 400, headers: corsHeaders })

  const { data, error } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, token, buyer_name, buyer_phone,
      product_name, product_price, pack_name, status, stage, created_at,
      chat_messages ( id, sender_role, type, body, created_at, read_at )
    `)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
