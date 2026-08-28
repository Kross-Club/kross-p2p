import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// El eje del pedido, en orden. `preparando` SALIÓ (ago-2026): no describía un
// hecho verificable —nadie marca "ya lo empaqué"— y lo que de verdad separa
// cobrar de despachar es que exista la guía. `validando` ENTRA: lo escribe
// `register-buyer` en todo pedido con adelanto y no estaba en esta lista, así
// que un pedido ahí daba índice -1 y el "siguiente" salía la PRIMERA etapa.
const STAGES = ['nuevo', 'validando', 'confirmado', 'en_camino', 'entregado']

// Etapas que la base todavía guarda y ya no están en el eje. Se leen como la
// que las reemplazó — traducirlas es lo que evita que "avanzar" retroceda.
const VIGENTE: Record<string, string> = { preparando: 'confirmado' }
const vigente = (stage: string | null | undefined) => VIGENTE[String(stage ?? '')] ?? String(stage ?? '')

// Lead hand-off (pipeline COD): reaching this stage cedes the order to the role.
//  nuevo → Ventas · confirmado → Logística · en_camino → Motorizado
//
// Sin `preparando` ya no hay entrega a Soporte: la etapa que la disparaba no
// existe. Logística se queda con el pedido desde que entra la plata hasta que
// sale el paquete, que es justo el tramo donde su trabajo ocurre (emitir la
// guía). A Soporte se le sigue pudiendo invitar al chat.
const HANDOFF: Record<string, string> = { confirmado: 'logist', en_camino: 'motoriz' }

// role keyword → the role_label patterns that match it (logística also matches the
// legacy "Despacho" label so old teams keep working).
const ROLE_PATTERNS: Record<string, string[]> = {
  venta: ['venta'],
  logist: ['logist', 'despacho'],
  soporte: ['soporte'],
  motoriz: ['motoriz'],
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

async function pickTeamMember(storeId: string, roleKeyword: string) {
  const patterns = ROLE_PATTERNS[roleKeyword] ?? [roleKeyword]
  const orFilter = patterns.map(p => `role_label.ilike.%${p}%`).join(',')
  const { data: cands } = await supabase
    .from('sellers')
    .select('auth_user_id, nombre, role_label, avatar_url, available')
    .eq('store_id', storeId)
    .eq('active', true)
    .not('auth_user_id', 'is', null)
    .or(orFilter)

  // Skip anyone off-shift (available=false). Missing column → treated as available.
  const list = (cands ?? []).filter((c: any) => c.auth_user_id && c.available !== false)
  if (list.length === 0) return null

  const ids = list.map((c: any) => c.auth_user_id as string)
  const counts: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const { data: active } = await supabase
    .from('order_sessions')
    .select('assigned_seller_id')
    .eq('status', 'active')
    .in('assigned_seller_id', ids)
  for (const r of active ?? []) if (r.assigned_seller_id) counts[r.assigned_seller_id]++

  ids.sort((a, b) => counts[a] - counts[b])
  return list.find((c: any) => c.auth_user_id === ids[0]) ?? null
}

const uniq = (arr: (string | null | undefined)[]) =>
  [...new Set(arr.filter(Boolean) as string[])]

function randomToken() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24)
}

const sumItems = (items: any[]) => items.reduce((s, it) => s + (Number(it.precio) || 0), 0)
const parseQty = (nombre: string) => { const m = String(nombre ?? '').match(/\d+/); return m ? parseInt(m[0], 10) : 0 }

