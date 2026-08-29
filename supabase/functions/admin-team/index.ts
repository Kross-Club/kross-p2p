import { createClient } from 'npm:@supabase/supabase-js@2'
import { administraLaPlataforma } from '../_shared/alcance.ts'
import { banderasDeNivel, ES_NIVEL, type Nivel } from '../_shared/nivel.ts'

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

// Canonical role keyword. Logística also matches the legacy "Despacho" label.
function roleKeyword(roleLabel: string): string {
  const r = (roleLabel ?? '').toLowerCase()
  if (r.includes('venta')) return 'venta'
  if (r.includes('logist') || r.includes('despacho')) return 'logist'
  if (r.includes('soporte')) return 'soporte'
  if (r.includes('motoriz')) return 'motoriz'
  return r
}
const ROLE_PATTERNS: Record<string, string[]> = {
  venta: ['venta'], logist: ['logist', 'despacho'], soporte: ['soporte'], motoriz: ['motoriz'],
}
function matchesRole(roleLabel: string, keyword: string): boolean {
  const r = (roleLabel ?? '').toLowerCase()
  return (ROLE_PATTERNS[keyword] ?? [keyword]).some(p => r.includes(p))
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
    c.available !== false && matchesRole(c.role_label, keyword)
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
    action: 'set_available' | 'set_role' | 'set_level' | 'create' | 'set_avatar' | 'emails'
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
    /** create: operador — administra igual que el admin PERO no reparte mando.
     *  Ver el bloque §30 de setup-kross.sql y `src/lib/permisos.ts`. */
    is_operator?: boolean
    /** create: super admin — alcance plataforma, no una marca. Solo lo puede
     *  otorgar un super admin que NO sea operador. */
    is_super_admin?: boolean
    /** set_level: 'miembro' | 'operador' | 'admin'. Ver `nivel.ts`. */
    nivel?: Nivel
  }

  // Only an admin may run these
  const { data: admin } = await supabase
    .from('sellers').select('is_admin, is_super_admin, is_operator, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!admin?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // ─── El operador opera, pero no nombra ─────────────────────────────────────
  //
  // **El único candado que le queda** (29-ago-2026). Apagar tiendas y borrar
  // productos se le devolvieron: son trabajo de operar, y pedir permiso para
  // eso convierte el rol en un ayudante. Nombrar no: repartir mando no es
  // operar.
  //
  // Y es el que no se puede soltar. Sin esta línea el nivel entero es
  // decorativo: un operador que puede crear un administrador se crea uno y
  // entra con él, o se asciende a sí mismo, y lo que no podía hacer lo hace
  // igual dando un rodeo. Una restricción que el restringido puede levantar no
  // es una restricción.
  //
  // Va en el SERVIDOR y no solo en el panel porque el panel es una manija: el
  // POST a esta función llega igual sin pasar por ningún botón.
  const puedeNombrar = !admin.is_operator

  // Un admin de tienda solo toca a los de la SUYA. Quien administra la
  // plataforma —el dueño y los operadores de Kross— llega a todas. Ver
  // `alcance.ts`.
  async function targetInScope(sellerAuthId: string): Promise<boolean> {
    if (administraLaPlataforma(admin)) return true
    const { data: t } = await supabase
      .from('sellers').select('store_id').eq('auth_user_id', sellerAuthId).maybeSingle()
    return !!t && t.store_id === admin.store_id
  }

  // ─── EMAILS DEL EQUIPO ───────────────────────────────────────────────────────
  // El correo de cada miembro vive en `auth.users`, que el panel no puede leer:
  // hace falta el service role. Sin esto, un admin no tiene forma de saber con
  // qué dirección creó una cuenta — y esa dirección es justo lo que hay que
  // escribir para recuperar la contraseña. Se devuelven SOLO los del equipo que
  // ese admin administra.
  if (body.action === 'emails') {
    const storeId = (administraLaPlataforma(admin) && body.store_id) ? body.store_id : admin.store_id
    const { data: members } = await supabase
      .from('sellers').select('auth_user_id').eq('store_id', storeId).not('auth_user_id', 'is', null)

    const ids = [...new Set((members ?? []).map((m: any) => m.auth_user_id as string))]
    const found = await Promise.all(ids.map(async id => {
      const { data } = await supabase.auth.admin.getUserById(id)
      return [id, data?.user?.email ?? null] as const
    }))

    const emails = Object.fromEntries(found.filter(([, email]) => email))
    return new Response(JSON.stringify({ ok: true, emails }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
    // `set_role` SOLO escribe la etiqueta, nunca las banderas — así ha sido
    // siempre y por eso no es una vía de escalada. Se deja dicho porque es lo
    // primero que uno mira al preguntarse si un operador puede ascender a
    // alguien: no puede, ni a otro ni a sí mismo.
    await supabase.from('sellers').update({ role_label: body.role_label }).eq('auth_user_id', body.seller_id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ─── SET LEVEL — miembro ↔ operador ↔ admin ─────────────────────────────────
  //
  // Lo que faltaba: el nivel solo se daba AL CREAR. Si el alta salía a medias
  // —una función vieja que ignoró en silencio las banderas que no conocía— la
  // cuenta quedaba sin nivel y **no había forma de arreglarla desde el panel**:
  // hacía falta un UPDATE a mano en la base. Pasó, y costó una semana.
  //
  // Quién puede: quien nombra, o sea un admin que NO sea operador. Es la misma
  // puerta que `create` con mando (un operador que puede promover se promueve a
  // sí mismo y su límite dura un clic) y por eso comparte `puedeNombrar`.
  if (body.action === 'set_level') {
    if (!body.seller_id || !ES_NIVEL(body.nivel)) return new Response('Missing fields', { status: 400, headers: corsHeaders })
    if (!puedeNombrar) {
      return new Response(JSON.stringify({ error: 'operador_no_nombra' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Cambiarse el nivel a uno mismo no: bajarse deja la tienda sin quien
    // administre —posiblemente sin nadie— y no hay quien lo deshaga.
    if (body.seller_id === body.admin_auth_id) {
      return new Response(JSON.stringify({ error: 'no_a_ti_mismo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!(await targetInScope(body.seller_id))) return new Response('Forbidden', { status: 403, headers: corsHeaders })

    const { data: target } = await supabase
      .from('sellers').select('store_id, role_label').eq('auth_user_id', body.seller_id).maybeSingle()
    if (!target) return new Response('Not found', { status: 404, headers: corsHeaders })

    // El alcance sale de la tienda del TARGET, no de la de quien manda: pasar a
    // operador a alguien de una marca lo hace operador de esa marca.
    const banderas = banderasDeNivel(body.nivel, target.store_id)
    // La etiqueta sigue al nivel cuando el nivel manda; al volver a miembro se
    // conserva la que tenía si aún dice algo, porque `role_label` es su oficio
    // (Logística) y no su nivel.
    const role_label = body.nivel === 'operador' ? 'Operador'
      : body.nivel === 'admin' ? 'Admin'
      : (target.role_label === 'Operador' || target.role_label === 'Admin') ? (body.role_label ?? 'Logística') : target.role_label

    const { error } = await supabase.from('sellers')
      .update({ ...banderas, role_label }).eq('auth_user_id', body.seller_id)
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ ok: true, ...banderas, role_label }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
    // Un admin de tienda solo da de alta en la suya; apuntar a otra tienda
    // explícitamente es de quien administra la plataforma.
    const storeId = (administraLaPlataforma(admin) && body.store_id) ? body.store_id : admin.store_id

    // Qué nivel se está pidiendo, y quién puede otorgarlo.
    //
    //   miembro   → cualquier admin, operador incluido: crear a alguien que
    //               atiende pedidos es trabajo de operar, no de mandar.
    //   operador  → solo un admin que no sea operador.
    //   admin     → íd.
    //   super     → además, quien lo otorga tiene que ser super. No se puede
    //               dar un alcance más grande que el propio.
    const pideMando = !!body.is_admin || !!body.is_operator || !!body.is_super_admin
    if (pideMando && !puedeNombrar) {
      return new Response(JSON.stringify({ error: 'operador_no_nombra' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (body.is_super_admin && !administraLaPlataforma(admin)) {
      return new Response(JSON.stringify({ error: 'alcance_insuficiente' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
    // El operador ES admin: `is_admin` en true, `is_operator` en true. No es un
    // tercer estado suelto — es "administra" con "no nombra" encima, que es lo
    // que hace que todos los `is_admin` ya escritos valgan para él.
    //
    // Las banderas las arma `nivel.ts`, el mismo sitio que las arma en
    // `set_level`: dos maneras de escribir lo mismo es como se llega a filas que
    // no son ninguno de los tres niveles.
    const operador = !!body.is_operator
    const esAdmin = operador || !!body.is_admin
    const banderas = banderasDeNivel(operador ? 'operador' : esAdmin ? 'admin' : 'miembro', storeId)
    const { error: sErr } = await supabase.from('sellers').insert({
      auth_user_id: created.user.id,
      store_id: storeId,
      nombre: body.nombre,
      role_label: operador ? 'Operador' : body.is_admin ? 'Admin' : body.role_label,
      // El alcance sale de DÓNDE se le da de alta: quien entra en la tienda de
      // la plataforma administrando, administra la plataforma. Antes había que
      // pedirlo aparte con `is_super_admin` — y cuando el panel ya lo mandaba
      // pero esta función todavía no lo leía, la fila quedaba en la plataforma
      // SIN alcance: una cuenta que ni entraba por krossclub.app ni tenía marca
      // por donde entrar. Ver `alcance.ts`.
      //
      // Un admin de marca sigue siendo de su marca: `storeId` es la suya, y solo
      // quien ya administra la plataforma puede apuntar a otra tienda.
      ...banderas,
      is_super_admin: banderas.is_super_admin || !!body.is_super_admin,
      active: true,
      available: true,
    })
    if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ ok: true, auth_user_id: created.user.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response('Unknown action', { status: 400, headers: corsHeaders })
})
