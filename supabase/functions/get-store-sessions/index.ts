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
  const includeCancelled = req.headers.get('x-include-cancelled') === '1'
  if (!storeId) return new Response('Missing store id', { status: 400, headers: corsHeaders })

  // El bloque geográfico y de pago (dispatch_type … tracking_phase) alimenta el
  // mapa de pedidos en vivo: de dónde sale el paquete, a dónde va, cómo va el
  // dinero y qué reporta el courier. No agrega datos personales — el nombre y
  // el teléfono del comprador ya viajaban en esta misma respuesta.
  let query = supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, token, buyer_id, buyer_name, buyer_phone,
      product_id, product_name, product_price, pack_name, status, stage, nota,
      dispatch_type, agency_name, agency_branch_id, delivery_reference,
      address, address_lat, address_lng,
      advance_amount, payment_verification,
      tracking_courier, tracking_phase,
      assigned_seller_id, involved_seller_ids, writer_seller_ids, seller_name, seller_role, created_at,
      chat_messages ( id, sender_role, type, body, created_at, read_at )
    `)
    .in('status', includeCancelled ? ['active', 'cancelado'] : ['active'])
    .order('created_at', { ascending: false })
    .limit(80)

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
