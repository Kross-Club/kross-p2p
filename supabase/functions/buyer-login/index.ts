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

  // Normalize: strip non-digits, try with and without +51 prefix
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  const withPrefix = digits.startsWith('51') ? digits : `51${digits}`
  const withoutPrefix = digits.startsWith('51') ? digits.slice(2) : digits

  // 1. Try buyers table first (accounts created after migration)
  let buyer = null
  const { data: existingBuyer } = await supabase
    .from('buyers')
    .select('id, nombre, phone, score, puntos, address')
    .or(`phone.eq.${withPrefix},phone.eq.${withoutPrefix},phone.eq.${digits}`)
    .maybeSingle()

  buyer = existingBuyer

  // 2. Fallback: buyer exists in order_sessions but not in buyers table yet
  if (!buyer) {
    const { data: session } = await supabase
      .from('order_sessions')
      .select('buyer_name, buyer_phone')
      .or(`buyer_phone.eq.${withPrefix},buyer_phone.eq.${withoutPrefix},buyer_phone.eq.${digits}`)
      .maybeSingle()

    if (!session) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create buyer account from existing order data
    const { data: newBuyer } = await supabase
      .from('buyers')
      .upsert(
        { phone: session.buyer_phone, nombre: session.buyer_name },
        { onConflict: 'phone', ignoreDuplicates: false }
      )
      .select('id, nombre, phone, score, puntos, address')
      .single()

    buyer = newBuyer

    // Link existing sessions to this new buyer record
    if (newBuyer) {
      await supabase
        .from('order_sessions')
        .update({ buyer_id: newBuyer.id })
        .or(`buyer_phone.eq.${withPrefix},buyer_phone.eq.${withoutPrefix},buyer_phone.eq.${digits}`)
        .is('buyer_id', null)
    }
  }

  if (!buyer) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get all orders — by buyer_id OR by phone (catches sessions not yet linked)
  const { data: byId } = await supabase
    .from('order_sessions')
    .select('id, token, order_id, product_name, product_price, pack_name, stage, status, created_at, address')
    .eq('buyer_id', buyer.id)
    .order('created_at', { ascending: false })

  const { data: byPhone } = await supabase
    .from('order_sessions')
    .select('id, token, order_id, product_name, product_price, pack_name, stage, status, created_at, address')
    .or(`buyer_phone.eq.${withPrefix},buyer_phone.eq.${withoutPrefix},buyer_phone.eq.${digits}`)
    .is('buyer_id', null)
    .order('created_at', { ascending: false })

  const seen = new Set<string>()
  const sessions = [...(byId ?? []), ...(byPhone ?? [])].filter(s => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })

  return new Response(
    JSON.stringify({ buyer, sessions }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
