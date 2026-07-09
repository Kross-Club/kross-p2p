import { createClient } from 'npm:@supabase/supabase-js@2'
import { crypto } from 'jsr:@std/crypto'

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
    order_id?: string
    product_name: string
    product_price: number
    pack_name?: string
    buyer_name: string
    buyer_phone: string
    address?: string
  }

  const token = randomToken()
  const orderId = body.order_id ?? `ORD-${Date.now()}`

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({
      order_id: orderId,
      store_id: body.store_id,
      token,
      buyer_name: body.buyer_name,
      buyer_phone: body.buyer_phone,
      product_name: body.product_name,
      product_price: body.product_price,
      pack_name: body.pack_name ?? null,
      status: 'active',
      stage: 'nuevo',
    })
    .select('id, token')
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Insert welcome message from seller
  await supabase.from('chat_messages').insert({
    session_id: data.id,
    sender_role: 'seller',
    sender_name: 'Teddy',
    type: 'text',
    body: `¡Hola ${body.buyer_name.split(' ')[0]}! 🎉 Tu ${body.product_name} (S/${body.product_price}) llegará a tu puerta sin adelanto.\n\nEscríbeme cualquier duda o toca el ícono 📞 para llamarme directamente.`,
  })

  return new Response(
    JSON.stringify({ token: data.token, session_id: data.id }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
