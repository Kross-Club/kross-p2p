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

  const body = await req.json() as {
    document_type?: string
    document_number?: string
    phone?: string
    store_id?: string
    buyer_id?: string
  }

  if (!body.document_number && !body.phone && !body.buyer_id) {
    return new Response(JSON.stringify({ error: 'document_number, phone or buyer_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let buyer: Record<string, unknown> | null = null

  // 0. Direct by buyer_id (used to auto-login a buyer who opened an order chat
  //    from a link/push without having entered their DNI).
  if (body.buyer_id) {
    const { data } = await supabase
      .from('buyers')
      .select('id, nombre, phone, document_type, document_number, score, puntos, address')
      .eq('id', body.buyer_id)
      .maybeSingle()
    buyer = data
  }

  // 1. Try by document number (preferred — permanent identifier), scoped to the store
  if (!buyer && body.document_number) {
    let q = supabase
      .from('buyers')
      .select('id, nombre, phone, document_type, document_number, score, puntos, address')
      .eq('document_number', body.document_number)
    if (body.store_id) q = q.eq('store_id', body.store_id)
    const { data } = await q.maybeSingle()
    buyer = data
  }

  // 2. Fallback: search by phone in buyers table
  if (!buyer && body.phone) {
    const digits = body.phone.replace(/\D/g, '').replace(/^0+/, '')
    const withPrefix = digits.startsWith('51') ? digits : `51${digits}`
    const withoutPrefix = digits.startsWith('51') ? digits.slice(2) : digits

    const { data } = await supabase
      .from('buyers')
      .select('id, nombre, phone, document_type, document_number, score, puntos, address')
      .or(`phone.eq.${withPrefix},phone.eq.${withoutPrefix},phone.eq.${digits}`)
      .maybeSingle()
    buyer = data

    // 3. Fallback: buyer exists only in order_sessions (pre-migration)
    if (!buyer) {
      const { data: session } = await supabase
        .from('order_sessions')
        .select('buyer_name, buyer_phone, store_id')
        .or(`buyer_phone.eq.${withPrefix},buyer_phone.eq.${withoutPrefix},buyer_phone.eq.${digits}`)
        .maybeSingle()

      if (!session) {
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Auto-create buyer from order_sessions data. La unicidad de buyers es
      // POR TIENDA (bloque 18 del esquema): el onConflict global por 'phone'
      // dejó de tener índice que lo respalde, y además pisaba entre marcas.
      const { data: newBuyer } = await supabase
        .from('buyers')
        .upsert(
          { store_id: session.store_id ?? null, phone: session.buyer_phone, nombre: session.buyer_name },
          { onConflict: 'store_id,phone', ignoreDuplicates: false }
        )
        .select('id, nombre, phone, document_type, document_number, score, puntos, address')
        .single()

      buyer = newBuyer

      if (newBuyer) {
        await supabase
          .from('order_sessions')
          .update({ buyer_id: newBuyer.id })
          .or(`buyer_phone.eq.${withPrefix},buyer_phone.eq.${withoutPrefix},buyer_phone.eq.${digits}`)
          .is('buyer_id', null)
      }
    }
  }

  if (!buyer) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get all orders for this buyer
  const { data: byId } = await supabase
    .from('order_sessions')
    .select('id, token, order_id, product_name, product_price, pack_name, stage, status, created_at, address')
    .eq('buyer_id', buyer.id as string)
    .order('created_at', { ascending: false })

  const sessions = byId ?? []

  // Retención: marcar activación (primer login) y acreditar la recompensa de
  // bienvenida UNA sola vez (para clientes importados que se registran).
  let welcome: { points: number; msg: string | null } | null = null
  const { data: full } = await supabase
    .from('buyers').select('welcome_granted, activated_at, store_id, puntos').eq('id', buyer.id as string).maybeSingle()
  const patch: Record<string, unknown> = {}
  if (full && !full.activated_at) patch.activated_at = new Date().toISOString()
  if (full && !full.welcome_granted) {
    const sid = body.store_id || full.store_id
    const { data: store } = sid
      ? await supabase.from('stores').select('welcome_points, welcome_msg').eq('id', sid).maybeSingle()
      : { data: null }
    const pts = store?.welcome_points ?? 0
    if (pts > 0) {
      patch.welcome_granted = true
      patch.puntos = (full.puntos ?? 0) + pts
      ;(buyer as Record<string, unknown>).puntos = patch.puntos
      welcome = { points: pts, msg: store?.welcome_msg ?? null }
    }
  }
  if (Object.keys(patch).length > 0) await supabase.from('buyers').update(patch).eq('id', buyer.id as string)

  // Count unread seller messages per order (for the "sin leer" badge)
  if (sessions.length > 0) {
    const ids = sessions.map(s => s.id)
    const { data: unreadMsgs } = await supabase
      .from('chat_messages')
      .select('session_id')
      .in('session_id', ids)
      .in('sender_role', ['seller', 'system'])
      .is('read_at', null)

    const counts: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) counts[m.session_id] = (counts[m.session_id] ?? 0) + 1
    for (const s of sessions as any[]) s.unread_count = counts[s.id] ?? 0
  }

  return new Response(
    JSON.stringify({ buyer, sessions, welcome }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
