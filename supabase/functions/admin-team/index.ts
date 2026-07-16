import { createClient } from 'npm:@supabase/supabase-js@2'

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

function roleKeyword(roleLabel: string): string {
  const r = (roleLabel ?? '').toLowerCase()
  if (r.includes('venta')) return 'venta'
  if (r.includes('despacho')) return 'despacho'
  if (r.includes('motoriz')) return 'motoriz'
  return r
}

// Least-loaded available member of a role in a store, excluding one id
async function pickReplacement(storeId: string, keyword: string, excludeId: string) {
  const { data: cands } = await supabase
    .from('sellers')
    .select('auth_user_id, nombre, role_label, avatar_url, available, is_admin')
    .eq('store_id', storeId)
    .eq('active', true)
    .not('auth_user_id', 'is', null)
  const list = (cands ?? []).filter((c: any) =>
    c.auth_user_id && c.auth_user_id !== excludeId && !c.is_admin &&
    c.available !== false && (c.role_label ?? '').toLowerCase().includes(keyword)
  )
  if (list.length === 0) return null
  const ids = list.map((c: any) => c.auth_user_id as string)
  const counts: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const { data: active } = await supabase
    .from('order_sessions').select('assigned_seller_id').eq('status', 'active').in('assigned_seller_id', ids)
  for (const r of active ?? []) if (r.assigned_seller_id) counts[r.assigned_seller_id]++
  ids.sort((a, b) => counts[a] - counts[b])
  return list.find((c: any) => c.auth_user_id === ids[0]) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'set_available' | 'set_role' | 'create' | 'set_avatar'
    admin_auth_id: string
    seller_id?: string          // sellers.auth_user_id of the target
    available?: boolean
    avatar_url?: string
    role_label?: string
    email?: string
    password?: string
    nombre?: string
    store_id?: string
    is_admin?: boolean          // create: make this member the brand admin
  }

  // Only an admin may run these
  const { data: admin } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!admin?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // A store admin may only touch members of their OWN store. The super admin
  // (platform owner) is allowed to reach across stores.
  async function targetInScope(sellerAuthId: string): Promise<boolean> {
    if (admin.is_super_admin) return true
    const { data: t } = await supabase
      .from('sellers').select('store_id').eq('auth_user_id', sellerAuthId).maybeSingle()
    return !!t && t.store_id === admin.store_id
  }

  // ─── SET AVAILABILITY (+ hand off clients when going off-shift) ──────────────
  if (body.action === 'set_available') {
    if (!body.seller_id || typeof body.available !== 'boolean') return new Response('Missing fields', { status: 400, headers: corsHeaders })
    if (!(await targetInScope(body.seller_id))) return new Response('Forbidden', { status: 403, headers: corsHeaders })

    const { data: target } = await supabase
      .from('sellers').select('auth_user_id, nombre, role_label, store_id').eq('auth_user_id', body.seller_id).maybeSingle()
    if (!target) return new Response('Not found', { status: 404, headers: corsHeaders })

    await supabase.from('sellers').update({ available: body.available }).eq('auth_user_id', body.seller_id)

    let reassigned = 0
    if (body.available === false) {
      // Cede sus pedidos activos a otro del mismo rol que esté disponible
      const { data: orders } = await supabase
        .from('order_sessions')
        .select('id, involved_seller_ids')
        .eq('assigned_seller_id', body.seller_id)
        .eq('status', 'active')

      for (const o of orders ?? []) {
        const repl = await pickReplacement(target.store_id, roleKeyword(target.role_label), body.seller_id)
        if (!repl) break
        await supabase.from('order_sessions').update({
          assigned_seller_id: repl.auth_user_id,
          seller_name: repl.nombre,
          seller_role: repl.role_label,
          seller_avatar: repl.avatar_url,
          writer_seller_ids: [repl.auth_user_id],
          involved_seller_ids: [...new Set([...(o.involved_seller_ids ?? []), repl.auth_user_id])],
        }).eq('id', o.id)

        const { data: msg } = await supabase.from('chat_messages').insert({
          session_id: o.id, sender_role: 'system', type: 'status_update', visibility: 'all',
          body: `Ahora te atiende ${repl.nombre.split(' ')[0]} (${repl.role_label})`,
        }).select().single()
        await broadcast(o.id, 'assignment_update', { seller_name: repl.nombre, seller_role: repl.role_label, seller_avatar: repl.avatar_url })
        if (msg) await broadcast(o.id, 'new_message', msg)
        reassigned++
      }
    }

    return new Response(JSON.stringify({ ok: true, reassigned }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── SET ROLE ────────────────────────────────────────────────────────────────
  if (body.action === 'set_role') {
    if (!body.seller_id || !body.role_label) return new Response('Missing fields', { status: 400, headers: corsHeaders })
    if (!(await targetInScope(body.seller_id))) return new Response('Forbidden', { status: 403, headers: corsHeaders })
    await supabase.from('sellers').update({ role_label: body.role_label }).eq('auth_user_id', body.seller_id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── SET AVATAR (update the photo of a member you manage / act as) ───────────
  if (body.action === 'set_avatar') {
    if (!body.seller_id || !body.avatar_url) return new Response('Missing fields', { status: 400, headers: corsHeaders })
    if (!(await targetInScope(body.seller_id))) return new Response('Forbidden', { status: 403, headers: corsHeaders })
    await supabase.from('sellers').update({ avatar_url: body.avatar_url }).eq('auth_user_id', body.seller_id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── CREATE MEMBER ───────────────────────────────────────────────────────────
  if (body.action === 'create') {
    if (!body.email || !body.password || !body.nombre || !body.role_label) {
      return new Response('Missing fields', { status: 400, headers: corsHeaders })
    }
    // A store admin can only create members in their own store; only the super
    // admin may target another store explicitly.
    const storeId = (admin.is_super_admin && body.store_id) ? body.store_id : admin.store_id
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })
    if (authErr || !created?.user) {
      return new Response(JSON.stringify({ error: authErr?.message ?? 'auth_create_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { error: sErr } = await supabase.from('sellers').insert({
      auth_user_id: created.user.id,
      store_id: storeId,
      nombre: body.nombre,
      role_label: body.is_admin ? 'Admin' : body.role_label,
      is_admin: !!body.is_admin,   // never super_admin — brand admins are store-scoped
      active: true,
      available: true,
    })
    if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ ok: true, auth_user_id: created.user.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response('Unknown action', { status: 400, headers: corsHeaders })
})
