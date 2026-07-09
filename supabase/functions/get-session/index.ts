import { createClient } from 'npm:@supabase/supabase-js@2'

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

  // Fetch session
  const { data: session, error } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, buyer_name, buyer_phone, buyer_id,
      product_name, product_price, pack_name,
      status, stage, assigned_seller_id,
      seller_name, seller_role,
      expires_at, created_at
    `)
    .eq('token', token)
    .single()

  if (error || !session) {
    return new Response('Not found', { status: 404, headers: corsHeaders })
  }

  // If seller_name not stored yet, try to resolve from sellers table
  let sellerName = session.seller_name
  let sellerRole = session.seller_role

  if (!sellerName && session.assigned_seller_id) {
    const { data: seller } = await supabase
      .from('sellers')
      .select('nombre, role_label')
      .eq('auth_user_id', session.assigned_seller_id)
      .maybeSingle()

    if (seller) {
      sellerName = seller.nombre
      sellerRole = seller.role_label
      // Cache it back to the session
      await supabase
        .from('order_sessions')
        .update({ seller_name: seller.nombre, seller_role: seller.role_label })
        .eq('id', session.id)
    }
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, session_id, sender_role, sender_name, type, body, media_url, created_at, read_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  return new Response(
    JSON.stringify({
      session: { ...session, seller_name: sellerName, seller_role: sellerRole },
      messages: messages ?? [],
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
