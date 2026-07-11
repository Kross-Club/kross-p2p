import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const STAGES = ['nuevo', 'confirmado', 'preparando', 'en_camino', 'entregado']
// Lead hand-off: reaching this stage cedes the order to the given role.
const HANDOFF: Record<string, string> = { confirmado: 'despacho', en_camino: 'motoriz' }

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
  const { data: cands } = await supabase
    .from('sellers')
    .select('auth_user_id, nombre, role_label, avatar_url, available')
    .eq('store_id', storeId)
    .eq('active', true)
    .not('auth_user_id', 'is', null)
    .ilike('role_label', `%${roleKeyword}%`)

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'advance' | 'invite' | 'expel' | 'cancel'
    session_id: string
    stage?: string
    invite_seller_id?: string
    by_seller_id?: string
    by?: 'buyer' | 'seller'
  }

  if (!body.session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, stage, buyer_id, assigned_seller_id, involved_seller_ids, writer_seller_ids, invited_seller_ids, invited_by')
    .eq('id', body.session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

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
  const idx = STAGES.indexOf(session.stage)
  const next = body.stage ?? STAGES[idx + 1]
  if (!next || !STAGES.includes(next)) {
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
      await supabase.from('order_sessions').update({
        writer_seller_ids: uniq([member.auth_user_id]),
        involved_seller_ids: uniq([...involved, member.auth_user_id]),
        invited_seller_ids: [],
        invited_by: {},
      }).eq('id', session.id)

      newAssignment = { seller_name: member.nombre, seller_role: member.role_label, seller_avatar: member.avatar_url }
    }
  }

  await broadcast(session.id, 'stage_update', { stage: next })

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
