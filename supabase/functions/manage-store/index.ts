import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// A slug is the subdomain: marca.krossclub.app → "marca". Keep it URL-safe.
function cleanSlug(raw: string): string {
  return (raw ?? '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

const RESERVED = new Set(['www', 'app', 'api', 'admin', 'kross', 'krossclub', 'mail', 'assets'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'list' | 'create' | 'update' | 'wa_usage' | 'client_stats'
    admin_auth_id: string
    welcome_points?: number
    welcome_msg?: string
    // update / create branding
    store_id?: string
    nombre?: string
    slug?: string
    logo_url?: string | null
    notif_icon_url?: string | null
    color_primary?: string
    color_dark?: string
    active?: boolean
    wa_enabled?: boolean
    wa_phone_number_id?: string
    wa_display_phone?: string
    wa_business_account_id?: string
    // create: first admin login for the new brand
    admin_email?: string
    admin_password?: string
    admin_nombre?: string
  }

  if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)

  const { data: me } = await supabase
    .from('sellers')
    .select('is_admin, is_super_admin, store_id')
    .eq('auth_user_id', body.admin_auth_id)
    .maybeSingle()

  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const isSuper = !!me.is_super_admin

  // ─── LIST STORES ───────────────────────────────────────────────────────────
  // Super admin sees every brand; a store admin sees only their own.
  if (body.action === 'list') {
    const q = supabase.from('stores')
      .select('id, slug, nombre, logo_url, notif_icon_url, color_primary, color_dark, active, created_at, wa_enabled, wa_phone_number_id, wa_display_phone, wa_business_account_id, welcome_points, welcome_msg')
      .order('created_at', { ascending: true })
    if (!isSuper) q.eq('id', me.store_id)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 400)
    return json({ stores: data ?? [], is_super: isSuper })
  }

  // ─── WHATSAPP USAGE (para el cobro 2x por plantilla) ─────────────────────────
  // Cuenta las plantillas ENVIADAS por tienda en el mes actual. Super admin ve
  // todas; un admin de tienda solo la suya.
  if (body.action === 'wa_usage') {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    let q = supabase.from('notifications_log').select('store_id').eq('whatsapp', 'sent').gte('created_at', start)
    if (!isSuper) q = q.eq('store_id', me.store_id)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 400)
    const usage: Record<string, number> = {}
    for (const r of data ?? []) {
      const sid = (r as { store_id: string | null }).store_id
      if (sid) usage[sid] = (usage[sid] ?? 0) + 1
    }
    return json({ usage, since: start })
  }

  // ─── CLIENT STATS (embudo de activación de retención) ────────────────────────
  if (body.action === 'client_stats') {
    const target = (isSuper && body.store_id) ? body.store_id : me.store_id
    if (!target) return json({ error: 'no_store' }, 400)
    const countWhere = async (build: (q: any) => any) => {
      const { count } = await build(supabase.from('buyers').select('id', { count: 'exact', head: true }).eq('store_id', target))
      return count ?? 0
    }
    const total = await countWhere((q: any) => q)
    const imported = await countWhere((q: any) => q.eq('source', 'import'))
    const activated = await countWhere((q: any) => q.not('activated_at', 'is', null))
    const pending = await countWhere((q: any) => q.is('activated_at', null).is('invited_at', null).not('phone', 'is', null))
    return json({ total, imported, activated, pending })
  }

  // ─── UPDATE BRANDING ─────────────────────────────────────────────────────────
  // Any admin may update their own store. Super admin may update any store and
  // may change the slug (subdomain). A store admin cannot repoint their subdomain.
  if (body.action === 'update') {
    const targetId = isSuper ? (body.store_id || me.store_id) : me.store_id
    if (!targetId) return json({ error: 'no_store' }, 400)

    const patch: Record<string, unknown> = {}
    if (typeof body.nombre === 'string' && body.nombre.trim()) patch.nombre = body.nombre.trim()
    if (body.logo_url !== undefined) patch.logo_url = body.logo_url
    if (body.notif_icon_url !== undefined) patch.notif_icon_url = body.notif_icon_url
    // Welcome reward — a store admin controls their own retention config
    if (typeof body.welcome_points === 'number') patch.welcome_points = Math.max(0, Math.floor(body.welcome_points))
    if (typeof body.welcome_msg === 'string') patch.welcome_msg = body.welcome_msg.slice(0, 200)
    if (typeof body.color_primary === 'string') patch.color_primary = body.color_primary
    if (typeof body.color_dark === 'string') patch.color_dark = body.color_dark
    if (isSuper && typeof body.active === 'boolean') patch.active = body.active
    // WhatsApp fallback config (infra) — super admin only
    if (isSuper && typeof body.wa_enabled === 'boolean') patch.wa_enabled = body.wa_enabled
    if (isSuper && typeof body.wa_phone_number_id === 'string') patch.wa_phone_number_id = body.wa_phone_number_id.trim()
    if (isSuper && typeof body.wa_display_phone === 'string') patch.wa_display_phone = body.wa_display_phone.trim()
    if (isSuper && typeof body.wa_business_account_id === 'string') patch.wa_business_account_id = body.wa_business_account_id.trim()

    if (isSuper && typeof body.slug === 'string' && body.slug.trim()) {
      const slug = cleanSlug(body.slug)
      if (!slug || RESERVED.has(slug)) return json({ error: 'slug_reservado' }, 400)
      const { data: clash } = await supabase.from('stores').select('id').eq('slug', slug).neq('id', targetId).maybeSingle()
      if (clash) return json({ error: 'slug_en_uso' }, 400)
      patch.slug = slug
    }

    if (Object.keys(patch).length === 0) return json({ error: 'nada_que_guardar' }, 400)
    const { error } = await supabase.from('stores').update(patch).eq('id', targetId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  // ─── CREATE BRAND (+ its first admin) ──────────────────────────────────────────
  // Only the platform super admin onboards new brands.
  if (body.action === 'create') {
    if (!isSuper) return new Response('Forbidden', { status: 403, headers: corsHeaders })
    if (!body.nombre?.trim() || !body.slug?.trim()) return json({ error: 'faltan_nombre_slug' }, 400)
    if (!body.admin_email?.trim() || !body.admin_password || body.admin_password.length < 6) {
      return json({ error: 'admin_invalido' }, 400)
    }

    const slug = cleanSlug(body.slug)
    if (!slug || RESERVED.has(slug)) return json({ error: 'slug_reservado' }, 400)
    const { data: clash } = await supabase.from('stores').select('id').eq('slug', slug).maybeSingle()
    if (clash) return json({ error: 'slug_en_uso' }, 400)

    const storeId = `st_${slug}_${Date.now().toString(36)}`
    const { error: sErr } = await supabase.from('stores').insert({
      id: storeId,
      slug,
      nombre: body.nombre.trim(),
      logo_url: body.logo_url ?? null,
      color_primary: body.color_primary || '#55C8F5',
      color_dark: body.color_dark || '#060C1A',
      active: true,
    })
    if (sErr) return json({ error: sErr.message }, 400)

    // Provision the brand's first admin login
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: body.admin_email.trim(),
      password: body.admin_password,
      email_confirm: true,
    })
    if (authErr || !created?.user) {
      // roll back the store so the slug isn't orphaned
      await supabase.from('stores').delete().eq('id', storeId)
      return json({ error: authErr?.message ?? 'auth_create_failed' }, 400)
    }

    const { error: selErr } = await supabase.from('sellers').insert({
      auth_user_id: created.user.id,
      store_id: storeId,
      nombre: body.admin_nombre?.trim() || body.nombre.trim(),
      role_label: 'Ventas',
      is_admin: true,
      is_super_admin: false,
      active: true,
      available: true,
    })
    if (selErr) return json({ error: selErr.message }, 400)

    return json({ ok: true, store_id: storeId, slug, admin_auth_id: created.user.id })
  }

  return new Response('Unknown action', { status: 400, headers: corsHeaders })
})
