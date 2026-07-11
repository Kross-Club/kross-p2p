import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

async function broadcast(sessionId: string, event: string, payload: unknown) {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({ messages: [{ topic: `order:${sessionId}`, event, payload }] }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, address, lat, lng, by } = await req.json() as {
    session_id: string
    address: string
    lat?: number
    lng?: number
    by: 'buyer' | 'seller'
  }
  if (!session_id || !address || !by) return new Response('Missing fields', { status: 400, headers: corsHeaders })

  const hasGps = typeof lat === 'number' && typeof lng === 'number'
  const update: Record<string, unknown> = { address }

  if (by === 'buyer') {
    update.address_verified = hasGps
    if (hasGps) {
      update.address_lat = lat
      update.address_lng = lng
      // Correct the text to the real map-ordered address (reverse geocoding)
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`,
          { headers: { 'User-Agent': 'KrossApp/1.0 (delivery)' } }
        )
        if (r.ok) {
          const geo = await r.json()
          if (geo?.display_name) {
            // Prefer the mapped street address; keep the buyer's note as reference
            // only if there already was one.
            const ref = (address ?? '').trim()
            update.address = ref ? `${geo.display_name} — Ref: ${ref}` : geo.display_name
          }
        }
      } catch { /* keep typed address if geocoding fails */ }
    }
  } else {
    // A seller edit invalidates the GPS — the buyer must confirm it again.
    update.address_verified = false
    update.address_lat = null
    update.address_lng = null
  }

  const { data: session } = await supabase
    .from('order_sessions')
    .update(update)
    .eq('id', session_id)
    .select('id, buyer_id, address, address_verified, address_lat, address_lng')
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  if (by === 'buyer' && session.buyer_id) {
    await supabase.from('buyers').update({ address: session.address }).eq('id', session.buyer_id)
  }

  await supabase.from('chat_messages').insert({
    session_id,
    sender_role: 'system',
    type: 'status_update',
    visibility: 'all',
    body: by === 'buyer'
      ? '📍 El comprador validó su dirección de entrega con GPS'
      : '📍 El vendedor corrigió la dirección — falta que el comprador la valide con GPS',
  })
  await broadcast(session_id, 'address_update', {
    address: session.address,
    address_verified: session.address_verified,
    address_lat: session.address_lat,
    address_lng: session.address_lng,
  })

  return new Response(JSON.stringify({
    ok: true,
    address: session.address,
    address_verified: session.address_verified,
    address_lat: session.address_lat,
    address_lng: session.address_lng,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
