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
    product_id?: string
    product_name: string
    product_price: number
    pack_name?: string
    buyer_name: string
    buyer_phone: string
    document_type?: string
    document_number?: string
    address?: string
    seller_ids?: string[]
  }

  // Upsert buyer account — document_number as unique key if provided, fallback to phone
  let buyer: { id: string; score: number; puntos: number; address: string | null; address_lat: number | null; address_lng: number | null; address_verified: boolean } | null = null
  let buyerErr: { message: string } | null = null

  if (body.document_number) {
    const { data, error } = await supabase
      .from('buyers')
      .upsert(
        {
          document_type: body.document_type ?? 'DNI',
          document_number: body.document_number,
          phone: body.buyer_phone,
          nombre: body.buyer_name,
          address: body.address ?? null,
        },
        { onConflict: 'document_number', ignoreDuplicates: false }
      )
      .select('id, score, puntos, address, address_lat, address_lng, address_verified')
      .single()
    buyer = data
    buyerErr = error
  } else {
    // Fallback: upsert by phone (old registrations without DNI)
    const { data, error } = await supabase
      .from('buyers')
      .upsert(
        { phone: body.buyer_phone, nombre: body.buyer_name, address: body.address ?? null },
        { onConflict: 'phone', ignoreDuplicates: false }
      )
      .select('id, score, puntos, address, address_lat, address_lng, address_verified')
      .single()
    buyer = data
    buyerErr = error
  }

  if (buyerErr || !buyer) {
    return new Response(JSON.stringify({ error: buyerErr?.message ?? 'buyer upsert failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Round-robin assignment among REAL sellers from the sellers table.
  // We resolve sellers server-side (by auth_user_id) so the assignment always
  // matches a real Supabase user — the frontend's local seller_ids are ignored.
  let assignedSellerId: string | null = null
  let assignedSellerName: string | null = null
  let assignedSellerRole: string | null = null
  let assignedSellerAvatar: string | null = null
  let assignedSellerStore: string | null = null

  // New orders always go to a SALES person (role Ventas) — never to Despacho,
  // Motorizado or Admin. We prefer sellers scoped to this store; if that store
  // has no sales rep, fall back to any Ventas rep across stores.
  type Seller = { auth_user_id: string; nombre: string; role_label: string; avatar_url: string | null; store_id?: string }
  const isVentas = (s: any) => (s.role_label ?? '').toLowerCase().includes('venta')
  // A seller off-shift (available=false) doesn't receive new orders. Missing
  // column (undefined) is treated as available so it works before the migration.
  const isAvailable = (s: any) => s.available !== false

  let sellerPool: Seller[] = []
  {
    const { data: scoped } = await supabase
      .from('sellers')
      .select('auth_user_id, nombre, role_label, avatar_url, is_admin, available, store_id')
      .eq('store_id', body.store_id)
      .eq('active', true)
      .not('auth_user_id', 'is', null)
    sellerPool = (scoped ?? []).filter((s: any) => !s.is_admin && isVentas(s) && isAvailable(s))

    if (sellerPool.length === 0) {
      const { data: all } = await supabase
        .from('sellers')
        .select('auth_user_id, nombre, role_label, avatar_url, is_admin, available, store_id')
        .eq('active', true)
        .not('auth_user_id', 'is', null)
      sellerPool = (all ?? []).filter((s: any) => !s.is_admin && isVentas(s) && isAvailable(s))
    }
  }

  if (sellerPool.length > 0) {
    const ids = sellerPool.map(s => s.auth_user_id)

    // CONTINUITY FIRST: if this buyer already has active orders with an available
    // Ventas rep, keep them with the same person.
    let chosen: Seller | undefined
    const { data: buyerOrders } = await supabase
      .from('order_sessions')
      .select('assigned_seller_id, created_at')
      .eq('buyer_id', buyer.id as string)
      .eq('status', 'active')
      .in('assigned_seller_id', ids)
      .order('created_at', { ascending: false })

    const stickyId = buyerOrders?.[0]?.assigned_seller_id
    if (stickyId) chosen = sellerPool.find(s => s.auth_user_id === stickyId)

    // Otherwise least-loaded among available Ventas reps
    if (!chosen) {
      const counts: Record<string, number> = {}
      for (const id of ids) counts[id] = 0
      const { data: existing } = await supabase
        .from('order_sessions')
        .select('assigned_seller_id')
        .eq('status', 'active')
        .in('assigned_seller_id', ids)
      for (const row of existing ?? []) {
        if (row.assigned_seller_id) counts[row.assigned_seller_id] = (counts[row.assigned_seller_id] ?? 0) + 1
      }
      const leastId = ids.reduce((a, b) => counts[a] <= counts[b] ? a : b)
      chosen = sellerPool.find(s => s.auth_user_id === leastId)
    }

    if (chosen) {
      assignedSellerId = chosen.auth_user_id
      assignedSellerName = chosen.nombre
      assignedSellerRole = chosen.role_label
      assignedSellerAvatar = chosen.avatar_url
      assignedSellerStore = chosen.store_id ?? null
    }
  }

  const token = randomToken()
  const orderId = `ORD-${Date.now()}`

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({
      order_id: orderId,
      // Align the order to the assigned seller's store so it shows in the team's lists
      store_id: assignedSellerStore ?? body.store_id,
      token,
      buyer_id: buyer.id,
      buyer_name: body.buyer_name,
      buyer_phone: body.buyer_phone,
      // Inherit the buyer's already-verified address (so no need to re-verify)
      address: buyer.address ?? body.address ?? null,
      address_lat: buyer.address_lat ?? null,
      address_lng: buyer.address_lng ?? null,
      address_verified: buyer.address_verified ?? false,
      seller_name: assignedSellerName,
      seller_role: assignedSellerRole,
      seller_avatar: assignedSellerAvatar,
      product_id: body.product_id ?? null,
      product_name: body.product_name,
      product_price: body.product_price,
      pack_name: body.pack_name ?? null,
      items: [{ product_id: body.product_id ?? null, nombre: body.product_name, precio: body.product_price, pack_name: body.pack_name ?? null }],
      status: 'active',
      stage: 'nuevo',
      assigned_seller_id: assignedSellerId,
      involved_seller_ids: assignedSellerId ? [assignedSellerId] : [],
      writer_seller_ids: assignedSellerId ? [assignedSellerId] : [],
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
    sender_name: assignedSellerName ?? 'Kross',
    sender_role_label: assignedSellerRole ?? 'Ventas',
    type: 'text',
    body: `¡Hola${body.buyer_name ? ' ' + body.buyer_name.split(' ')[0] : ''}! 🎉 Tu ${body.product_name} (S/${body.product_price}) llegará a tu puerta sin adelanto.\n\nEscríbeme por aquí cualquier duda y te ayudo al toque. 😊`,
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
