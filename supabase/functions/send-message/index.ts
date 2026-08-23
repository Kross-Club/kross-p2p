import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

async function trySendPush(sub: object, payload: object) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  try {
    await webpush.sendNotification(sub as any, JSON.stringify(payload))
  } catch { /* expired/invalid subscription — ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { token, type, body, media_url } = await req.json() as {
    token: string
    type: 'text' | 'audio' | 'image'
    body?: string
    media_url?: string
  }

  if (!token) return new Response('Missing token', { status: 400, headers: corsHeaders })

  // Look up session
  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, buyer_name, assigned_seller_id, status')
    .eq('token', token)
    .single()

  if (!session || session.status !== 'active') {
    return new Response('Not found', { status: 404, headers: corsHeaders })
  }

  // Insert message
  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: session.id,
      sender_role: 'buyer',
      sender_name: null,
      type: type || 'text',
      body: body ?? null,
      media_url: media_url ?? null,
    })
    .select()
    .single()

  if (error || !msg) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Broadcast to realtime channel
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [{ topic: `order:${session.id}`, event: 'new_message', payload: msg }],
    }),
  })

  // Push de nuevo mensaje: al asignado Y a los admins de la tienda (el admin ve
  // todo — en el modelo por defecto el equipo es admin + logística y no hay un
  // vendedor por chat). Cada dispositivo puede silenciar este aviso desde el
  // panel: el filtro es la columna notify_new_message de SU suscripción.
  {
    const recipientIds = new Set<string>()
    if (session.assigned_seller_id) recipientIds.add(session.assigned_seller_id)
    if (session.store_id) {
      const { data: admins } = await supabase
        .from('sellers')
        .select('auth_user_id')
        .eq('store_id', session.store_id)
        .eq('is_admin', true)
        .eq('active', true)
        .not('auth_user_id', 'is', null)
      for (const a of admins ?? []) recipientIds.add(a.auth_user_id as string)
    }

    if (recipientIds.size > 0) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('subscription, notify_new_message')
        .in('seller_id', [...recipientIds])
        .eq('sub_role', 'seller')

      let storeLogo: string | null = null
      if (session.store_id) {
        const { data: store } = await supabase.from('stores').select('logo_url').eq('id', session.store_id).maybeSingle()
        storeLogo = store?.logo_url ?? null
      }

      const buyerFirstName = (session.buyer_name ?? 'Cliente').split(' ')[0]
      const preview = type === 'text' ? (body ?? '').slice(0, 80) : '🎵 Mensaje de audio'

      await Promise.all((subs ?? [])
        .filter(row => row.notify_new_message !== false)
        .map(row =>
          trySendPush(row.subscription, {
            title: `💬 ${buyerFirstName}`,
            body: preview,
            url: `/vendedor/chats`,
            tag: `msg-${session.id}`,
            type: 'message',
            icon: storeLogo ?? undefined,
            badge: storeLogo ?? undefined,
          })
        ))
    }
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
