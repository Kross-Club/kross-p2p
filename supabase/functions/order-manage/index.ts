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
    .select('auth_user_id, nombre, role_label, avatar_url')
    .eq('store_id', storeId)
    .eq('active', true)
    .not('auth_user_id', 'is', null)
    .ilike('role_label', `%${roleKeyword}%`)

  const list = (cands ?? []).filter((c: any) => c.auth_user_id)
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
    action: 'advance' | 'invite'
    session_id: string
    stage?: string
    invite_seller_id?: string
  }

  if (!body.session_id) return new Response('Missing session_id', { status: 400, headers: corsHeaders })

  const { data: session } = await supabase
    .from('order_sessions')
    .select('id, store_id, stage, assigned_seller_id, involved_seller_ids, writer_seller_ids')
    .eq('id', body.session_id)
    .single()

  if (!session) return new Response('Not found', { status: 404, headers: corsHeaders })

  const involved: string[] = session.involved_seller_ids ?? []
  const writers: string[] = session.writer_seller_ids ?? []

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
    }).eq('id', session.id)

    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      type: 'status_update',
      body: `${member?.nombre?.split(' ')[0] ?? 'Un agente'} (${member?.role_label ?? 'equipo'}) fue invitado a participar`,
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

  const update: Record<string, unknown> = { stage: next }
  let newAssignment: { seller_name: string; seller_role: string; seller_avatar: string | null } | null = null

  const roleKeyword = HANDOFF[next]
  if (roleKeyword && session.store_id) {
    const member = await pickTeamMember(session.store_id, roleKeyword)
    if (member) {
      update.assigned_seller_id = member.auth_user_id
      update.seller_name = member.nombre
      update.seller_role = member.role_label
      update.seller_avatar = member.avatar_url
      // New owner is the sole writer; previous agents stay as read-only observers.
      update.writer_seller_ids = uniq([member.auth_user_id])
      update.involved_seller_ids = uniq([...involved, member.auth_user_id])
      newAssignment = { seller_name: member.nombre, seller_role: member.role_label, seller_avatar: member.avatar_url }
    }
  }

  await supabase.from('order_sessions').update(update).eq('id', session.id)

  await broadcast(session.id, 'stage_update', { stage: next })

  if (newAssignment) {
    const { data: msg } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_role: 'system',
      type: 'status_update',
      body: `Tu pedido pasó a ${newAssignment.seller_role} · te atiende ${newAssignment.seller_name.split(' ')[0]}`,
    }).select().single()

    await broadcast(session.id, 'assignment_update', newAssignment)
    if (msg) await broadcast(session.id, 'new_message', msg)
  }

  return new Response(JSON.stringify({ ok: true, stage: next, assignment: newAssignment }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
