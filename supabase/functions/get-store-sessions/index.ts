import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-store-id, x-seller-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const storeId = req.headers.get('x-store-id')
  const sellerId = req.headers.get('x-seller-id')
  if (!storeId) return new Response('Missing store id', { status: 400, headers: corsHeaders })

  let query = supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, token, buyer_id, buyer_name, buyer_phone,
      product_name, product_price, pack_name, status, stage,
      assigned_seller_id, involved_seller_ids, writer_seller_ids, seller_name, seller_role, created_at,
      chat_messages ( id, sender_role, type, body, created_at, read_at )
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  // A specific agent → every order they're involved in, regardless of the
  // store_id label (orders and sellers can carry different store ids).
  // The admin (no seller filter) → all active orders in their store.
  if (sellerId) {
    query = query.contains('involved_seller_ids', [sellerId])
  } else {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
