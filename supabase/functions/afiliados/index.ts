// ─── AFILIADOS · La API del programa ─────────────────────────────────────────
//
// Una sola función para las dos pantallas —la del afiliado (`/afiliado`) y la
// de quien administra la plataforma (`Panel → Afiliados`)— porque leen LO MISMO
// con distinto alcance. Dos funciones sobre las mismas tablas se separan en la
// primera semana: la del admin arreglaría un conteo y la del afiliado seguiría
// enseñando el viejo, y el que reclama es el que cobra.
//
// **Quién puede qué**, y las dos preguntas son distintas:
//
//   · `administraLaPlataforma` (`_shared/alcance.ts`) → lo ve todo, cierra
//     meses, atribuye tiendas. Es la misma llave que abre `Tiendas` y
//     `Conexiones`; el programa de afiliados es de la plataforma, no de una
//     marca — el admin de una tienda no tiene nada que hacer acá.
//   · una fila en `affiliates` con su `auth_user_id` → ve LO SUYO: su enlace,
//     sus tiendas, su mes y su rama. Nunca la tabla, nunca los correos de los
//     otros, nunca las notas que el admin escribió sobre él.
//
// ⚠️ **Acá no se acumula nada.** La comisión del mes en curso se CUENTA de
// `cobros` en cada llamada, y por eso siempre está al día. Lo único que se
// congela es el mes cerrado (`liquidar`), y se congela por una razón: una vez
// que se le prometió un número a una persona, un cobro anulado el mes siguiente
// no puede cambiarlo. Ver §51 del esquema.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { administraLaPlataforma } from '../_shared/alcance.ts'
import {
  TARIFA_AFILIADO, PRECIO_PLAN_USD,
  esCodigoValido, normalizarCodigo, enlaceDeAfiliado,
  periodoDe, esPeriodo, rangoDelPeriodo, tramosDelPeriodo,
  estadoDeSuscripcion, liquidacionDe, cerrariaCiclo,
  arbolDeAfiliados, aplanarArbol, descendientesDe,
  type AporteDeTienda, type NodoDeAfiliado,
} from '../_shared/afiliados.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ─── Quién llama ─────────────────────────────────────────────────────────────

interface Quien {
  userId: string
  email: string | null
  /** Administra la plataforma. */
  admin: boolean
  /** Su fila en `affiliates`, si es afiliado. */
  afiliado: { id: string; codigo: string; nombre: string } | null
}

async function quienLlama(req: Request): Promise<Quien | null> {
  const bearer = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!bearer) return null
  const { data: authed } = await supabase.auth.getUser(bearer)
  const user = authed?.user
  if (!user) return null

  // Las dos preguntas se hacen en paralelo porque son independientes: alguien
  // puede ser las dos cosas (el dueño de Kross que además tiene su enlace).
  const [{ data: seller }, { data: afiliado }] = await Promise.all([
    supabase.from('sellers')
      .select('store_id, is_admin, is_super_admin')
      .eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('affiliates')
      .select('id, codigo, nombre')
      .eq('auth_user_id', user.id).eq('active', true).maybeSingle(),
  ])

  return {
    userId: user.id,
    email: user.email ?? null,
    admin: administraLaPlataforma(seller),
    afiliado: afiliado ?? null,
  }
}

// ─── Contar lo que se debe ───────────────────────────────────────────────────

/**
 * Cuántos cobros entraron para esta tienda en este rango.
 *
 * `head: true` con `count: 'exact'`: cuenta en Postgres y no trae ni una fila.
 * Una tienda de mil pedidos al día hace decenas de miles de cobros al mes y no
 * caben en la memoria de una Edge Function — pero además no hacen falta, porque
 * lo único que se quiere es el número. Va por `idx_cobros_liquidacion` (§51.e).
 *
 * **Qué cuenta como transacción:** una fila de `cobros` en `MATCHED`, sea
 * `adelanto`, `saldo` o `extra`. No es "por pedido": un pedido que paga la
 * mitad y después el saldo son DOS cobros, y Kross cobra su tarifa en los dos
 * (`comisionDeKross`). Pagar la comisión del afiliado por pedido sería pagarle
 * por la mitad de lo que generó.
 */
async function contar(storeId: string, desde: string, hasta: string): Promise<number> {
  const { count, error } = await supabase
    .from('cobros').select('id', { count: 'exact', head: true })
    .eq('store_id', storeId).eq('estado', 'MATCHED')
    .gte('matched_at', desde).lt('matched_at', hasta)
  if (error) throw new Error(`contando cobros de ${storeId}: ${error.message}`)
  return count ?? 0
}

