import { createClient } from 'npm:@supabase/supabase-js@2'
import { anotarRespuesta, anotarSinRespuesta } from '../_shared/api-eventos.ts'

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

async function reverseGeocode(lat: number, lng: number, fallback: string): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { 'User-Agent': 'KrossApp/1.0 (delivery)' } }
    )
    if (r.ok) {
      const geo = await r.json()
      if (geo?.display_name) return geo.display_name
    } else {
      await anotarRespuesta({ proveedor: 'NOMINATIM', op: 'geocode.inverso' }, r)
    }
  } catch (e) {
    await anotarSinRespuesta({ proveedor: 'NOMINATIM', op: 'geocode.inverso' }, e)
  }
  return fallback
}

// Propagate a verified address to ALL of the buyer's active orders + their profile
async function applyToBuyer(buyerId: string, address: string, lat: number, lng: number) {
  await supabase.from('buyers').update({ address, address_lat: lat, address_lng: lng, address_verified: true }).eq('id', buyerId)
  const { data: orders } = await supabase
    .from('order_sessions')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('status', 'active')
  for (const o of orders ?? []) {
    await supabase.from('order_sessions')
      .update({ address, address_lat: lat, address_lng: lng, address_verified: true })
      .eq('id', o.id)
    await broadcast(o.id, 'address_update', { address, address_verified: true, address_lat: lat, address_lng: lng })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, buyer_id, address, lat, lng, by } = await req.json() as {
    session_id?: string
    buyer_id?: string
    address?: string
    lat?: number
    lng?: number
    by?: 'buyer' | 'seller'
  }

  const hasGps = typeof lat === 'number' && typeof lng === 'number'

  // ── Buyer-level GPS verification (e.g. from the Score section) ──────────────
  if (buyer_id && !session_id) {
    if (!hasGps) return new Response('Missing GPS', { status: 400, headers: corsHeaders })
    const finalAddress = await reverseGeocode(lat!, lng!, address ?? '')
    await applyToBuyer(buyer_id, finalAddress, lat!, lng!)
    return new Response(JSON.stringify({ ok: true, address: finalAddress, address_verified: true, address_lat: lat, address_lng: lng }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!session_id || !by) return new Response('Missing fields', { status: 400, headers: corsHeaders })

  // ── Buyer verifies from within an order chat → applies to ALL their orders ──
  if (by === 'buyer') {
    if (!hasGps) return new Response('Missing GPS', { status: 400, headers: corsHeaders })
    const { data: s } = await supabase.from('order_sessions').select('buyer_id').eq('id', session_id).single()
    const finalAddress = await reverseGeocode(lat!, lng!, address ?? '')

    if (s?.buyer_id) {
      await applyToBuyer(s.buyer_id, finalAddress, lat!, lng!)
    } else {
      await supabase.from('order_sessions').update({ address: finalAddress, address_lat: lat, address_lng: lng, address_verified: true }).eq('id', session_id)
      await broadcast(session_id, 'address_update', { address: finalAddress, address_verified: true, address_lat: lat, address_lng: lng })
    }
    await supabase.from('chat_messages').insert({
      session_id, sender_role: 'system', type: 'status_update', visibility: 'all',
      body: '📍 El comprador validó su dirección de entrega con GPS',
    })
    return new Response(JSON.stringify({ ok: true, address: finalAddress, address_verified: true, address_lat: lat, address_lng: lng }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Seller edits the text → invalidates GPS, buyer must re-verify ───────────
  const { data: session } = await supabase
    .from('order_sessions')
    .update({ address: address ?? '', address_verified: false, address_lat: null, address_lng: null })
    .eq('id', session_id)
    .select('id, address, address_verified, address_lat, address_lng')
    .single()
  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  await supabase.from('chat_messages').insert({
    session_id, sender_role: 'system', type: 'status_update', visibility: 'all',
    body: '📍 El vendedor corrigió la dirección — falta que el comprador la valide con GPS',
  })
  await broadcast(session_id, 'address_update', {
    address: session.address, address_verified: session.address_verified, address_lat: session.address_lat, address_lng: session.address_lng,
  })

  return new Response(JSON.stringify({ ok: true, address: session.address, address_verified: session.address_verified, address_lat: session.address_lat, address_lng: session.address_lng }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
