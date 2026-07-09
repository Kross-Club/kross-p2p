import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function randomToken() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    store_id: string
    product_name: string
    product_price: number
    pack_name?: string
    buyer_name: string
    buyer_phone: string
    address?: string
    seller_ids?: string[]
  }

  // Upsert buyer account by phone
  const { data: buyer, error: buyerErr } = await supabase
    .from('buyers')
    .upsert(
      { phone: body.buyer_phone, nombre: body.buyer_name, address: body.address ?? null },
      { onConflict: 'phone', ignoreDuplicates: false }
    )
    .select('id, score, puntos')
    .single()

  if (buyerErr || !buyer) {
    return new Response(JSON.stringify({ error: buyerErr?.message ?? 'buyer upsert failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Round-robin assignment among sellers
  let assignedSellerId: string | null = null
  if (body.seller_ids && body.seller_ids.length > 0) {
    const counts: Record<string, number> = {}
    for (const sid of body.seller_ids) counts[sid] = 0

    const { data: existing } = await supabase
      .from('order_sessions')
      .select('assigned_seller_id')
      .eq('store_id', body.store_id)
      .eq('status', 'active')
      .in('assigned_seller_id', body.seller_ids)

    for (const row of existing ?? []) {
      if (row.assigned_seller_id) counts[row.assigned_seller_id] = (counts[row.assigned_seller_id] ?? 0) + 1
    }

    assignedSellerId = body.seller_ids.reduce((a, b) => counts[a] <= counts[b] ? a : b)
  }

  const token = randomToken()
  const orderId = `ORD-${Date.now()}`

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({
      order_id: orderId,
      store_id: body.store_id,
      token,
      buyer_id: buyer.id,
      buyer_name: body.buyer_name,
      buyer_phone: body.buyer_phone,
      address: body.address ?? null,
      product_name: body.product_name,
      product_price: body.product_price,
      pack_name: body.pack_name ?? null,
      status: 'active',
      stage: 'nuevo',
      assigned_seller_id: assignedSellerId,
    })
    .select('id, token')
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await supabase.from('chat_messages').insert({
    session_id: data.id,
    sender_role: 'seller',
    sender_name: 'Teddy',
    type: 'text',
    body: `¡Hola ${body.buyer_name.split(' ')[0]}! 🎉 Tu ${body.product_name} (S/${body.product_price}) llegará a tu puerta sin adelanto.\n\nEscríbeme cualquier duda o toca el ícono 📞 para llamarme directamente.`,
  })

  return new Response(
    JSON.stringify({
      token: data.token,
      session_id: data.id,
      buyer_id: buyer.id,
      score: buyer.score,
      puntos: buyer.puntos,
      assigned_seller_id: assignedSellerId,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