interface TiendaReferida {
  id: string
  nombre: string
  slug: string | null
  active: boolean | null
  affiliate_at: string | null
}

/** El aporte de cada tienda de un afiliado en un mes. */
async function aportes(tiendas: TiendaReferida[], periodo: string): Promise<AporteDeTienda[]> {
  if (tiendas.length === 0) return []
  const { desde, hasta } = rangoDelPeriodo(periodo)
  const ids = tiendas.map(t => t.id)

  // Los tramos pagados y el estado de hoy, en DOS consultas para todas las
  // tiendas. Una por tienda multiplicaría los viajes por nada: son tablas
  // chicas y el filtro es el mismo.
  const [{ data: tramos }, { data: subs }] = await Promise.all([
    supabase.from('subscription_periods').select('store_id, inicio, fin')
      .in('store_id', ids).lt('inicio', hasta).gt('fin', desde),
    supabase.from('store_subscriptions').select('store_id, status').in('store_id', ids),
  ])

  const tramosDe = new Map<string, { inicio: string; fin: string }[]>()
  for (const t of tramos ?? []) {
    const lista = tramosDe.get(t.store_id)
    if (lista) lista.push(t)
    else tramosDe.set(t.store_id, [t])
  }
  const statusDe = new Map((subs ?? []).map(s => [s.store_id, s.status as string | null]))

  return await Promise.all(tiendas.map(async (t): Promise<AporteDeTienda> => {
    const cubiertos = tramosDelPeriodo(tramosDe.get(t.id) ?? [], desde, hasta)
    // El total del mes y lo que cae dentro de lo pagado. La resta es lo que
    // NO cuenta, y se enseña: "300 ventas, 0 comisión" sin explicación se lee
    // como un robo; con el número al lado, la conversación es "tu tienda no
    // pagó el plan", que además es accionable.
    const [total, ...porTramo] = await Promise.all([
      contar(t.id, desde, hasta),
      ...cubiertos.map(c => contar(t.id, c.desde, c.hasta)),
    ])
    const transacciones = porTramo.reduce((s, n) => s + n, 0)
    return {
      store_id: t.id,
      nombre: t.nombre,
      transacciones,
      sin_plan: Math.max(0, total - transacciones),
      estado: estadoDeSuscripcion(statusDe.get(t.id)),
    }
  }))
}

