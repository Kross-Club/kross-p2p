import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-kross-token, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = req.headers.get('x-kross-token')
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  // Read viewer from the URL query (avoids adding a custom CORS header)
  const viewerIsSeller = new URL(req.url).searchParams.get('viewer') === 'seller'
    || req.headers.get('x-viewer-role') === 'seller'

  // Fetch session
  const { data: session, error } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, buyer_name, buyer_phone, buyer_id,
      product_id, product_name, product_price, pack_name, items,
      status, stage, assigned_seller_id,
      seller_name, seller_role, seller_avatar,
      involved_seller_ids, writer_seller_ids, invited_seller_ids, invited_by,
      address, address_verified, address_lat, address_lng, nota,
      dispatch_type, agency_name, agency_branch_id, delivery_reference,
      tracking_courier, tracking_numero, tracking_codigo, tracking_ose_id,
      tracking_year, tracking_phase, tracking_phase_at, tracking_demora_at,
      payment_verification, payment_reason, payment_event_id,
      pay360_coupon_id, pay360_consumer_code,
      advance_amount, payment_provider,
      expires_at, created_at
    `)
    .eq('token', token)
    .single()

  if (error || !session) {
    return new Response('Not found', { status: 404, headers: corsHeaders })
  }

  // Always resolve fresh seller info from sellers table (name/photo can change)
  let sellerName = session.seller_name
  let sellerRole = session.seller_role
  let sellerAvatar = session.seller_avatar

  if (session.assigned_seller_id) {
    const { data: seller } = await supabase
      .from('sellers')
      .select('nombre, role_label, avatar_url')
      .eq('auth_user_id', session.assigned_seller_id)
      .maybeSingle()

    if (seller) {
      sellerName = seller.nombre
      sellerRole = seller.role_label
      sellerAvatar = seller.avatar_url
      // Cache it back to the session if changed
      if (
        seller.nombre !== session.seller_name ||
        seller.role_label !== session.seller_role ||
        seller.avatar_url !== session.seller_avatar
      ) {
        await supabase
          .from('order_sessions')
          .update({ seller_name: seller.nombre, seller_role: seller.role_label, seller_avatar: seller.avatar_url })
          .eq('id', session.id)
      }
    }
  }

  // Whether this buyer may place outbound calls (enabled manually for top clients)
  let buyerCanCall = false
  // Ficha de contacto del comprador — SOLO para el vendedor (ver `sellerOnly`
  // abajo: mismas reglas que `payment_reason`, es PII y no debe viajar al
  // navegador de un comprador que mira la pestaña de red).
  let buyerContact: Record<string, unknown> | null = null
  if (session.buyer_id) {
    const { data: b } = await supabase
      .from('buyers')
      .select('can_call, nombre, document_type, document_number, phone, activated_at')
      .eq('id', session.buyer_id)
      .maybeSingle()
    buyerCanCall = !!b?.can_call
    if (viewerIsSeller && b) {
      // ¿Se le puede mandar una push AHORA? No es lo mismo que "entró alguna
      // vez": desinstalar la app no avisa a nadie, pero la suscripción se cae
      // con ella. Lo único honesto que se puede decir es si HOY hay una
      // suscripción viva, y eso es justo lo que decide si la campaña llega.
      const { count } = await supabase
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', session.buyer_id)
        .eq('sub_role', 'buyer')

      buyerContact = {
        nombre: b.nombre ?? session.buyer_name ?? null,
        document_type: b.document_type ?? 'DNI',
        document_number: b.document_number ?? null,
        // El WhatsApp que llenó en el checkout. Es también el teléfono con el
        // que se registró su cliente en 360pay. El número desde el que YAPEÓ no
        // existe en ningún lado: Yape no lo revela — lo que sí llega del pago
        // es la operación bancaria (abajo).
        phone: b.phone ?? session.buyer_phone ?? null,
        // Las dos mitades de "¿está en la app?": cuándo entró por primera vez
        // (o nunca), y si hoy puede recibir notificaciones.
        activated_at: b.activated_at ?? null,
        push_activo: (count ?? 0) > 0,
      }
    }
  }

  // Rastro del pago, si el pedido ya cruzó: la cadena completa con la que el
  // comercio COTEJA contra el panel de 360pay y contra el banco. La operación
  // sola no dice nada — cierra el círculo junto con el cupón y el código de
  // pago, que son lo que el panel de 360pay lista. Del `raw` del evento se
  // extraen solo `operation_number` y `bank_tx_id`: el raw entero lleva fees.
  let paymentTrace: {
    operation_number: string | null; bank: string | null
    coupon_id: string | null; payment_code: string | null
  } | null = null
  if (viewerIsSeller && session.payment_event_id) {
    const { data: ev } = await supabase.from('payment_events')
      .select('raw, operation_number').eq('id', session.payment_event_id).maybeSingle()
    if (ev) {
      let op = ev.operation_number ?? null, bank: string | null = null
      // El código de pago sale de la fila del pedido; el evento del webhook lo
      // trae también (`code`), y ese es el respaldo para pedidos que pagaron
      // pese a que la emisión no llegó a guardar la columna — pasó con el
      // primer cupón real, cuando un fallo posterior a la emisión respondía
      // antes de escribir la fila.
      let code: string | null = session.pay360_consumer_code ?? null
      try {
        const raw = JSON.parse(ev.raw ?? '{}')
        op = op ?? (typeof raw.operation_number === 'string' ? raw.operation_number : null)
        bank = typeof raw.bank_tx_id === 'string' ? raw.bank_tx_id : null
        code = code ?? (typeof raw.code === 'string' ? raw.code : null)
      } catch { /* raw no-JSON (eventos viejos del flujo manual): sin rastro */ }
      paymentTrace = {
        operation_number: op, bank,
        coupon_id: session.pay360_coupon_id ?? null,
        payment_code: code,
      }
    }
  }

  // Header participants = current OWNER + people EXPLICITLY invited (not the
  // whole hand-off history). Each carries who invited them so the client can
  // show an expel button only to the inviter.
  const invited: string[] = session.invited_seller_ids ?? []
  const invitedBy: Record<string, string | null> = session.invited_by ?? {}
  const chipIds = [session.assigned_seller_id, ...invited].filter(Boolean) as string[]
  let participants: {
    id: string; nombre: string; role_label: string; avatar_url: string | null
    can_write: boolean; is_owner: boolean; invited_by: string | null
  }[] = []
  if (chipIds.length > 0) {
    const { data: people } = await supabase
      .from('sellers')
      .select('auth_user_id, nombre, role_label, avatar_url')
      .in('auth_user_id', chipIds)
    participants = (people ?? []).map((p: any) => ({
      id: p.auth_user_id,
      nombre: p.nombre,
      role_label: p.role_label,
      avatar_url: p.avatar_url,
      is_owner: p.auth_user_id === session.assigned_seller_id,
      can_write: true,
      invited_by: invitedBy[p.auth_user_id] ?? null,
    }))
    // keep owner first, then invited in order
    participants.sort((a, b) => (a.is_owner === b.is_owner ? 0 : a.is_owner ? -1 : 1))
  }

  // Fetch messages — the buyer never sees seller-only entries (e.g. expulsions)
  let mq = supabase
    .from('chat_messages')
    .select('id, session_id, sender_role, sender_name, sender_role_label, type, body, media_url, offer, call_recording_id, visibility, created_at, read_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
  if (!viewerIsSeller) mq = mq.or('visibility.is.null,visibility.eq.all')
  const { data: messages } = await mq

  // `call_recording_id` es SOLO de Ventas. No es que el comprador pueda bajar
  // el audio con él —`get-recordings` exige admin—, es que su sola presencia le
  // dice que esa llamada quedó grabada. Misma regla que `payment_reason`: da
  // igual que la UI no lo pinte, viaja en el JSON y se ve en la pestaña de red.
  const mensajes = (messages ?? []).map(m =>
    viewerIsSeller ? m : { ...m, call_recording_id: undefined })

  // Campo SOLO de Ventas: `payment_reason` es el veredicto interno del cobro
  // ("no coincide el monto", el error crudo del proveedor). Mandárselo al
  // comprador repetiría la fuga que ya se corrigió en los mensajes del chat: da
  // igual que la UI no lo pinte, viaja en la respuesta y queda a la vista de
  // cualquiera que mire la red.
  const sellerOnly = viewerIsSeller ? {} : {
    payment_reason: undefined, payment_event_id: undefined,
    pay360_coupon_id: undefined, pay360_consumer_code: undefined,
  }

  return new Response(
    JSON.stringify({
      session: {
        ...session, ...sellerOnly,
        seller_name: sellerName, seller_role: sellerRole, seller_avatar: sellerAvatar,
        participants, buyer_can_call: buyerCanCall,
        buyer_contact: buyerContact, payment_trace: paymentTrace,
      },
      viewer_is_seller: viewerIsSeller,
      messages: mensajes,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
