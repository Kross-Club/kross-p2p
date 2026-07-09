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

  const { phone } = await req.json() as { phone: string }

  if (!phone) {
    return new Response(JSON.stringify({ error: 'phone required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Normalize: remove spaces, dashes; ensure starts with 51
  const normalized = phone.replace(/\D/g, '').replace(/^0+/, '')
  const withPrefix = normalized.startsWith('51') ? normalized : `51${normalized}`

  // Look up buyer by phone (try both with and without country code)
  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, nombre, phone, score, puntos, address')
    .or(`phone.eq.${withPrefix},phone.eq.${normalized}`)
    .maybeSingle()

  if (!buyer) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get all orders for this buyer
  const { data: sessions } = await supabase
    .from('order_sessions')
    .select('id, token, order_id, product_name, product_price, pack_name, stage, status, created_at, store_id, address')
    .eq('buyer_id', buyer.id)
    .order('created_at', { ascending: false })

  return new Response(
    JSON.stringify({ buyer, sessions: sessions ?? [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
