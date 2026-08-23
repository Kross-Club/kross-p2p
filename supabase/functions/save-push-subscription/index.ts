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
    action?: 'subscribe' | 'unsubscribe' | 'set_prefs'
    session_id?: string
    seller_id?: string
    buyer_id?: string
    sub_role?: 'buyer' | 'seller'
    subscription?: { endpoint?: string }
    endpoint?: string
    notify_new_client?: boolean
    notify_new_message?: boolean
  }
  const action = body.action ?? 'subscribe'

  // ─── Baja de ESTE dispositivo (el usuario apagó las notificaciones) ─────────
  if (action === 'unsubscribe') {
    if (!body.endpoint) return new Response('Missing endpoint', { status: 400, headers: corsHeaders })
    await supabase.from('push_subscriptions').delete().eq('subscription->>endpoint', body.endpoint)
    return new Response('ok', { headers: corsHeaders })
  }

  // ─── Preferencias de ESTE dispositivo (qué avisos quiere y cuáles no) ───────
  if (action === 'set_prefs') {
    if (!body.endpoint) return new Response('Missing endpoint', { status: 400, headers: corsHeaders })
    const patch: Record<string, boolean> = {}
    if (typeof body.notify_new_client === 'boolean') patch.notify_new_client = body.notify_new_client
    if (typeof body.notify_new_message === 'boolean') patch.notify_new_message = body.notify_new_message
    if (Object.keys(patch).length === 0) return new Response('Missing prefs', { status: 400, headers: corsHeaders })
    await supabase.from('push_subscriptions').update(patch).eq('subscription->>endpoint', body.endpoint)
    return new Response('ok', { headers: corsHeaders })
  }

  // ─── Alta / refresh ─────────────────────────────────────────────────────────
  const { session_id, seller_id, buyer_id, sub_role, subscription } = body
  if (!subscription || !sub_role) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  // El dedupe es por ENDPOINT (= este navegador), nunca por dueño: un vendedor
  // con el celular y la laptop suscritos son DOS filas y ambas reciben el push.
  // Borrar "todas las del seller" al suscribir era lo que dejaba mudo al otro
  // dispositivo.
  const endpoint = subscription.endpoint
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('subscription->>endpoint', endpoint)
  }

  const { error } = await supabase.from('push_subscriptions').insert({
    session_id: session_id ?? null,
    seller_id: seller_id ?? null,
    buyer_id: buyer_id ?? null,
    sub_role,
    subscription,
    notify_new_client: body.notify_new_client !== false,
    notify_new_message: body.notify_new_message !== false,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response('ok', { headers: corsHeaders })
})
