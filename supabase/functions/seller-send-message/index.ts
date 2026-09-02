import { createClient } from 'npm:@supabase/supabase-js@2'
// El aviso al comprador (push + WhatsApp de respaldo) vive en
// `_shared/notificar.ts`: también lo manda `pay360-webhook` con el acuse de
// pago, y dos copias de cómo se notifica es como se llega a que una avise y
// la otra no.
import { notifyBuyer } from '../_shared/notificar.ts'

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

  const { session_id, seller_name, seller_role, body, type, offer, interno, mentions, cobro_id } = await req.json() as {
    session_id: string
    seller_name: string
    seller_role?: string
    body: string
    type: 'text' | 'audio' | 'image' | 'offer' | 'cobro'
    offer?: { product_id?: string; nombre: string; precio: number; image?: string | null }
    /** COMENTARIO INTERNO: se guarda en el mismo hilo pero no es del comprador.
     *  Ver bloque §32 del esquema. */
    interno?: boolean
    /** `auth_user_id` de la gente etiquetada con `@`. */
    mentions?: string[]
    /** De qué COBRO es esta tarjeta de pago (bloque §37). Es un puntero: el
     *  monto, el concepto y si ya se pagó se leen de `cobros`, que es donde
     *  viven. Sin él la tarjeta es del saldo, como fue siempre. */
    cobro_id?: string | null
  }

  if (!session_id || !body) {
    return new Response('Missing fields', { status: 400, headers: corsHeaders })
  }

  // Un comentario interno vive en el MISMO hilo —esa es la gracia: se lee al
  // lado de lo que pasó, no en otra pantalla— y se separa por `visibility`.
  // Quién puede leerlo lo decide `get-session`, que para lo interno exige un
  // JWT de vendedor verificado: acá solo se marca.
  const esInterno = !!interno
  const etiquetados = Array.isArray(mentions)
    ? mentions.filter((x): x is string => typeof x === 'string').slice(0, 20)
    : []

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
      visibility: esInterno ? 'sellers' : 'all',
      mentions: etiquetados,
      cobro_id: cobro_id ?? null,
    })
    .select()
    .single()

  if (error || !msg) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Broadcast to buyer's realtime channel.
  //
  // ⚠️ El canal `order:<id>` es el del COMPRADOR: su chat está suscrito ahí y
  // pinta lo que llegue. Un comentario interno mandado por esa vía se le
  // aparecería en pantalla en vivo — una fuga peor que la de leerlo, porque no
  // hace falta ni buscarla.
  //
  // Así que de lo interno no viaja el cuerpo, solo el AVISO de que hay algo
  // nuevo. El panel lo oye y vuelve a pedir el hilo por `get-session`, que es
  // quien exige el JWT de vendedor. Un comprador que se suscriba al canal
  // —puede: el id del pedido es suyo— se entera de que el equipo comentó algo,
  // y nada más.
  await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      messages: [esInterno
        ? { topic: `order:${session_id}`, event: 'internal_update', payload: {} }
        : { topic: `order:${session_id}`, event: 'new_message', payload: msg }],
    }),
  })

  // Y no se le avisa al comprador de algo que no es para él: un comentario
  // interno no manda push ni WhatsApp. Sería el mismo error por la puerta de
  // atrás — el cuerpo del mensaje va en la notificación.
  if (esInterno) {
    return new Response(JSON.stringify(msg), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Push notification to buyer — try by buyer_id first (account-linked), fallback to session_id
  const { data: sessionRow } = await supabase
    .from('order_sessions')
    .select('token, buyer_id, buyer_name, product_name, seller_avatar, store_id')
    .eq('id', session_id)
    .single()

  // Brand notification icon + logo + slug (to build the buyer's order link)
  let storeLogo: string | null = null
  let storeIcon: string | null = null
  let storeSlug: string | null = null
  if (sessionRow?.store_id) {
    const { data: store } = await supabase.from('stores').select('logo_url, notif_icon_url, slug').eq('id', sessionRow.store_id).maybeSingle()
    storeLogo = store?.logo_url ?? null
    storeIcon = store?.notif_icon_url ?? store?.logo_url ?? null
    storeSlug = store?.slug ?? null
  }

  if (sessionRow) {
    const displayName = seller_name || 'Kross'
    const preview = type === 'text' ? body.slice(0, 80) : '🎵 Mensaje de audio'
    const buyerFirst = (sessionRow.buyer_name ?? 'Hola').split(' ')[0]
    const orderLink = storeSlug
      ? `https://${storeSlug}.krossclub.app/p/${sessionRow.token}`
      : `https://krossclub.app/p/${sessionRow.token}`
    // Push first; falls back to WhatsApp if the buyer has no reachable push.
    await notifyBuyer({
      buyerId: sessionRow.buyer_id,
      sessionId: session_id,
      storeId: sessionRow.store_id,
      waName: buyerFirst,
      waProduct: sessionRow.product_name ?? 'tu pedido',
      waLink: orderLink,
      title: `💬 ${displayName}`,
      body: preview,
      url: `/p/${sessionRow.token}`,
      tag: `msg-${session_id}`,
      type: 'message',
      icon: sessionRow.seller_avatar ?? storeIcon,
      badge: storeIcon,
    })
  }

  return new Response(JSON.stringify(msg), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
