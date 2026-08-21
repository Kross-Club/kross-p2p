import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer, priceFromPacks } from '../_shared/advance.ts'

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
    advance_choice?: string
    pack_name?: string
    buyer_name: string
    buyer_phone: string
    document_type?: string
    document_number?: string
    address?: string
    seller_ids?: string[]
    redeem_points?: number   // puntos que el cliente quiere canjear por descuento
    payment_method?: string  // YAPE_PLIN | CONTRAENTREGA | TARJETA (default COD)
    closed_by?: string       // AI_CLOSER | DIRECT_CHECKOUT (default directo)
    checkout_variant?: string // A | B — qué versión del checkout cerró el pedido
    // Costuras de ENTREGA del checkout guiado (Quiz). Ver docs/01-SALES-ENGINE.md.
    dispatch_type?: string        // MOTORIZADO_LIMA | MOTORIZADO_PROVINCIA | AGENCIA_PROVINCIA | AGENCIA_LIMA
    agency_name?: string          // SHALOM | OLVA | OTRO (solo provincia)
    delivery_reference?: string   // referencia de la dirección / agencia destino
    address_lat?: number          // pin GPS fijado en el checkout
    address_lng?: number
    // ─── Fase 3 · adelanto ──────────────────────────────────────────────────
    checkout_id?: string          // uuid del modal: hace el alta IDEMPOTENTE
    advance_amount?: number       // informativo: el monto REAL se deriva en el server
    // '360PAY' = el adelanto se cobra en línea con un cupón. Saca al pedido de
    // la piscina del cruce manual: sin esto, un yape ajeno del mismo monto lo
    // daría por pagado y el cobro real nunca ocurriría. Ver §16.d del esquema.
    payment_provider?: string
  }

  // ─── Idempotencia ──────────────────────────────────────────────────────────
  // Un doble tap en "Terminar pedido" con 4G lenta manda dos veces. Sin esto se
  // crean dos pedidos, se le asignan dos vendedores y el comprador recibe dos
  // mensajes de bienvenida. El uuid nace al abrir el modal, así que los dos
  // envíos traen el MISMO y el segundo devuelve el pedido ya creado.
  const checkoutId = typeof body.checkout_id === 'string' && body.checkout_id.trim() ? body.checkout_id.trim() : null
  if (checkoutId) {
    const { data: existing } = await supabase
      .from('order_sessions').select('id, order_id, token').eq('checkout_id', checkoutId).maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({ ...existing, idempotent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Upsert buyer account — document_number as unique key if provided, fallback to phone
  let buyer: { id: string; score: number; puntos: number; address: string | null; address_lat: number | null; address_lng: number | null; address_verified: boolean } | null = null
  let buyerErr: { message: string } | null = null

  if (body.document_number) {
    const { data, error } = await supabase
      .from('buyers')
      .upsert(
        {
          store_id: body.store_id,
          document_type: body.document_type ?? 'DNI',
          document_number: body.document_number,
          phone: body.buyer_phone,
          nombre: body.buyer_name,
          address: body.address ?? null,
        },
        { onConflict: 'store_id,document_number', ignoreDuplicates: false }
      )
      .select('id, score, puntos, address, address_lat, address_lng, address_verified')
      .single()
    buyer = data
    buyerErr = error

    // 23505 aquí = el TELÉFONO ya existe en la tienda con otro (o ningún) DNI.
    // Es el comprador de la era pre-DNI volviendo con su documento — el caso
    // normal de la base vieja, no un ataque. Antes esto moría en 500 y la
    // venta se perdía; ahora el comprador existente ADOPTA el DNI y conserva
    // su identidad (puntos, score, historial).
    if (buyerErr?.code === '23505') {
      const { data: adopted, error: adoptErr } = await supabase
        .from('buyers')
        .upsert(
          {
            store_id: body.store_id,
            phone: body.buyer_phone,
            document_type: body.document_type ?? 'DNI',
            document_number: body.document_number,
            nombre: body.buyer_name,
            address: body.address ?? null,
          },
          { onConflict: 'store_id,phone', ignoreDuplicates: false }
        )
        .select('id, score, puntos, address, address_lat, address_lng, address_verified')
        .single()
      buyer = adopted
      buyerErr = adoptErr
    }
  } else {
    // Fallback: upsert by phone (old registrations without DNI)
    const { data, error } = await supabase
      .from('buyers')
      .upsert(
        { store_id: body.store_id, phone: body.buyer_phone, nombre: body.buyer_name, address: body.address ?? null },
        { onConflict: 'store_id,phone', ignoreDuplicates: false }
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

  // ─── Costuras de ENTREGA (estado central · delivery) ──────────────────────────
  // El checkout guiado ya trae el tipo de despacho, la agencia (provincia), una
  // referencia y —en Lima— el pin GPS. Un pin fresco actualiza la dirección guardada
  // del buyer para que los próximos pedidos la hereden sin re-preguntar.
  // Lista blanca de los CUATRO valores: región × método. El default sigue siendo
  // Lima para no romper a quien mande el campo vacío, pero ojo con esa red de
  // seguridad — un valor no listado NO falla, se aplasta contra MOTORIZADO_LIMA.
  // Por eso agregar aquí es obligatorio al sumar una combinación: sin
  // AGENCIA_LIMA, un recojo en Lima se guardaba como entrega a domicilio y el
  // motorizado salía a una casa por un paquete que estaba en el mostrador.
  const DISPATCH = ['MOTORIZADO_LIMA', 'MOTORIZADO_PROVINCIA', 'AGENCIA_PROVINCIA', 'AGENCIA_LIMA']
  const dispatchType = DISPATCH.includes(body.dispatch_type ?? '')
    ? body.dispatch_type!
    : 'MOTORIZADO_LIMA'
  const agencyName = ['SHALOM', 'OLVA', 'OTRO'].includes(body.agency_name ?? '') ? body.agency_name! : null
  const deliveryReference = body.delivery_reference?.trim() || null
  const pinLat = typeof body.address_lat === 'number' ? body.address_lat : null
  const pinLng = typeof body.address_lng === 'number' ? body.address_lng : null

  if (pinLat != null && pinLng != null) {
    await supabase.from('buyers')
      .update({ address_lat: pinLat, address_lng: pinLng, address_verified: true, address: body.address ?? buyer.address ?? null })
      .eq('id', buyer.id)
    // Refleja el pin localmente para que el insert del pedido lo herede.
    buyer.address_lat = pinLat
    buyer.address_lng = pinLng
    buyer.address_verified = true
    if (body.address) buyer.address = body.address
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

  // Only sellers of THIS store — never assign across tenants
  let sellerPool: Seller[] = []
  {
    const { data: scoped } = await supabase
      .from('sellers')
      .select('auth_user_id, nombre, role_label, avatar_url, is_admin, available, store_id')
      .eq('store_id', body.store_id)
      .eq('active', true)
      .not('auth_user_id', 'is', null)
    sellerPool = (scoped ?? []).filter((s: any) => !s.is_admin && isVentas(s) && isAvailable(s))
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

  // ─── Precio verificado ─────────────────────────────────────────────────────
  // El precio venía del body tal cual. Daba igual mientras el adelanto saliera
  // de una tabla fija por destino; desde que es un PORCENTAJE del precio,
  // aceptarlo del navegador es dejar que el comprador fije lo que se le cobra:
  // declarar un pack de S/2 y que el cobro en línea le saque S/1.
  //
  // Se contrasta contra los packs del producto. Si no se puede verificar (sin
  // product_id, producto sin packs) NO se bloquea la venta —el pedido vale más
  // que la comprobación— pero queda registrado, y el adelanto se calcula igual
  // sobre lo verificado cuando existe.
  let verifiedPrice: number | null = null
  if (body.product_id) {
    const { data: prod } = await supabase.from('products').select('packs').eq('id', body.product_id).maybeSingle()
    verifiedPrice = priceFromPacks(prod?.packs, body.product_price, body.pack_name ?? null)
    if (verifiedPrice === null) {
      console.warn('[register-buyer] precio no verificable contra los packs', JSON.stringify({
        product_id: body.product_id, claimed: body.product_price, pack: body.pack_name ?? null,
      }))
    }
  }
  const basePrice = verifiedPrice ?? body.product_price

  // Points redemption → discount on this order. usedPoints capped by balance AND
  // by the order price, so you can't over-redeem.
  let finalPrice = basePrice
  let discount = 0
  if (body.redeem_points && body.redeem_points > 0) {
    const { data: st } = await supabase.from('stores').select('points_rate').eq('id', body.store_id).maybeSingle()
    const rate = Number(st?.points_rate ?? 0)
    if (rate > 0) {
      const maxByPrice = Math.floor(basePrice / rate)
      const usedPoints = Math.min(body.redeem_points, buyer.puntos ?? 0, maxByPrice)
      if (usedPoints > 0) {
        discount = usedPoints * rate
        finalPrice = Math.max(0, basePrice - discount)
        await supabase.from('buyers').update({ puntos: (buyer.puntos ?? 0) - usedPoints }).eq('id', buyer.id)
      }
    }
  }

  // First product image for the cart thumbnail
  let firstImage: string | null = null
  if (body.product_id) {
    const { data: prod } = await supabase.from('products').select('images').eq('id', body.product_id).maybeSingle()
    firstImage = (prod?.images as string[] | undefined)?.[0] ?? null
  }

  const token = randomToken()
  const orderId = `ORD-${Date.now()}`

  // ─── Adelanto ──────────────────────────────────────────────────────────────
  // Para el checkout directo el monto se DERIVA AQUÍ, nunca del body: aceptarlo
  // del navegador permitía declarar S/1 — y con el cobro en línea ese S/1 se
  // cobraría de verdad y el pedido se auto-confirmaría. El body solo sirve para detectar
  // front desalineado.
  //
  // Es la mitad del pedido, o el total si el comprador lo eligió. `finalPrice`
  // ya trae el precio verificado contra los packs y el descuento de puntos
  // aplicado, que es exactamente lo que va a pagar.
  //
  // El AI closer conserva su monto negociado: su flujo no pasa por esta regla.
  const closedBy = body.closed_by === 'AI_CLOSER' ? 'AI_CLOSER' : 'DIRECT_CHECKOUT'
  const bodyAdvance = typeof body.advance_amount === 'number' && body.advance_amount > 0 ? body.advance_amount : 0
  const advanceChoice = body.advance_choice === 'FULL' ? 'FULL' : 'HALF'
  const advanceAmount = closedBy === 'DIRECT_CHECKOUT'
    ? advanceForServer(finalPrice, advanceChoice)
    : bodyAdvance
  if (closedBy === 'DIRECT_CHECKOUT' && bodyAdvance !== advanceAmount) {
    // Front y server derivando distinto es un bug de despliegue, no un ataque
    // necesariamente — pero en ambos casos manda el server y hay que enterarse.
    console.warn('[register-buyer] advance_amount del body difiere del derivado', JSON.stringify({
      body_advance: bodyAdvance, derived: advanceAmount, price: finalPrice, choice: advanceChoice,
    }))
  }
  // Lista blanca, no passthrough: este campo decide de qué piscina de cruce
  // sale el pedido, así que un valor inventado lo dejaría fuera de las dos.
  const paymentProvider = body.payment_provider === '360PAY' ? '360PAY' : null
  const paymentVerification = advanceAmount > 0 ? 'PENDING' : 'NOT_REQUIRED'

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({
      order_id: orderId,
      // Align the order to the assigned seller's store so it shows in the team's lists
      store_id: assignedSellerStore ?? body.store_id,
      // La tienda del PRODUCTO, siempre. El pool de vendedores ya está scoped a
      // la misma tienda, pero la config de cobro se resuelve por esta columna —
      // cobrar contra la cuenta de otra marca es el peor bug posible, así que
      // el invariante queda escrito en la fila, no implícito en el round-robin.
      origin_store_id: body.store_id,
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
      product_price: finalPrice,
      advance_choice: advanceChoice,
      pack_name: body.pack_name ?? null,
      items: [{ product_id: body.product_id ?? null, nombre: body.product_name, precio: finalPrice, unit_price: finalPrice, qty: 1, pack_name: body.pack_name ?? null, image: firstImage }],
      status: 'active',
      // Con adelanto arranca en `validando`: el comprador acaba de pagar y su
      // barra TIENE que moverse, o el siguiente paso que da es escribir
      // "¿llegó mi pago?" —el mensaje que este checkout existe para evitar—.
      // Sin adelanto (Lima, contraentrega puro) no hay nada que validar y el
      // pedido nace confirmado: mostrarle un paso pendiente que nunca va a
      // ocurrir se lee como que algo se atascó.
      stage: advanceAmount > 0 ? 'validando' : 'confirmado',
      // Costuras del estado central — el checkout las deja escritas desde el día 1
      payment_method: ['YAPE_PLIN', 'CONTRAENTREGA', 'TARJETA'].includes(body.payment_method ?? '') ? body.payment_method : 'CONTRAENTREGA',
      payment_provider: paymentProvider,
      closed_by: closedBy,
      dispatch_type: dispatchType,
      agency_name: agencyName,
      delivery_reference: deliveryReference,
      assigned_seller_id: assignedSellerId,
      involved_seller_ids: assignedSellerId ? [assignedSellerId] : [],
      writer_seller_ids: assignedSellerId ? [assignedSellerId] : [],
      checkout_id: checkoutId,
      checkout_variant: ['A', 'B'].includes(body.checkout_variant ?? '') ? body.checkout_variant : null,
      advance_amount: advanceAmount,
      payment_verification: paymentVerification,
    })
    .select('id, token')
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const firstName = body.buyer_name ? ' ' + body.buyer_name.split(' ')[0] : ''
  const priceLine = `S/${finalPrice}${discount > 0 ? ` · usaste puntos: −S/${discount}` : ''}`
  // Cómo llega, según los CUATRO destinos. "Sin adelanto" quedó mintiendo cuando
  // Lima pasó a cobrar S/5, y provincia-a-domicilio caía en esa misma rama.
  const esRecojo = dispatchType === 'AGENCIA_PROVINCIA' || dispatchType === 'AGENCIA_LIMA'
  const entrega = esRecojo
    ? `se enviará por agencia${agencyName ? ' ' + agencyName : ''} y el saldo lo pagas al recoger`
    : dispatchType === 'MOTORIZADO_PROVINCIA'
      ? 'te llegará a tu casa y el saldo lo pagas al recibirlo'
      : 'llegará a tu puerta y el saldo lo pagas al recibirlo'

  // El estado del adelanto va en el PRIMER mensaje: es la única duda que le
  // queda al comprador. Callarlo lo empuja al WhatsApp del vendedor a
  // preguntar, que es justo lo que este chat evita.
  //
  // Nunca "confirmado" desde aquí: con 360pay el pago llega por webhook, y el
  // propio webhook manda su "✅ ¡Recibimos tu adelanto!" cuando cuadra. Sin
  // cobro en línea, lo coordina el asesor por este mismo chat.
  //
  // Regla dura del módulo: **nunca se le dice que su pago no existe.**
  const advanceLine = advanceAmount > 0
    ? `\n\n⏳ Estamos validando tu adelanto de S/${advanceAmount}. Te aviso por aquí apenas cuadre.`
    : ''

  const welcomeBody = `¡Hola${firstName}! 🎉 Gracias por tu compra. Tu ${body.product_name}`
    + ` (${priceLine}) ${entrega}.${advanceLine}`
    + '\n\nEscríbeme por aquí cualquier duda y te ayudo al toque. 😊'

  await supabase.from('chat_messages').insert({
    session_id: data.id,
    sender_role: 'seller',
    sender_name: assignedSellerName ?? 'Kross',
    sender_role_label: assignedSellerRole ?? 'Ventas',
    type: 'text',
    body: welcomeBody,
  })

  // El lead deja de ser lead: no se persigue a quien ya compró.
  if (checkoutId) {
    await supabase.from('checkout_drafts')
      .update({ converted_at: new Date().toISOString() }).eq('order_id', checkoutId)
  }

  return new Response(
    JSON.stringify({
      token: data.token,
      session_id: data.id,
      // La rama idempotente ya lo devolvía; esta no, y el front hace
      // `setOrderCode(res.order_id)` — el código del pedido llegaba undefined
      // en todo pedido NUEVO. El reintento del cobro también lo necesita.
      order_id: orderId,
      buyer_id: buyer.id,
      score: buyer.score,
      puntos: buyer.puntos,
      assigned_seller_id: assignedSellerId,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