/** Las tiendas de un afiliado. */
async function tiendasDe(afiliadoId: string): Promise<TiendaReferida[]> {
  const { data, error } = await supabase.from('stores')
    .select('id, nombre, slug, active, affiliate_at')
    .eq('affiliate_id', afiliadoId).order('affiliate_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as TiendaReferida[]
}

/** El mes de un afiliado, contado de cero. */
async function liquidacion(afiliadoId: string, periodo: string) {
  const tiendas = await tiendasDe(afiliadoId)
  return { tiendas, ...liquidacionDe(periodo, await aportes(tiendas, periodo)) }
}

// ─── La API ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'cuerpo ilegible' }, 400)
  }

  const quien = await quienLlama(req)
  if (!quien) return json({ error: 'no autenticado' }, 401)

  const action = String(body.action ?? '')
  // El mes por defecto es el EN CURSO, en hora de Lima. Nunca el de UTC: una
  // venta del 30 a las 20:00 es de setiembre y contarla en octubre le mueve la
  // comisión de mes al afiliado (ver `periodoDe`).
  const periodo = esPeriodo(body.periodo) ? body.periodo : periodoDe(new Date())

  try {
    switch (action) {
      // ── ¿Quién soy? Barato a propósito: lo pregunta el LOGIN para saber a
      //    dónde mandar a quien acaba de entrar, y ahí no se puede pagar el
      //    conteo del mes solo para descubrir que la persona no es afiliada.
      case 'quien_soy':
        return json({
          admin: quien.admin,
          afiliado: quien.afiliado
            ? { ...quien.afiliado, enlace: enlaceDeAfiliado(quien.afiliado.codigo) }
            : null,
        })

      // ── LO SUYO. La pantalla del afiliado. ──────────────────────────────
      case 'mi_panel': {
        if (!quien.afiliado) return json({ error: 'no eres afiliado' }, 403)
        const yo = quien.afiliado

        // Su rama: él y todo lo que cuelga de él. NO la tabla entera —vería los
        // correos de los demás—, y no solo sus hijos: "quién está debajo de
        // quién" se responde a cualquier profundidad.
        const { data: todos } = await supabase.from('affiliates')
          .select('id, codigo, nombre, referred_by, active, created_at')
        const bajoMi = new Set(descendientesDe((todos ?? []) as NodoDeAfiliado[], yo.id))
        const rama = (todos ?? []).filter(a => a.id === yo.id || bajoMi.has(a.id))

        const [mes, { data: pagos }] = await Promise.all([
          liquidacion(yo.id, periodo),
          supabase.from('affiliate_payouts')
            .select('periodo, transacciones, monto_pen, estado, paid_at, referencia')
            .eq('affiliate_id', yo.id).neq('estado', 'ANULADO')
            .order('periodo', { ascending: false }).limit(24),
        ])

        return json({
          yo: { ...yo, enlace: enlaceDeAfiliado(yo.codigo) },
          tarifa: TARIFA_AFILIADO,
          precio_plan_usd: PRECIO_PLAN_USD,
          mes,
          pagos: pagos ?? [],
          // Aplanado acá y no en la pantalla: el nivel de cada uno sale del
          // árbol, y el árbol es la parte que hay que hacer bien UNA vez.
          equipo: aplanarArbol(arbolDeAfiliados(rama as NodoDeAfiliado[]))
            .map(f => ({ ...f.afiliado, nivel: f.nivel })),
        })
      }

      // ── Reclamar el enlace con su cuenta, la primera vez. ───────────────
      case 'vincular': {
        if (quien.afiliado) return json({ ok: true, ya: true })
        const codigo = normalizarCodigo(String(body.codigo ?? ''))
        if (!codigo) return json({ error: 'falta el código' }, 400)

        const { data: fila } = await supabase.from('affiliates')
          .select('id, codigo, nombre, email, auth_user_id')
          .eq('codigo', codigo).maybeSingle()

        // **El correo es la llave, y por eso el mensaje de error es uno solo.**
        // Sin este candado, cualquiera con una cuenta reclama el código de otro
        // y se queda con sus comisiones. Quién puede reclamarlo lo decide quien
        // dio de alta al afiliado, escribiendo su correo — no quien llega.
        //
        // Y no se distingue "ese código no existe" de "ese código no es tuyo":
        // la diferencia le serviría a quien está probando códigos ajenos, y a
        // nadie más.
        const suyo = fila
          && !fila.auth_user_id
          && !!fila.email && !!quien.email
          && fila.email.trim().toLowerCase() === quien.email.trim().toLowerCase()
        if (!suyo) return json({ error: 'ese código no está disponible para esta cuenta' }, 403)

        const { error } = await supabase.from('affiliates')
          .update({ auth_user_id: quien.userId })
          .eq('id', fila.id).is('auth_user_id', null)   // sin carrera: solo si sigue libre
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true, afiliado: { id: fila.id, codigo: fila.codigo, nombre: fila.nombre } })
      }

      // ── TODO. Las pantallas de quien administra la plataforma. ──────────
      case 'listar': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const { data: todos, error } = await supabase.from('affiliates')
          .select('id, codigo, nombre, email, phone, referred_by, active, nota, auth_user_id, created_at')
          .order('created_at', { ascending: true })
        if (error) return json({ error: error.message }, 500)

        const filas = aplanarArbol(arbolDeAfiliados((todos ?? []) as NodoDeAfiliado[]))
        const conMes = await Promise.all(filas.map(async f => {
          const l = await liquidacion(f.afiliado.id, periodo)
          return {
            ...f.afiliado,
            nivel: f.nivel,
            enlace: enlaceDeAfiliado((f.afiliado as { codigo: string }).codigo),
            tiendas: l.tiendas.length,
            transacciones: l.transacciones,
            sin_plan: l.sin_plan,
            monto: l.monto,
            detalle: l.tiendas,
          }
        }))
        return json({ periodo, tarifa: TARIFA_AFILIADO, afiliados: conMes })
      }

      case 'crear': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const codigo = normalizarCodigo(String(body.codigo ?? ''))
        const nombre = String(body.nombre ?? '').trim()
        if (!esCodigoValido(codigo)) return json({ error: 'código inválido (mínimo 3 letras, sin espacios)' }, 400)
        if (!nombre) return json({ error: 'falta el nombre' }, 400)

        const email = String(body.email ?? '').trim().toLowerCase() || null
        // La cuenta con la que va a entrar a ver sus números. Se crea acá igual
        // que `manage-store` crea la primera admin de una marca: el afiliado no
        // se registra solo, porque quién puede cobrar comisiones no puede
        // decidirlo un formulario público.
        //
        // Es OPCIONAL: se puede dar de alta a alguien, entregarle su enlace hoy
        // y darle acceso al panel la semana que viene (acción `acceso`). El
        // enlace funciona desde el minuto uno — lo que necesita cuenta es MIRAR.
        const password = String(body.password ?? '')
        let authUserId: string | null = null
        if (email && password) {
          if (password.length < 6) return json({ error: 'la contraseña necesita 6 caracteres' }, 400)
          const { data: creado, error: eAuth } = await supabase.auth.admin.createUser({
            email, password, email_confirm: true,
          })
          if (eAuth || !creado?.user) return json({ error: eAuth?.message ?? 'no se pudo crear la cuenta' }, 400)
          authUserId = creado.user.id
        }

        const { data, error } = await supabase.from('affiliates').insert({
          codigo, nombre, email,
          phone: String(body.phone ?? '').trim() || null,
          referred_by: body.referred_by ? String(body.referred_by) : null,
          nota: String(body.nota ?? '').trim() || null,
          auth_user_id: authUserId,
        }).select('id, codigo, nombre').single()
        // 23505 es el único choque esperable acá, y merece su propio mensaje:
        // "duplicate key value violates unique constraint" no le dice nada a
        // quien está creando un afiliado.
        if (error) {
          // La cuenta de Auth ya existe: se deshace, igual que `manage-store`
          // borra la tienda cuando el alta de su admin falla. Sin esto queda un
          // usuario que no es afiliado de nada y bloquea ese correo para siempre.
          if (authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => {})
          return json({ error: error.code === '23505' ? 'ese código ya está tomado' : error.message }, 400)
        }
        return json({ ok: true, afiliado: { ...data, enlace: enlaceDeAfiliado(data.codigo) } })
      }

      case 'guardar': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const id = String(body.id ?? '')
        if (!id) return json({ error: 'falta el afiliado' }, 400)

        const cambios: Record<string, unknown> = {}
        if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim()
        if (body.email !== undefined) cambios.email = String(body.email).trim().toLowerCase() || null
        if (body.phone !== undefined) cambios.phone = String(body.phone).trim() || null
        if (body.nota !== undefined) cambios.nota = String(body.nota).trim() || null
        if (body.active !== undefined) cambios.active = body.active === true

        if (body.referred_by !== undefined) {
          const padre = body.referred_by ? String(body.referred_by) : null
          // **El único momento en que un ciclo se puede evitar de verdad.** Una
          // vez escrito, A→B→A cuelga a cualquiera que recorra el árbol; el
          // lector lo tolera (corta-ciclos) pero el árbol ya está mal.
          const { data: todos } = await supabase.from('affiliates').select('id, codigo, nombre, referred_by')
          if (cerrariaCiclo((todos ?? []) as NodoDeAfiliado[], id, padre)) {
            return json({ error: 'eso dejaría a un afiliado colgando de sí mismo' }, 400)
          }
          cambios.referred_by = padre
        }

        if (Object.keys(cambios).length === 0) return json({ ok: true, sinCambios: true })
        const { error } = await supabase.from('affiliates').update(cambios).eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ── Darle acceso al panel a un afiliado que ya existe. El caso normal
      //    es el de siempre: se le dio de alta el enlace primero y la cuenta
      //    después, cuando pidió ver sus números.
      case 'acceso': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const id = String(body.id ?? '')
        const password = String(body.password ?? '')
        if (!id) return json({ error: 'falta el afiliado' }, 400)
        if (password.length < 6) return json({ error: 'la contraseña necesita 6 caracteres' }, 400)

        const { data: fila } = await supabase.from('affiliates')
          .select('id, email, auth_user_id').eq('id', id).maybeSingle()
        if (!fila) return json({ error: 'ese afiliado no existe' }, 404)
        if (fila.auth_user_id) return json({ error: 'ya tiene cuenta' }, 409)
        if (!fila.email) return json({ error: 'primero hay que anotarle un correo' }, 400)

        const { data: creado, error: eAuth } = await supabase.auth.admin.createUser({
          email: fila.email, password, email_confirm: true,
        })
        if (eAuth || !creado?.user) return json({ error: eAuth?.message ?? 'no se pudo crear la cuenta' }, 400)

        const { error } = await supabase.from('affiliates')
          .update({ auth_user_id: creado.user.id }).eq('id', id).is('auth_user_id', null)
        if (error) {
          await supabase.auth.admin.deleteUser(creado.user.id).catch(() => {})
          return json({ error: error.message }, 500)
        }
        return json({ ok: true })
      }

      // ── Atribuir una tienda. Primer toque gana, y por eso reasignar es
      //    explícito: sin `forzar`, una tienda que ya tiene dueño no se toca.
      case 'atribuir': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const storeId = String(body.store_id ?? '')
        const afiliadoId = body.affiliate_id ? String(body.affiliate_id) : null
        if (!storeId) return json({ error: 'falta la tienda' }, 400)

        const { data: tienda } = await supabase.from('stores')
          .select('id, affiliate_id').eq('id', storeId).maybeSingle()
        if (!tienda) return json({ error: 'esa tienda no existe' }, 404)
        if (tienda.affiliate_id && tienda.affiliate_id !== afiliadoId && body.forzar !== true) {
          return json({ error: 'esa tienda ya está atribuida', actual: tienda.affiliate_id }, 409)
        }

        // La fecha de atribución solo se mueve cuando el dueño CAMBIA: es lo
        // que resuelve la disputa que siempre llega —dos afiliados que dicen
        // haber traído al mismo comercio—, y reescribirla al re-guardar lo
        // mismo borraría la única evidencia de cuándo fue.
        const cambiaDeDueno = tienda.affiliate_id !== afiliadoId
        const cambios: Record<string, unknown> = { affiliate_id: afiliadoId }
        if (cambiaDeDueno) cambios.affiliate_at = afiliadoId ? new Date().toISOString() : null

        const { error } = await supabase.from('stores').update(cambios).eq('id', storeId)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ── Cerrar el mes. Acá —y solo acá— una cifra deja de calcularse y pasa
      //    a guardarse: lo que se le prometió a una persona no puede moverse
      //    porque un cobro se anuló el mes siguiente.
      case 'liquidar': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        if (!esPeriodo(body.periodo)) return json({ error: 'falta el periodo (YYYY-MM)' }, 400)
        const mes = body.periodo

        // Cerrar el mes EN CURSO congelaría un número que todavía va a crecer,
        // y como cerrar es idempotente por el índice único (§51.f), el segundo
        // intento no lo corregiría: quedaría el número de mitad de mes para
        // siempre. Se cierra lo que ya terminó.
        if (mes >= periodoDe(new Date())) {
          return json({ error: 'ese mes todavía no termina' }, 400)
        }

        const { data: todos } = await supabase.from('affiliates').select('id').eq('active', true)
        const cerrados: unknown[] = []
        for (const a of todos ?? []) {
          const l = await liquidacion(a.id, mes)
          if (l.transacciones === 0) continue   // sin transacciones no hay deuda que anotar

          const { data, error } = await supabase.from('affiliate_payouts').insert({
            affiliate_id: a.id,
            periodo: mes,
            transacciones: l.transacciones,
            tarifa_pen: TARIFA_AFILIADO,
            monto_pen: l.monto,
            detalle: l.tiendas,
            created_by: quien.userId,
          }).select('id, affiliate_id, monto_pen, transacciones').single()

          // 23505 = ya estaba cerrado. No es un error: es la idempotencia
          // funcionando. Cerrar dos veces el mismo mes no puede crear dos
          // deudas por lo mismo.
          if (error && error.code !== '23505') return json({ error: error.message }, 500)
          if (data) cerrados.push(data)
        }
        return json({ ok: true, periodo: mes, cerrados })
      }

      case 'pagar': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const id = String(body.payout_id ?? '')
        if (!id) return json({ error: 'falta la liquidación' }, 400)
        const { error } = await supabase.from('affiliate_payouts').update({
          estado: 'PAGADO',
          paid_at: new Date().toISOString(),
          referencia: String(body.referencia ?? '').trim().slice(0, 120) || null,
        }).eq('id', id).eq('estado', 'CALCULADO')   // pagar dos veces no cambia nada
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'pagos': {
        if (!quien.admin) return json({ error: 'sin permiso' }, 403)
        const { data, error } = await supabase.from('affiliate_payouts')
          .select('id, affiliate_id, periodo, transacciones, monto_pen, estado, paid_at, referencia, detalle')
          .order('periodo', { ascending: false }).limit(200)
        if (error) return json({ error: error.message }, 500)
        return json({ pagos: data ?? [] })
      }

      default:
        return json({ error: `acción desconocida: ${action}` }, 400)
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('[afiliados]', action, detalle)
    return json({ error: detalle }, 500)
  }
})
