import { createClient } from 'npm:@supabase/supabase-js@2'
import { notifyBuyer } from '../_shared/notify.ts'

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

  const { session_id, seller_name, seller_role, body, type, offer } = await req.json() as {
    session_id: string
    seller_name: string
    seller_role?: string
    body: string
    type: 'text' | 'audio' | 'image' | 'offer'
    offer?: { product_id?: string; nombre: string; precio: number; image?: string | null }
  }

  if (!session_id || !body) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id,
      sender_role: 'seller',
      sender_name: seller_name || 'Kross',
      sender_role_label: seller_role ?? null,
      type: type || 'text',
      body,
      offer: offer ?? null,
    })
    .select()
    .single()

  if (error || !msg) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Broadcast to buyer's realtime channel
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [{ topic: `order:${session_id}`, event: 'new_message', payload: msg }],
    }),
  })

  // Push notification to buyer — try by buyer_id first (account-linked), fallback to session_id
  const { data: sessionRow } = await supabase
    .from('order_sessions')
    .select('token, buyer_id, seller_avatar, store_id')
    .eq('id', session_id)
    .single()

  // Brand logo — used as the notification's large icon when the seller has no
  // photo, so buyers see THEIR brand (not Kross).
  let storeLogo: string | null = null
  if (sessionRow?.store_id) {
    const { data: store } = await supabase.from('stores').select('logo_url').eq('id', sessionRow.store_id).maybeSingle()
    storeLogo = store?.logo_url ?? null
  }

  if (sessionRow) {
    const displayName = seller_name || 'Kross'
    const preview = type === 'text' ? body.slice(0, 80) : '🎵 Mensaje de audio'
    // Push first; falls back to WhatsApp if the buyer has no reachable push.
    await notifyBuyer({
      supabase,
      buyerId: sessionRow.buyer_id,
      sessionId: session_id,
      storeId: sessionRow.store_id,
      title: `💬 ${displayName}`,
      body: preview,
      url: `/p/${sessionRow.token}`,
      tag: `msg-${session_id}`,
      type: 'message',
      icon: sessionRow.seller_avatar ?? storeLogo,
      badge: storeLogo,
    })
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
