import { createClient } from 'npm:@supabase/supabase-js@2'
import { createBusiness, pay360BaseUrl, pickPartnerKey, type Pay360Env } from '../_shared/pay360.ts'
import { shalomApiKey } from '../_shared/shalom.ts'
import { administraLaPlataforma, TIENDA_PLATAFORMA } from '../_shared/alcance.ts'

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
    action: 'list' | 'create' | 'update' | 'delete' | 'wa_usage' | 'client_stats' | 'ab_stats' | 'shalom_status' | 'olva_status'
    home_delivery_enabled?: boolean
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
    /** delete: el `slug` de la tienda, tecleado por quien borra. Ver la acción. */
    confirmar?: string
    wa_enabled?: boolean
    wa_phone_number_id?: string
    wa_display_phone?: string
    wa_business_account_id?: string
    // Cobros — la cuenta de 360pay de la marca. SOLO por JWT
    // verificado (ver abajo): redirigir el cobro de una tienda es
    // desviar su dinero, no cambiarle el logo.
    pay360_enabled?: boolean
    pay360_env?: string                // 'sandbox' | 'live'
    /** Da de alta la marca como negocio en 360pay. Ver `connectPay360`. */
    pay360_connect?: { payment_prefix?: string; name?: string }
    // Envíos — la cuenta Shalom Pro del cliente. SOLO por JWT verificado
    // (mismo trato que los cobros). `null` = desconectar. El password se
    // guarda en `store_secrets` y jamás vuelve en ninguna respuesta.
    shalom_pro?: { email?: string; password?: string } | null
    // Interruptor de la guía automática (sección 27.d). Emite envíos REALES y
    // cobrables: mismo trato que los campos de cobro (JWT verificado).
    shalom_auto_guide_enabled?: boolean
    // Reparto del experimento A/B: 'SPLIT' | 'A' | 'B'. No es un campo de
    // cobro — mueve tráfico entre dos versiones del checkout, no dinero.
    checkout_ab_mode?: string
    // ─── Pixel y anuncios (Meta / TikTok) ────────────────────────────────────
    // Los IDs de pixel son PÚBLICOS (viajan al navegador): cualquier admin de la
    // marca los edita. Los tokens de CAPI son SECRETOS: van en `store_secrets`,
    // SOLO por JWT verificado (mismo trato que Shalom Pro), y jamás vuelven.
    // `null` en `ads_capi` los limpia. Ver docs/09-PIXELS-CAPI.md.
    meta_pixel_id?: string
    tiktok_pixel_id?: string
    ads_capi?: { meta_token?: string; tiktok_token?: string; meta_test_code?: string; tiktok_test_code?: string } | null
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
    .select('is_admin, is_super_admin, is_operator, store_id')
    .eq('auth_user_id', callerId)
    .maybeSingle()

  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  // Alcance: su tienda, o todas. Lo responde `alcance.ts` y no la bandera suelta
  // —un operador de Kross administra la plataforma igual que el dueño, y desde
  // el 29-ago eso incluye apagar y encender tiendas: es trabajo de operar y se
  // deshace. Lo único que no puede es repartir mando, y de eso responde
  // `admin-team`, no esta función.
  const isSuper = administraLaPlataforma(me)

  // ─── LIST STORES ───────────────────────────────────────────────────────────
  // Super admin sees every brand; a store admin sees only their own.
  if (body.action === 'list') {
    const q = supabase.from('stores')
      .select('id, slug, nombre, logo_url, notif_icon_url, color_primary, color_dark, active, created_at, wa_enabled, wa_phone_number_id, wa_display_phone, wa_business_account_id, welcome_points, welcome_msg, checkout_ab_mode, home_delivery_enabled, pay360_enabled, pay360_env, pay360_business_id, pay360_payment_prefix, meta_pixel_id, tiktok_pixel_id, shalom_auto_guide_enabled')
      .order('created_at', { ascending: true })
    if (!isSuper) q.eq('id', me.store_id)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 400)

    // Estado de la cuenta Shalom Pro de cada marca. Vive en `store_secrets`
    // (stores es de SELECT público) y se mezcla aquí: email y veredicto sí,
    // el password JAMÁS.
    const stores = data ?? []
    if (stores.length > 0) {
      const { data: secs } = await supabase.from('store_secrets')
        .select('store_id, shalom_pro_email, shalom_pro_status, shalom_pro_checked_at, meta_capi_token, tiktok_capi_token')
        .in('store_id', stores.map((s: { id: string }) => s.id))
      const byId = new Map((secs ?? []).map((s: Record<string, unknown>) => [s.store_id, s]))
      for (const s of stores as Record<string, unknown>[]) {
        const sec = byId.get(s.id as string)
        s.shalom_pro_email = sec?.shalom_pro_email ?? null
        s.shalom_pro_status = sec?.shalom_pro_status ?? null
        s.shalom_pro_checked_at = sec?.shalom_pro_checked_at ?? null
        // CAPI: solo PRESENCIA del token, jamás el token. Igual que el password
        // de Shalom Pro, el secreto se escribe pero nunca vuelve al panel.
        s.meta_capi_configured = !!sec?.meta_capi_token
        s.tiktok_capi_configured = !!sec?.tiktok_capi_token
      }
    }

    return json({ stores, is_super: isSuper })
  }

  // ─── SHALOM STATUS (semáforo verde/rojo de la API de tracking/envíos) ───────
  // Salud del proveedor (healthz es público, sin auth). Cuando está en rojo, el
  // panel muestra el plan de contingencia manual: la guía se registra igual (el
  // barrido la vigila solo cuando vuelva) y el estado se consulta a mano.
  if (body.action === 'shalom_status') {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    let operational = false
    try {
      const r = await fetch('https://api.shalom-api-peru.com/healthz', { signal: ctrl.signal })
      operational = r.ok
    } catch { /* caído o timeout: queda false */ }
    clearTimeout(t)
    return json({ operational, checked_at: new Date().toISOString() })
  }

  // ─── OLVA STATUS (mismo semáforo, otro proveedor) ───────────────────────────
  // A diferencia de Shalom Pro, Olva no tiene NADA que configurar por marca: su
  // key es de la plataforma (Vault, sección 21) y no existe cuenta del cliente.
  // El panel solo necesita saber si el proveedor está vivo — en rojo, plan B
  // manual (la guía se registra igual; el barrido la vigila cuando vuelva).
  if (body.action === 'olva_status') {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    let operational = false
    try {
      const r = await fetch('https://api.olva-api-peru.com/healthz', { signal: ctrl.signal })
      operational = r.ok
    } catch { /* caído o timeout: queda false */ }
    clearTimeout(t)
    return json({ operational, checked_at: new Date().toISOString() })
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
    // Apagar una marca detiene su app ese mismo segundo, y por eso es de quien
    // administra la plataforma y no del admin de la marca. Pero **se deshace
    // tocando otra vez**, así que no hace falta más ceremonia: el operador
    // también apaga (ver §30). Lo que no se deshace es BORRAR, y eso tiene su
    // propia acción con sus propios seguros, más abajo.
    if (isSuper && typeof body.active === 'boolean') patch.active = body.active
    // ¿Reparte a domicilio, o solo recojo en agencia? Es super-admin only a
    // propósito: depende de si la marca tiene operación de última milla
    // contratada, un hecho comercial que conoce la plataforma. Que un admin de
    // marca lo prendiera sin tener con quién repartir prometería entregas a la
    // puerta que después no ocurren.
    if (isSuper && typeof body.home_delivery_enabled === 'boolean') {
      patch.home_delivery_enabled = body.home_delivery_enabled
    }
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

    // ─── Cobros: la cuenta de 360pay de la marca ─────────────────────────────
    // Cualquier admin gestiona los de SU tienda, pero SOLO con JWT verificado:
    // el camino legacy usa un id que cualquiera lee con la anon key, y estos
    // campos redirigen dinero.
    const touchesPayments = body.pay360_enabled !== undefined
      || body.pay360_env !== undefined || body.pay360_connect !== undefined
    if (touchesPayments && !trusted) return json({ error: 'auth_requerida' }, 403)

    // ─── Envíos: la cuenta Shalom Pro de la marca ────────────────────────────
    // Mismo trato que los cobros: SOLO por JWT verificado — son las
    // credenciales del cliente en pro.shalom.pe. Se guardan en `store_secrets`
    // (stores es de SELECT público) y el password jamás vuelve al panel.
    if (body.shalom_pro !== undefined && !trusted) return json({ error: 'auth_requerida' }, 403)
    // El interruptor de la guía automática. Cada guía que emite se cobra, así
    // que exige el mismo JWT verificado que el dinero — y va en `stores` porque
    // no es un secreto: el panel lo lee para pintar el switch.
    if (body.shalom_auto_guide_enabled !== undefined) {
      if (!trusted) return json({ error: 'auth_requerida' }, 403)
      patch.shalom_auto_guide_enabled = body.shalom_auto_guide_enabled === true
    }
    let wroteShalom = false
    if (body.shalom_pro === null) {
      const { error: clrErr } = await supabase.from('store_secrets').upsert({
        store_id: targetId,
        shalom_pro_email: null, shalom_pro_password: null,
        shalom_pro_status: null, shalom_pro_checked_at: null,
      }, { onConflict: 'store_id' })
      if (clrErr) return json({ error: clrErr.message }, 400)
      wroteShalom = true
    } else if (body.shalom_pro) {
      const email = String(body.shalom_pro.email ?? '').trim().toLowerCase()
      const password = String(body.shalom_pro.password ?? '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 4) {
        return json({ error: 'shalom_credenciales_invalidas' }, 400)
      }
      const { error: upErr } = await supabase.from('store_secrets').upsert({
        store_id: targetId,
        shalom_pro_email: email, shalom_pro_password: password,
        shalom_pro_status: 'PENDING', shalom_pro_checked_at: new Date().toISOString(),
      }, { onConflict: 'store_id' })
      if (upErr) return json({ error: upErr.message }, 400)
      wroteShalom = true

      // Verificación REAL contra pro.shalom.pe, en SEGUNDO PLANO: el primer
      // login de una cuenta tarda ~90 s (hasta 2 min, dice el proveedor) y no
      // puede colgarse del guardado del panel. El veredicto queda en
      // shalom_pro_status y el panel lo refresca. UNVERIFIED = proveedor caído
      // o timeout: ni sí ni no — se reintenta guardando de nuevo.
      const verify = (async () => {
        let status = 'UNVERIFIED'
        try {
          const key = await shalomApiKey()
          if (key) {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 145_000)
            const r = await fetch('https://api.shalom-api-peru.com/v1/shalom/sessions', {
              method: 'POST',
              headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
              signal: ctrl.signal,
            })
            clearTimeout(t)
            if (r.ok) status = 'CONNECTED'
            else if (r.status === 401) status = 'FAILED' // shalom_auth_failed
            console.log('[manage-store] shalom pro verificación', targetId, r.status, '→', status)
          }
        } catch (e) {
          console.error('[manage-store] shalom pro verificación falló', targetId, e)
        }
        await supabase.from('store_secrets').update({
          shalom_pro_status: status, shalom_pro_checked_at: new Date().toISOString(),
        }).eq('store_id', targetId)
      })()
      const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
      if (rt?.waitUntil) rt.waitUntil(verify)
      else verify.catch(() => {})
    }

    // Lista blanca: el CHECK de la columna rechaza cualquier otra cosa, y un
    // 500 aquí tumbaría el guardado entero de la marca por un campo opcional.
    if (body.checkout_ab_mode === 'SPLIT' || body.checkout_ab_mode === 'A' || body.checkout_ab_mode === 'B') {
      patch.checkout_ab_mode = body.checkout_ab_mode
    }

    // ─── Pixel IDs (públicos) ─────────────────────────────────────────────────
    // Son la cuenta publicitaria de la marca: cualquier admin de la tienda los
    // edita. Viajan al navegador dentro del snippet del pixel, así que no hay
    // secreto que cuidar aquí. Vaciar el campo pausa el pixel (null).
    if (typeof body.meta_pixel_id === 'string') patch.meta_pixel_id = body.meta_pixel_id.trim() || null
    if (typeof body.tiktok_pixel_id === 'string') patch.tiktok_pixel_id = body.tiktok_pixel_id.trim() || null

    // ─── Tokens de CAPI (secretos, en store_secrets) ─────────────────────────
    // Mismo trato que Shalom Pro y los campos de cobro: SOLO por JWT verificado.
    // `null` limpia todo; un objeto setea lo que traiga. Jamás vuelven al panel.
    if (body.ads_capi !== undefined && !trusted) return json({ error: 'auth_requerida' }, 403)
    let wroteAdsCapi = false
    if (body.ads_capi === null) {
      const { error: clrErr } = await supabase.from('store_secrets').upsert({
        store_id: targetId,
        meta_capi_token: null, tiktok_capi_token: null,
        meta_test_event_code: null, tiktok_test_event_code: null,
        ads_secrets_updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id' })
      if (clrErr) return json({ error: clrErr.message }, 400)
      wroteAdsCapi = true
    } else if (body.ads_capi) {
      const a = body.ads_capi
      const patchSec: Record<string, unknown> = { store_id: targetId, ads_secrets_updated_at: new Date().toISOString() }
      if (typeof a.meta_token === 'string') patchSec.meta_capi_token = a.meta_token.trim() || null
      if (typeof a.tiktok_token === 'string') patchSec.tiktok_capi_token = a.tiktok_token.trim() || null
      if (typeof a.meta_test_code === 'string') patchSec.meta_test_event_code = a.meta_test_code.trim() || null
      if (typeof a.tiktok_test_code === 'string') patchSec.tiktok_test_event_code = a.tiktok_test_code.trim() || null
      const { error: upErr } = await supabase.from('store_secrets').upsert(patchSec, { onConflict: 'store_id' })
      if (upErr) return json({ error: upErr.message }, 400)
      wroteAdsCapi = true
    }

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
        // Se loguea la FORMA de la llave, nunca la llave: con un 401 lo que hay
        // que distinguir es "no está cargada", "vino con basura alrededor" y
        // "es válida pero rechazada", y sin esto las tres se ven igual.
        const rawKey = Deno.env.get('PAY360_PARTNER_KEY') ?? ''
        console.error('[manage-store] pay360 alta falló', JSON.stringify({
          status: created.status,
          scopes: created.requiredScopes ?? null,
          error: created.error ?? null,
          env,
          key_len: partnerKey.length,
          key_prefijo_ok: partnerKey.startsWith('pt_'),
          key_tenia_espacios: rawKey !== rawKey.trim(),
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

    // Prender el cobro exige que la tienda ya esté conectada. Sin este gate, un
    // toggle prendido "para dejarlo listo" pinta el botón de pago en toda la
    // tienda mientras `pay360-coupon` rebota cada intento, y cada comprador
    // termina con un pedido creado y sin cobrar.
    if (patch.pay360_enabled === true) {
      const { data: st } = await supabase.from('stores')
        .select('pay360_business_id').eq('id', targetId).maybeSingle()
      const connected = patch.pay360_business_id ?? st?.pay360_business_id
      if (!connected) return json({ error: 'pay360_sin_conectar' }, 400)
    }

    if (Object.keys(patch).length === 0 && !wroteSecretsPay360 && !wroteShalom && !wroteAdsCapi) return json({ error: 'nada_que_guardar' }, 400)
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
      // Las marcas nuevas nacen SOLO con recojo en agencia. El domicilio se
      // prende cuando la marca tenga con quién repartir, y lo prende la
      // plataforma. La columna tiene default `true` para no apagarle el
      // domicilio a las marcas que ya existían; el valor explícito de aquí es lo
      // que hace que eso no aplique a las nuevas.
      home_delivery_enabled: false,
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

  // ─── BORRAR UNA TIENDA ──────────────────────────────────────────────────────
  //
  // Lo único de este panel que no se deshace. Apagar detiene la app y se enciende
  // otra vez; esto se lleva la fila y, con ella, la marca. Y como `stores` casi no
  // tiene claves foráneas —solo `store_secrets` cascadea—, borrar la fila a secas
  // NO borra nada más: deja huérfanos en nueve tablas, con pedidos apuntando a una
  // tienda que ya no existe. Por eso la acción barre, y por eso barre en orden.
  //
  // Los seguros no son ceremonia: cada uno tapa una manera concreta de perder algo
  // que no vuelve.
  if (body.action === 'delete') {
    const id = body.store_id
    if (!id) return json({ error: 'no_store' }, 400)

    // 1. Solo desde la plataforma. El admin de una marca no borra su marca —
    //    dejaría de existir el negocio de su propio cliente.
    if (!isSuper) return json({ error: 'borrar_es_de_plataforma' }, 403)

    // 2. La casa no se borra. `platform` es donde vive el equipo de Kross: sin
    //    ella, "administra la plataforma" deja de tener dónde apoyarse y el
    //    borrado se lleva por delante a quien lo ejecutó. Ver `alcance.ts`.
    if (id === TIENDA_PLATAFORMA) return json({ error: 'la_plataforma_no_se_borra' }, 403)

    // 3. Ni la tuya. Vale para el caso raro de un super admin alojado en una
    //    marca: borrarla lo dejaría sin fila y sin panel.
    if (id === me.store_id) return json({ error: 'no_borres_la_tuya' }, 403)

    const { data: tienda } = await supabase
      .from('stores').select('id, slug, nombre, active').eq('id', id).maybeSingle()
    if (!tienda) return json({ error: 'no_existe' }, 404)

    // 4. Tiene que estar APAGADA. Apagar es reversible y ya avisa de lo que
    //    pasa —la app deja de vender—; encadenar los dos pasos hace que nadie
    //    borre una marca viva de un solo clic.
    if (tienda.active) return json({ error: 'apagala_primero' }, 409)

    // 5. Y sin un solo pedido ni cobro. Un `order_sessions` es una venta que
    //    existió, y un `payment_events` es plata que se recaudó bajo el contrato
    //    con 360pay: eso no es basura de pruebas, es el respaldo de un reclamo
    //    que puede llegar meses después. Si hay aunque sea uno, esta acción se
    //    niega y dice cuántos — apagada la marca ya no vende, que es lo que se
    //    quería.
    // Las dos columnas en UNA consulta, con `or`. Sumar dos conteos contaba dos
    // veces el mismo pedido —en una marca normal `store_id` y `origin_store_id`
    // son la misma tienda— y el mensaje decía "tiene 2 pedidos" de uno solo. Un
    // número inventado en la frase que impide borrar es lo peor que puede pasar
    // acá: quien lo lee deja de creerle a la pantalla.
    const { count: pedidosCount } = await supabase
      .from('order_sessions').select('id', { count: 'exact', head: true })
      .or(`store_id.eq.${id},origin_store_id.eq.${id}`)
    const pedidos = pedidosCount ?? 0
    const { count: cobrosCount } = await supabase
      .from('payment_events').select('id', { count: 'exact', head: true }).eq('store_id', id)
    const cobros = cobrosCount ?? 0
    if (pedidos > 0 || cobros > 0) return json({ error: 'tiene_historial', pedidos, cobros }, 409)

    // 6. Y hay que haber leído qué se borra. Tecleando el subdominio: un
    //    "¿seguro?" se contesta con un Enter de más, un slug no.
    if ((body.confirmar ?? '').trim().toLowerCase() !== (tienda.slug ?? '').toLowerCase()) {
      return json({ error: 'confirmacion_no_coincide' }, 400)
    }

    // El barrido. `buyer_actions` va PRIMERO porque su clave apunta a `buyers`
    // sin ON DELETE: borrar el comprador antes lo rechazaría la base.
    const { data: compradores } = await supabase.from('buyers').select('id').eq('store_id', id)
    const buyerIds = (compradores ?? []).map((b: { id: string }) => b.id)
    if (buyerIds.length > 0) await supabase.from('buyer_actions').delete().in('buyer_id', buyerIds)

    const { count: equipo } = await supabase
      .from('sellers').select('id', { count: 'exact', head: true }).eq('store_id', id)

    for (const tabla of ['buyers', 'checkout_drafts', 'notifications_log', 'call_recordings', 'complaints', 'products', 'sellers', 'store_secrets']) {
      await supabase.from(tabla).delete().eq('store_id', id)
    }
    const { error } = await supabase.from('stores').delete().eq('id', id)
    if (error) return json({ error: error.message }, 400)

    // Las cuentas de `auth.users` del equipo NO se tocan: una persona puede
    // trabajar en dos marcas, y borrarle el acceso por haber cerrado una sería
    // destruir de más desde una pantalla que habla de tiendas. Se devuelve
    // cuántas quedaron sueltas para que el panel lo diga.
    return json({ ok: true, nombre: tienda.nombre, slug: tienda.slug, equipo: equipo ?? 0 })
  }

  return new Response('Unknown action', { status: 400, headers: corsHeaders })
})
