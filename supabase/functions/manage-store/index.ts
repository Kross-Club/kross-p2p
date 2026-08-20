import { createClient } from 'npm:@supabase/supabase-js@2'
import { createBusiness, pay360BaseUrl, pickPartnerKey, type Pay360Env } from '../_shared/pay360.ts'

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
    action: 'list' | 'create' | 'update' | 'wa_usage' | 'client_stats' | 'ab_stats'
    admin_auth_id: string
    welcome_points?: number
    welcome_msg?: string
    points_rate?: number
    restock_days?: number
    winback_days?: number
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
    // Cobros — número de Yape de la marca y cuenta Culqi. SOLO por JWT
    // verificado (ver abajo): redirigir el Yape o la sk de una tienda es
    // desviar su dinero, no cambiarle el logo.
    yape_number?: string
    yape_holder?: string
    yape_qr_url?: string | null
    culqi_enabled?: boolean
    culqi_scope?: string           // 'PROVINCIA' | 'ALL'
    culqi_public_key?: string | null   // WRITE-ONLY; null = borrar llaves
    culqi_secret_key?: string | null   // WRITE-ONLY; null = borrar llaves
    pay360_enabled?: boolean
    pay360_env?: string                // 'sandbox' | 'live'
    /** Da de alta la marca como negocio en 360pay. Ver `connectPay360`. */
    pay360_connect?: { payment_prefix?: string; name?: string }
    // Reparto del experimento A/B: 'SPLIT' | 'A' | 'B'. No es un campo de
    // cobro — mueve tráfico entre dos versiones del checkout, no dinero.
    checkout_ab_mode?: string
    // create: first admin login for the new brand
    admin_email?: string
    admin_password?: string
    admin_nombre?: string
  }

  // ─── Identidad del que llama ───────────────────────────────────────────────
  // El camino REAL es el JWT del vendedor en el Authorization: se verifica
  // contra Auth y se ignora cualquier id del body. El camino legacy
  // (body.admin_auth_id + anon key) existía desde antes y `sellers` tiene
  // SELECT público, así que ese id lo conoce cualquiera: se tolera SOLO para
  // los campos que ya gestionaba (branding/retención) mientras el front viejo
  // siga desplegado, y JAMÁS para los campos de cobro. Retirarlo del todo es
  // deuda anotada en docs/01-SALES-ENGINE.md §3.3.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  let callerId: string | null = null
  let trusted = false
  if (bearer) {
    const { data: authed } = await supabase.auth.getUser(bearer)
    if (authed?.user) { callerId = authed.user.id; trusted = true }
  }
  if (!callerId) {
    if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)
    callerId = body.admin_auth_id
    console.warn('[manage-store] auth legacy por admin_auth_id (deprecado) · action=' + body.action)
  }

  const { data: me } = await supabase
    .from('sellers')
    .select('is_admin, is_super_admin, store_id')
    .eq('auth_user_id', callerId)
    .maybeSingle()

  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const isSuper = !!me.is_super_admin

  // ─── LIST STORES ───────────────────────────────────────────────────────────
  // Super admin sees every brand; a store admin sees only their own.
  if (body.action === 'list') {
    const q = supabase.from('stores')
      .select('id, slug, nombre, logo_url, notif_icon_url, color_primary, color_dark, active, created_at, wa_enabled, wa_phone_number_id, wa_display_phone, wa_business_account_id, welcome_points, welcome_msg, yape_number, yape_holder, yape_qr_url, culqi_enabled, culqi_scope, checkout_ab_mode, pay360_enabled, pay360_env, pay360_business_id, pay360_payment_prefix')
      .order('created_at', { ascending: true })
    if (!isSuper) q.eq('id', me.store_id)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 400)

    // ¿La tienda tiene su llave secreta configurada? Se deriva SIN traer la
    // llave: seleccionar solo store_id de las filas donde existe. Traer la sk
    // a memoria para computar un boolean es dejarla a un console.log de
    // distancia de la respuesta.
    const ids = (data ?? []).map(s => (s as { id: string }).id)
    const configured = new Set<string>()
    if (ids.length) {
      const { data: rows } = await supabase.from('store_secrets')
        .select('store_id').in('store_id', ids).not('culqi_secret_key', 'is', null)
      for (const r of rows ?? []) configured.add((r as { store_id: string }).store_id)
    }
    const enriched = (data ?? []).map(s => ({
      ...s, culqi_secret_configured: configured.has((s as { id: string }).id),
    }))
    return json({ stores: enriched, is_super: isSuper })
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

  // ─── AB STATS (qué versión del checkout convierte más) ───────────────────────
  // Numerador: pedidos por variante. Denominador: leads parciales por variante
  // (`checkout_drafts`, que se guarda apenas el WhatsApp es válido). Sin el
  // denominador solo se sabe cuántos pedidos hizo cada versión, no sobre cuánta
  // gente: una variante puede ganar solo porque le tocó más tráfico ese día.
  //
  // Dos precauciones para que el número no mienta:
  //   · `since` = el primer lead marcado con variante. Los pedidos se cuentan
  //     desde ahí. Sin esto, los pedidos viejos (que sí traen variante) se
  //     dividirían entre leads que nunca la tuvieron y la tasa saldría inflada.
  //   · El corte de PROVINCIA es el que vale: la variante solo cambia el flujo
  //     ahí (en B el comprador elige domicilio o agencia; en A lo decide la
  //     cobertura). En Lima las dos son idénticas y solo agregan ruido.
  if (body.action === 'ab_stats') {
    const target = (isSuper && body.store_id) ? body.store_id : me.store_id
    if (!target) return json({ error: 'no_store' }, 400)

    const { data: first } = await supabase
      .from('checkout_drafts')
      .select('created_at')
      .eq('store_id', target).not('checkout_variant', 'is', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    const since = (first as { created_at: string } | null)?.created_at ?? null

    const count = async (table: string, build: (q: any) => any) => {
      const { count: n } = await build(
        supabase.from(table).select('order_id', { count: 'exact', head: true }).eq('store_id', target),
      )
      return n ?? 0
    }

    const PROVINCIA_DISPATCH = ['AGENCIA_PROVINCIA', 'MOTORIZADO_PROVINCIA']
    const porVariante = async (v: 'A' | 'B') => {
      if (!since) return { leads: 0, pedidos: 0, leadsProvincia: 0, pedidosProvincia: 0 }
      const draft = (q: any) => q.eq('checkout_variant', v)
      const order = (q: any) => q.eq('checkout_variant', v).gte('created_at', since)
      return {
        leads: await count('checkout_drafts', draft),
        leadsProvincia: await count('checkout_drafts', (q: any) => draft(q).eq('location_type', 'PROVINCIA')),
        pedidos: await count('order_sessions', order),
        pedidosProvincia: await count('order_sessions', (q: any) => order(q).in('dispatch_type', PROVINCIA_DISPATCH)),
      }
    }

    return json({ since, A: await porVariante('A'), B: await porVariante('B') })
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
    if (typeof body.points_rate === 'number') patch.points_rate = Math.max(0, body.points_rate)
    if (typeof body.restock_days === 'number') patch.restock_days = Math.max(1, Math.floor(body.restock_days))
    if (typeof body.winback_days === 'number') patch.winback_days = Math.max(1, Math.floor(body.winback_days))
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

    // ─── Cobros: Yape de la marca + cuenta Culqi ──────────────────────────────
    // Cualquier admin gestiona los de SU tienda, pero SOLO con JWT verificado:
    // el camino legacy usa un id que cualquiera lee con la anon key, y estos
    // campos redirigen dinero.
    const touchesPayments = body.yape_number !== undefined || body.yape_holder !== undefined
      || body.yape_qr_url !== undefined || body.culqi_enabled !== undefined
      || body.culqi_scope !== undefined || body.culqi_public_key !== undefined
      || body.culqi_secret_key !== undefined || body.pay360_enabled !== undefined
      || body.pay360_env !== undefined || body.pay360_connect !== undefined
    if (touchesPayments && !trusted) return json({ error: 'auth_requerida' }, 403)

    if (typeof body.yape_number === 'string') patch.yape_number = body.yape_number.replace(/\D/g, '').slice(0, 9) || null
    if (typeof body.yape_holder === 'string') patch.yape_holder = body.yape_holder.trim() || null
    if (body.yape_qr_url !== undefined) patch.yape_qr_url = body.yape_qr_url
    if (typeof body.culqi_enabled === 'boolean') patch.culqi_enabled = body.culqi_enabled
    if (body.culqi_scope === 'PROVINCIA' || body.culqi_scope === 'ALL') patch.culqi_scope = body.culqi_scope
    // Lista blanca: el CHECK de la columna rechaza cualquier otra cosa, y un
    // 500 aquí tumbaría el guardado entero de la marca por un campo opcional.
    if (body.checkout_ab_mode === 'SPLIT' || body.checkout_ab_mode === 'A' || body.checkout_ab_mode === 'B') {
      patch.checkout_ab_mode = body.checkout_ab_mode
    }

    let wroteSecrets = false
    let wroteSecretsPay360 = false
    if (typeof body.pay360_enabled === 'boolean') patch.pay360_enabled = body.pay360_enabled
    if (body.pay360_env === 'sandbox' || body.pay360_env === 'live') patch.pay360_env = body.pay360_env

    // ─── Alta en 360pay ───────────────────────────────────────────────────────
    // Se hace ACÁ y no con un curl a mano por una razón concreta: la respuesta
    // trae los `hook_signing_secrets` UNA SOLA VEZ, y si no se capturan en ese
    // instante la única salida es rotarlos. Un flujo manual pierde ese secreto
    // en cuanto alguien cierra la terminal.
    if (body.pay360_connect) {
      const { data: existing } = await supabase.from('stores')
        .select('nombre, pay360_business_id, pay360_env').eq('id', targetId).maybeSingle()
      // Re-dar de alta crearía un SEGUNDO negocio en 360pay para la misma marca,
      // con su propio prefijo: los cupones viejos quedarían huérfanos y el
      // dinero llegaría partido entre dos cuentas.
      if (existing?.pay360_business_id) return json({ error: 'pay360_ya_conectado' }, 409)

      const prefix = String(body.pay360_connect.payment_prefix ?? '').trim().toUpperCase()
      if (!/^[A-Z0-9]{3}$/.test(prefix)) return json({ error: 'pay360_prefijo_invalido' }, 400)

      const env: Pay360Env = (patch.pay360_env ?? existing?.pay360_env) === 'live' ? 'live' : 'sandbox'
      // El negocio se crea CONTRA UN AMBIENTE, y el de sandbox no existe en
      // producción: darlo de alta con la llave equivocada deja un business_id
      // que apunta a la nada el día que se cobre de verdad.
      const partnerKey = pickPartnerKey(
        env,
        Deno.env.get('PAY360_PARTNER_KEY') ?? '',
        Deno.env.get('PAY360_PARTNER_KEY_LIVE') ?? '',
      )
      if (!partnerKey) return json({ error: 'pay360_sin_llave_partner' }, 400)

      // El nombre del comercio en 360pay puede no ser el de la marca en Kross:
      // allá es una razón comercial frente al banco, acá es el rótulo de la
      // tienda. Por defecto se hereda, pero se puede fijar.
      const bizName = String(body.pay360_connect.name ?? existing?.nombre ?? targetId).trim().slice(0, 80)
      if (!bizName) return json({ error: 'pay360_nombre_invalido' }, 400)

      const created = await createBusiness(pay360BaseUrl(env, 'partner'), partnerKey, {
        business: { name: bizName, payment_prefix: prefix },
        config: {},
        hooks: [{
          type: 'PAYMENT_PAID',
          url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/pay360-webhook`,
          active: true,
        }],
      })
      if (!created.ok) {
        console.error('[manage-store] pay360 alta falló', JSON.stringify({
          status: created.status, scopes: created.requiredScopes ?? null,
        }))
        return json({ error: 'pay360_alta_fallo', detalle: created.error ?? null }, 502)
      }

      const hook = created.data.hook_signing_secrets?.[0]
      const { error: secErr } = await supabase.from('store_secrets').upsert({
        store_id: targetId,
        pay360_hook_id: hook?.hook_id ?? created.data.hook_ids?.[0] ?? null,
        pay360_hook_secret: hook?.signing_secret ?? null,
        pay360_secrets_updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id' })
      if (secErr) return json({ error: secErr.message }, 400)

      patch.pay360_business_id = created.data.business_id
      patch.pay360_payment_prefix = created.data.payment_prefix ?? prefix
      patch.pay360_env = env
      wroteSecretsPay360 = true
    }

    // Llaves WRITE-ONLY. '' u omitido = no tocar la guardada; null = borrarlas
    // (y con ellas se apaga el cobro: unas llaves borradas con el toggle
    // prendido dejarían a toda la tienda pidiendo códigos que nunca cobran).
    const wipeKeys = body.culqi_public_key === null || body.culqi_secret_key === null
    const culqiPk = typeof body.culqi_public_key === 'string' ? body.culqi_public_key.trim() : ''
    const culqiSk = typeof body.culqi_secret_key === 'string' ? body.culqi_secret_key.trim() : ''
    if (culqiPk && !/^pk_(test|live)_/.test(culqiPk)) return json({ error: 'culqi_pk_invalida' }, 400)
    if (culqiSk && !/^sk_(test|live)_/.test(culqiSk)) return json({ error: 'culqi_sk_invalida' }, 400)
    if (culqiPk && culqiSk) {
      const env = (k: string) => (k.includes('_live_') ? 'live' : 'test')
      // pk_live + sk_test pasa ambos regex y deja a la tienda cobrando contra
      // dos entornos: fallo silencioso en producción.
      if (env(culqiPk) !== env(culqiSk)) return json({ error: 'culqi_env_mismatch' }, 400)
    }

    if (wipeKeys) {
      const { error } = await supabase.from('store_secrets')
        .update({ culqi_public_key: null, culqi_secret_key: null, culqi_keys_updated_at: new Date().toISOString() })
        .eq('store_id', targetId)
      if (error) return json({ error: error.message }, 400)
      patch.culqi_enabled = false
      wroteSecrets = true
    } else if (culqiPk || culqiSk) {
      const secretPatch: Record<string, unknown> = { store_id: targetId, culqi_keys_updated_at: new Date().toISOString() }
      if (culqiPk) secretPatch.culqi_public_key = culqiPk
      if (culqiSk) secretPatch.culqi_secret_key = culqiSk
      const { error } = await supabase.from('store_secrets').upsert(secretPatch, { onConflict: 'store_id' })
      if (error) return json({ error: error.message }, 400)
      wroteSecrets = true
    }

    // Prender el cobro exige que las DOS llaves existan YA. Sin este gate, un
    // toggle prendido "para dejarlo listo" pinta el formulario de código de
    // aprobación en toda la tienda mientras culqi-charge rebota cada intento —
    // y cada comprador termina con un pedido creado sin cobrar.
    if (patch.culqi_enabled === true) {
      const { data: sec } = await supabase.from('store_secrets')
        .select('store_id').eq('store_id', targetId)
        .not('culqi_public_key', 'is', null).not('culqi_secret_key', 'is', null)
        .maybeSingle()
      if (!sec) return json({ error: 'culqi_sin_llaves' }, 400)
    }

    // Mismo gate que Culqi, por la misma razón: un toggle prendido "para
    // dejarlo listo" pinta el botón de pago en toda la tienda mientras
    // `pay360-coupon` rebota cada intento, y cada comprador termina con un
    // pedido creado y sin cobrar.
    if (patch.pay360_enabled === true) {
      const { data: st } = await supabase.from('stores')
        .select('pay360_business_id').eq('id', targetId).maybeSingle()
      const connected = patch.pay360_business_id ?? st?.pay360_business_id
      if (!connected) return json({ error: 'pay360_sin_conectar' }, 400)
    }

    if (Object.keys(patch).length === 0 && !wroteSecrets && !wroteSecretsPay360) return json({ error: 'nada_que_guardar' }, 400)
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('stores').update(patch).eq('id', targetId)
      if (error) return json({ error: error.message }, 400)
    }
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