// Line price for a given quantity following the product's pack configuration
async function priceForQty(item: any, qty: number): Promise<{ precio: number; pack_name: string | null }> {
  const unit = Number(item.unit_price) || Number(item.precio) || 0
  if (item.product_id) {
    const { data: prod } = await supabase.from('products').select('precio, packs').eq('id', item.product_id).maybeSingle()
    const packs: any[] = prod?.packs ?? []
    const exact = packs.find(p => parseQty(p.nombre) === qty)
    if (exact) return { precio: Number(exact.precio) || 0, pack_name: exact.nombre }
    const unitPack = packs.find(p => parseQty(p.nombre) === 1)
    const u = unitPack ? Number(unitPack.precio) : (Number(prod?.precio) || unit)
    return { precio: u * qty, pack_name: `${qty} und` }
  }
  return { precio: unit * qty, pack_name: `${qty} und` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'advance' | 'invite' | 'expel' | 'cancel' | 'anular' | 'restore' | 'recreate' | 'set_nota' | 'accept_offer' | 'set_qty' | 'remove_item' | 'set_tracking' | 'mark_answered'
    session_id: string
    stage?: string
    invite_seller_id?: string
    by_seller_id?: string
    by?: 'buyer' | 'seller'
    nota?: string
    offer?: { product_id?: string; nombre: string; precio: number; image?: string | null }
    message_id?: string
    index?: number
    qty?: number
    tracking?: { courier?: string; numero?: string; codigo?: string; ose_id?: string; year?: string }
  }

  if (!body.session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, token, store_id, stage, status, buyer_id, buyer_name, buyer_phone, product_price, product_name, items, address, address_lat, address_lng, address_verified, assigned_seller_id, seller_name, seller_role, seller_avatar, involved_seller_ids, writer_seller_ids, invited_seller_ids, invited_by, dispatch_type, agency_name, advance_amount, payment_verification')
    .eq('id', body.session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  // ─── SET NOTA (CRM sub-tag) ─────────────────────────────────────────────────
  if (body.action === 'set_nota') {
    await supabase.from('order_sessions').update({ nota: body.nota ?? null }).eq('id', session.id)
    await broadcast(session.id, 'nota_update', { nota: body.nota ?? null })
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── ANULAR ────────────────────────────────────────────────────────────────
  //
  // No es cancelar. Un CANCELADO es una venta que existió y se perdió: duele, y
  // tiene que doler en la tasa de conversión. Un ANULADO nunca fue una venta —
  // se creó por error, o es una prueba— y contarlo junto al otro ensucia el
  // único número que la marca usa para decidir cuánto invertir.
  //
  // `restore` lo devuelve a activo: anular por error tiene que poder desandarse,
  // porque el estado se pone justamente cuando alguien se equivocó.
  if (body.action === 'anular' || body.action === 'restore') {
    const anular = body.action === 'anular'
    await supabase.from('order_sessions')
      .update({ status: anular ? 'anulado' : 'active' })
      .eq('id', session.id)

    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', type: 'status_update',
      // Solo para el equipo: al comprador no le decimos que su pedido era una
      // prueba nuestra.
      visibility: 'sellers',
      body: anular ? '🚫 Pedido anulado (no cuenta en estadísticas)' : '↩️ Pedido restaurado',
    })

    await broadcast(session.id, 'status_update', { status: anular ? 'anulado' : 'active' })
    return new Response(JSON.stringify({ ok: true, status: anular ? 'anulado' : 'active' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── MARCAR COMO RESPONDIDO ────────────────────────────────────────────────
  //
  // La bandeja llama "sin responder" a un pedido cuyo ÚLTIMO mensaje es del
  // comprador. Casi siempre eso se resuelve escribiéndole, y entonces el estado
  // se arregla solo. Pero no siempre: se le llamó por teléfono, se le contestó
  // por WhatsApp, o la pregunta no necesitaba respuesta. Sin una forma de
  // cerrarlo a mano, esos pedidos se quedan arriba de la lista para siempre y la
  // lista deja de significar algo.
  //
  // Es del PEDIDO y no del dispositivo a propósito: si Andrea lo cierra, Kevin
  // no tiene que volver a mirarlo. Y no borra nada — si el comprador escribe
  // otra vez, su mensaje es posterior a `answered_at` y el pedido vuelve solo a
  // la lista (ver `esperaRespuesta` en src/lib/bandeja.ts).
  if (body.action === 'mark_answered') {
    const answered_at = new Date().toISOString()
    await supabase.from('order_sessions').update({ answered_at }).eq('id', session.id)
    await broadcast(session.id, 'answered_update', { answered_at })
    return new Response(JSON.stringify({ ok: true, answered_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── SET TRACKING (Logistics registra la guía del courier en el pedido) ─────
  // Contrato `shipment` de 00-CORE. Cada courier con su regla, la de su API
  // real: Shalom exige numero (8–10 dígitos) Y codigo (4 alfanum) juntos, o
  // solo ose_id; Olva rastrea por numero (típicamente 8 dígitos) + año de
  // emisión — sin código. La guía viaja al comprador por el chat —es el canal
  // principal— y con ella en mano ya puede pagar el saldo POR LA APP (nunca en
  // el mostrador, ver 02 §saldo).
  if (body.action === 'set_tracking') {
    const g = normalizarGuia(body.tracking ?? {}, session.agency_name, Date.now())
    if (!g.ok) {
      return new Response(JSON.stringify({ error: g.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const r = await registrarGuia(session, g)
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ ok: true, tracking: g.tracking }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── SET QTY (seller edits a product quantity → price follows the packs) ────
  if (body.action === 'set_qty') {
    const items: any[] = Array.isArray(session.items) ? session.items : []
    const i = body.index ?? -1
    const qty = Math.max(1, body.qty ?? 1)
    if (!items[i]) return new Response('Invalid item', { status: 400, headers: corsHeaders })
    const prevQty = items[i].qty ?? 1
    const { precio, pack_name } = await priceForQty(items[i], qty)
    const nombre = items[i].nombre
    items[i] = { ...items[i], qty, precio, pack_name }
    const total = sumItems(items)
    await supabase.from('order_sessions').update({ items, product_price: total }).eq('id', session.id)

    const verb = qty > prevQty ? 'Agregué' : 'Actualicé'
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'seller', sender_name: session.seller_name ?? 'Kross',
      sender_role_label: session.seller_role ?? 'Ventas', type: 'text',
      body: `🔢 ${verb} ${nombre} a ${qty} unidad(es). Nuevo total: S/${total} 📦`,
    }).select().single()

    await broadcast(session.id, 'items_update', { items, total })
    if (msg) await broadcast(session.id, 'new_message', msg)
    return new Response(JSON.stringify({ ok: true, items, total }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── REMOVE ITEM (keep the rest of the order) ───────────────────────────────
  if (body.action === 'remove_item') {
    const items: any[] = Array.isArray(session.items) ? session.items : []
    const i = body.index ?? -1
    if (!items[i]) return new Response('Invalid item', { status: 400, headers: corsHeaders })
    if (items.length <= 1) return new Response(JSON.stringify({ error: 'last_item' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const removed = items[i]
    const newItems = items.filter((_, k) => k !== i)
    const total = sumItems(newItems)
    await supabase.from('order_sessions').update({ items: newItems, product_price: total }).eq('id', session.id)

    if (body.by === 'buyer' && session.buyer_id) {
      const { data: b } = await supabase.from('buyers').select('score').eq('id', session.buyer_id).maybeSingle()
      await supabase.from('buyers').update({ score: Math.max(0, (b?.score ?? 50) - 5) }).eq('id', session.buyer_id)
    }

    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', type: 'status_update', visibility: 'all',
      body: `🗑️ Se quitó ${removed.nombre} del pedido. Nuevo total: S/${total}`,
    }).select().single()
    await broadcast(session.id, 'items_update', { items: newItems, total })
    if (msg) await broadcast(session.id, 'new_message', msg)
    return new Response(JSON.stringify({ ok: true, items: newItems, total }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── RECREATE (reactivate a cancelled order — recover the sale) ──────────────
  if (body.action === 'recreate') {
    await supabase.from('order_sessions').update({ status: 'active', stage: 'nuevo', nota: 'recuperado' }).eq('id', session.id)
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', type: 'status_update', visibility: 'all',
      body: '🔄 El pedido fue reactivado',
    }).select().single()
    await broadcast(session.id, 'order_recreated', {})
    if (msg) await broadcast(session.id, 'new_message', msg)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── ACCEPT OFFER ───────────────────────────────────────────────────────────
  // Before "preparando" → add the product to the SAME order (one cart, one chat,
  // one delivery). From "preparando" on → it's a separate new order.
  if (body.action === 'accept_offer') {
    if (!body.offer) return new Response('Missing offer', { status: 400, headers: corsHeaders })
    const offer = body.offer

    // Guard against double-accept: if this offer is already accepted, do nothing
    if (body.message_id) {
      const { data: om } = await supabase.from('chat_messages').select('offer').eq('id', body.message_id).maybeSingle()
      if (om?.offer?.accepted) {
        return new Response(JSON.stringify({ ok: true, already: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (om?.offer) {
        const updatedOffer = { ...om.offer, accepted: true }
        await supabase.from('chat_messages').update({ offer: updatedOffer }).eq('id', body.message_id)
        await broadcast(session.id, 'message_update', { id: body.message_id, offer: updatedOffer })
      }
    }

    const offerItem = { product_id: offer.product_id ?? null, nombre: offer.nombre, precio: offer.precio, unit_price: offer.precio, qty: 1, image: offer.image ?? null }
    const canMerge = session.stage === 'nuevo' || session.stage === 'confirmado'

    if (canMerge) {
      const currentItems: any[] = Array.isArray(session.items) && session.items.length
        ? session.items
        : [{ product_id: null, nombre: session.product_name, precio: session.product_price, unit_price: session.product_price, qty: 1 }]
      const newItems = [...currentItems, offerItem]
      const total = sumItems(newItems)

      await supabase.from('order_sessions').update({ items: newItems, product_price: total }).eq('id', session.id)

      const { data: msg } = await supabase.from('chat_messages').insert({
        session_id: session.id, sender_role: 'seller', sender_name: session.seller_name ?? 'Kross',
        sender_role_label: session.seller_role ?? 'Ventas', type: 'text',
        body: `✅ Agregué ${offer.nombre} a tu pedido. Nuevo total: S/${total} — llega todo junto en una sola entrega. 📦`,
      }).select().single()

      await broadcast(session.id, 'items_update', { items: newItems, total })
      if (msg) await broadcast(session.id, 'new_message', msg)

      return new Response(JSON.stringify({ ok: true, merged: true, total }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // New separate order (already being prepared / shipped)
    const token = randomToken()
    const orderId = `ORD-${Date.now()}`
    const { data: created } = await supabase.from('order_sessions').insert({
      order_id: orderId,
      store_id: session.store_id,
      token,
      buyer_id: session.buyer_id,
      buyer_name: session.buyer_name,
      buyer_phone: session.buyer_phone,
      // inherit the already-verified address
      address: session.address, address_lat: session.address_lat, address_lng: session.address_lng, address_verified: session.address_verified,
      product_id: offer.product_id ?? null,
      product_name: offer.nombre,
      product_price: offer.precio,
      items: [offerItem],
      status: 'active',
      stage: 'nuevo',
      assigned_seller_id: session.assigned_seller_id,
      seller_name: session.seller_name,
      seller_role: session.seller_role,
      seller_avatar: session.seller_avatar,
      involved_seller_ids: session.assigned_seller_id ? [session.assigned_seller_id] : [],
      writer_seller_ids: session.assigned_seller_id ? [session.assigned_seller_id] : [],
    }).select('id, token').single()

    if (created) {
      await supabase.from('chat_messages').insert({
        session_id: created.id, sender_role: 'seller', sender_name: session.seller_name ?? 'Kross',
        sender_role_label: session.seller_role ?? 'Ventas', type: 'text',
        body: `¡Gracias por aprovechar la oferta! 🎉 Tu ${offer.nombre} (S/${offer.precio}) también llegará a tu puerta.`,
      })
    }
    return new Response(JSON.stringify({ ok: true, merged: false, token: created?.token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── CANCEL ─────────────────────────────────────────────────────────────────
  if (body.action === 'cancel') {
    await supabase.from('order_sessions').update({ status: 'cancelado' }).eq('id', session.id)

    let scorePenalty = 0
    if (body.by === 'buyer' && session.buyer_id) {
      const { data: b } = await supabase.from('buyers').select('score').eq('id', session.buyer_id).maybeSingle()
      const newScore = Math.max(0, (b?.score ?? 50) - 15)
      scorePenalty = (b?.score ?? 50) - newScore
      await supabase.from('buyers').update({ score: newScore }).eq('id', session.buyer_id)
    }

    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', type: 'status_update', visibility: 'all',
      body: body.by === 'buyer' ? '❌ El comprador canceló el pedido' : '❌ El pedido fue cancelado',
    }).select().single()

    await broadcast(session.id, 'order_cancelled', { by: body.by })
    if (msg) await broadcast(session.id, 'new_message', msg)

    return new Response(JSON.stringify({ ok: true, score_penalty: scorePenalty }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const involved: string[] = session.involved_seller_ids ?? []
  const writers: string[] = session.writer_seller_ids ?? []
  const invited: string[] = session.invited_seller_ids ?? []
  const invitedBy: Record<string, string> = session.invited_by ?? {}

  const isAdmin = async (sellerAuthId?: string) => {
    if (!sellerAuthId) return false
    const { data } = await supabase.from('sellers').select('is_admin').eq('auth_user_id', sellerAuthId).maybeSingle()
    return !!data?.is_admin
  }

  // ─── INVITE ───────────────────────────────────────────────────────────────
  if (body.action === 'invite') {
    if (!body.invite_seller_id) return new Response('Missing invite_seller_id', { status: 400, headers: corsHeaders })

    const { data: member } = await supabase
      .from('sellers')
      .select('auth_user_id, nombre, role_label')
      .eq('auth_user_id', body.invite_seller_id)
      .maybeSingle()

    await supabase.from('order_sessions').update({
      involved_seller_ids: uniq([...involved, body.invite_seller_id]),
      writer_seller_ids: uniq([...writers, body.invite_seller_id]),
      invited_seller_ids: uniq([...invited, body.invite_seller_id]),
      invited_by: { ...invitedBy, [body.invite_seller_id]: body.by_seller_id ?? null },
    }).eq('id', session.id)

    // Visible to buyer too ("invitó a alguien")
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      type: 'status_update',
      visibility: 'all',
      body: `${member?.nombre?.split(' ')[0] ?? 'Un agente'} (${member?.role_label ?? 'equipo'}) se unió al chat`,
    }).select().single()

    await broadcast(session.id, 'participants_update', {})
    if (msg) await broadcast(session.id, 'new_message', msg)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ─── EXPEL ──────────────────────────────────────────────────────────────────
  if (body.action === 'expel') {
    if (!body.invite_seller_id) return new Response('Missing invite_seller_id', { status: 400, headers: corsHeaders })

    // Only the person who invited them (or an admin) can expel.
    const allowed = invitedBy[body.invite_seller_id] === body.by_seller_id || await isAdmin(body.by_seller_id)
    if (!allowed) return new Response('Not allowed', { status: 403, headers: corsHeaders })

    const { data: member } = await supabase
      .from('sellers')
      .select('nombre, role_label')
      .eq('auth_user_id', body.invite_seller_id)
      .maybeSingle()

    const nextInvitedBy = { ...invitedBy }
    delete nextInvitedBy[body.invite_seller_id]

    await supabase.from('order_sessions').update({
      writer_seller_ids: writers.filter(w => w !== body.invite_seller_id),
      invited_seller_ids: invited.filter(i => i !== body.invite_seller_id),
      invited_by: nextInvitedBy,
    }).eq('id', session.id)

    // Sellers-only history — the buyer never sees expulsions
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      type: 'status_update',
      visibility: 'sellers',
      body: `${member?.nombre?.split(' ')[0] ?? 'Un agente'} (${member?.role_label ?? 'equipo'}) fue retirado del chat`,
    }).select().single()

    await broadcast(session.id, 'participants_update', {})
    if (msg) await broadcast(session.id, 'new_message', msg)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ─── ADVANCE STAGE ──────────────────────────────────────────────────────────
  const idx = STAGES.indexOf(vigente(session.stage))
  // `idx < 0` solo puede pasar con una etapa que no conocemos: entonces no hay
  // "siguiente" que calcular y el pedido se queda donde está, en vez de saltar
  // a `nuevo` — que es lo que hacía antes con un índice -1.
  const next = body.stage ?? (idx >= 0 ? STAGES[idx + 1] : undefined)
  // `no_entregado` es TERMINAL y solo EXPLÍCITO: jamás es el "siguiente" de
  // nada (no vive en STAGES) — lo pide una persona desde el selector, con
  // confirmación. Es lo que vuelve computable la tasa de entrega.
  if (!next || (!STAGES.includes(next) && next !== 'no_entregado')) {
    return new Response('Invalid stage', { status: 400, headers: corsHeaders })
  }

  // 1) Persist the stage FIRST and on its own — this is an existing column, so
  //    it always saves even if the value-chain columns haven't been added yet.
  const { error: stageErr } = await supabase
    .from('order_sessions')
    .update({ stage: next })
    .eq('id', session.id)

  if (stageErr) {
    return new Response(JSON.stringify({ error: stageErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let newAssignment: { seller_name: string; seller_role: string; seller_avatar: string | null } | null = null

  const roleKeyword = HANDOFF[next]
  if (roleKeyword && session.store_id) {
    const member = await pickTeamMember(session.store_id, roleKeyword)
    if (member) {
      // 2) Reassign owner (existing columns)
      await supabase.from('order_sessions').update({
        assigned_seller_id: member.auth_user_id,
        seller_name: member.nombre,
        seller_role: member.role_label,
        seller_avatar: member.avatar_url,
      }).eq('id', session.id)

      // 3) Value-chain arrays (new columns) — best effort, don't block the rest.
      //    A hand-off resets the invited list (new owner starts clean).
      //    En 'en_camino', el dueño previo (Logística, desde 'confirmado') SIGUE
      //    acompañando: queda como co-escritor junto al Motorizado.
      const prevOwner = session.assigned_seller_id
      const keepCowriter = next === 'en_camino' && prevOwner ? [prevOwner] : []
      await supabase.from('order_sessions').update({
        writer_seller_ids: uniq([member.auth_user_id, ...keepCowriter]),
        involved_seller_ids: uniq([...involved, member.auth_user_id, ...keepCowriter]),
        invited_seller_ids: [],
        invited_by: {},
      }).eq('id', session.id)

      newAssignment = { seller_name: member.nombre, seller_role: member.role_label, seller_avatar: member.avatar_url }
    }
  }

  await broadcast(session.id, 'stage_update', { stage: next })

  // El cierre en fracaso queda escrito para el equipo (jamás para el
  // comprador: su tracker ya muestra el cierre neutro, y restregárselo por
  // chat no recupera nada). El motivo fino vive en la conversación.
  if (next === 'no_entregado') {
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      sender_name: 'Kross',
      type: 'text',
      visibility: 'sellers',
      body: '❌ Pedido marcado como NO ENTREGADO. Cuenta en la tasa de entrega de la marca.',
    })
  }

  if (newAssignment) {
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      type: 'status_update',
      visibility: 'all',
      body: `Tu pedido pasó a ${newAssignment.seller_role} · te atiende ${newAssignment.seller_name.split(' ')[0]}`,
    }).select().single()

    await broadcast(session.id, 'assignment_update', newAssignment)
    if (msg) await broadcast(session.id, 'new_message', msg)
  }

  return new Response(JSON.stringify({ ok: true, stage: next, assignment: newAssignment }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
