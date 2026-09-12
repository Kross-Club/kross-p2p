// ─── Crear una tienda, en un solo sitio ──────────────────────────────────────
//
// Dar de alta una marca son cuatro escrituras que tienen que pasar juntas: la
// tienda, su enlace de afiliado (§52), la cuenta de su primer administrador y
// su fila en `sellers`. Hasta §54 eso vivía dentro de `manage-store`, porque
// solo había un camino: alguien de Kross creándola a mano.
//
// Ahora hay dos —el alta automática desde la landing es el otro— y duplicar
// este bloque sería garantizar que se separen. El día que una marca nueva tenga
// que nacer con un flag distinto, la que se cree desde el panel lo tendría y la
// que se cree pagando no, sin que nada falle.
//
// Recibe el cliente por parámetro en vez de construir el suyo: las dos Edge
// Functions ya tienen uno y crear un segundo duplicaría la conexión en cada
// arranque en frío.

import { normalizarCodigo } from './afiliados.ts'
import { slugLibre } from './alta-de-tienda.ts'

/** Lo mínimo del cliente de Supabase que esto usa. Estructural y no el tipo del
 *  SDK: así el archivo no arrastra `npm:@supabase/supabase-js` y lo puede leer
 *  cualquiera que solo quiera entender el alta. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = any

export interface DatosDeTienda {
  /** El nombre de la marca, tal como lo escribió. */
  nombre: string
  /** El subdominio que se le prometió. Se vuelve a comprobar acá: entre la
   *  promesa y esta llamada pueden haber pasado minutos. */
  slug: string
  /** Su nombre. Es el que se ve en «Has sido invitado por …» (§53) y el que
   *  lleva su ficha en el equipo. */
  adminNombre: string
  adminEmail: string
  adminPassword: string
  /** `public_id` o `codigo` de quien lo trajo (§51.b). */
  affiliateRef?: string | null
  logoUrl?: string | null
  colorPrimary?: string | null
  colorDark?: string | null
}

export interface TiendaCreada {
  storeId: string
  slug: string
  authUserId: string
}

/** ¿Este subdominio está tomado? También contra los ANTERIORES (§47): una
 *  tienda nueva no puede quedarse con los enlaces viejos de otra. */
async function slugTomado(supabase: Cliente, slug: string): Promise<boolean> {
  const { data } = await supabase.from('stores').select('id')
    .or(`slug.eq.${slug},slug_anterior.eq.${slug}`).maybeSingle()
  return !!data
}

/** A quién atribuirle esta tienda, o `null`. Nunca frena el alta: perder una
 *  marca nueva por un código que no resuelve sería el peor negocio posible, y
 *  atribuirla después es un botón en el panel. */
async function afiliadoDe(supabase: Cliente, ref: string | null | undefined): Promise<string | null> {
  const r = normalizarCodigo(String(ref ?? ''))
  // El alfabeto se valida antes porque esto entra por `.or(...)`, que es
  // sintaxis de filtro de PostgREST y no un parámetro.
  if (!/^[a-z0-9-]{3,32}$/.test(r)) return null
  const { data } = await supabase.from('affiliates')
    .select('id').or(`public_id.eq.${r},codigo.eq.${r}`).eq('active', true).maybeSingle()
  return data?.id ?? null
}

export type FalloDeAlta =
  | { ok: false; motivo: 'sin_slug' }
  | { ok: false; motivo: 'tienda'; detalle: string }
  | { ok: false; motivo: 'cuenta'; detalle: string }
  | { ok: false; motivo: 'equipo'; detalle: string }

/**
 * Crea la tienda entera.
 *
 * **El subdominio se resuelve acá, no antes.** Quien llama propone uno; si está
 * tomado, `slugLibre` le pone sufijo. Con el alta automática eso no es un lujo:
 * esta función corre DESPUÉS de que el comerciante pagó, y devolverle
 * «ese subdominio ya existe» a alguien que acaba de soltar $67 no es una opción.
 *
 * **El orden importa y hay vuelta atrás.** Si la cuenta de Auth no se puede
 * crear —el correo ya existe, por ejemplo— la tienda se borra: un `stores`
 * huérfano se queda con el subdominio y nadie puede entrar a usarlo. Lo que NO
 * se deshace es el enlace de afiliado, que cascadea con la tienda.
 */
export async function crearTienda(
  supabase: Cliente, d: DatosDeTienda,
): Promise<{ ok: true; tienda: TiendaCreada } | FalloDeAlta> {
  // El subdominio propuesto puede haber caducado, así que se pregunta de a uno:
  // `slugLibre` propone el siguiente candidato, la base dice si está libre, y
  // los descartados se acumulan para que la siguiente vuelta no los repita.
  // Así la función pura no necesita saber nada de la base.
  const descartados = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const cand = slugLibre(d.slug || d.nombre, s => descartados.has(s))
    if (!cand) break
    if (!await slugTomado(supabase, cand)) return await conSlug(supabase, d, cand)
    descartados.add(cand)
  }
  return { ok: false, motivo: 'sin_slug' }
}

async function conSlug(
  supabase: Cliente, d: DatosDeTienda, slug: string,
): Promise<{ ok: true; tienda: TiendaCreada } | FalloDeAlta> {
  const storeId = `st_${slug}_${Date.now().toString(36)}`
  const affiliateId = await afiliadoDe(supabase, d.affiliateRef)
  const nombre = d.nombre.trim()

  const { error: sErr } = await supabase.from('stores').insert({
    id: storeId,
    slug,
    nombre,
    affiliate_id: affiliateId,
    affiliate_at: affiliateId ? new Date().toISOString() : null,
    logo_url: d.logoUrl ?? null,
    color_primary: d.colorPrimary || '#55C8F5',
    color_dark: d.colorDark || '#060C1A',
    active: true,
    // Las marcas nuevas nacen SOLO con recojo en agencia. El domicilio lo
    // prende la plataforma cuando la marca tenga con quién repartir.
    home_delivery_enabled: false,
  })
  if (sErr) return { ok: false, motivo: 'tienda', detalle: sErr.message }

  // Su enlace de afiliado (§52). Best-effort: si falla, la tienda queda creada
  // igual y el enlace se le da después desde `Panel → Afiliados`. La misma
  // regla que `api-eventos.ts` — anotar nunca tumba lo que estaba anotando.
  {
    const { error } = await supabase.from('affiliates')
      .insert({ codigo: slug, nombre, store_id: storeId })
    if (error?.code === '23505') {
      const { error: e2 } = await supabase.from('affiliates')
        .insert({ codigo: `${slug}-${storeId.slice(-4)}`, nombre, store_id: storeId })
      if (e2) console.error('[crear-tienda] sin enlace de afiliado', e2.message)
    } else if (error) {
      console.error('[crear-tienda] sin enlace de afiliado', error.message)
    }
  }

  const { data: creado, error: authErr } = await supabase.auth.admin.createUser({
    email: d.adminEmail.trim(),
    password: d.adminPassword,
    email_confirm: true,
  })
  if (authErr || !creado?.user) {
    // Se deshace la tienda: una `stores` huérfana se queda con el subdominio y
    // nadie puede entrar a usarlo.
    await supabase.from('stores').delete().eq('id', storeId)
    return { ok: false, motivo: 'cuenta', detalle: authErr?.message ?? 'auth_create_failed' }
  }

  const { error: selErr } = await supabase.from('sellers').insert({
    auth_user_id: creado.user.id,
    store_id: storeId,
    nombre: d.adminNombre.trim() || nombre,
    role_label: 'Ventas',
    is_admin: true,
    is_super_admin: false,
    active: true,
    available: true,
  })
  if (selErr) return { ok: false, motivo: 'equipo', detalle: selErr.message }

  return { ok: true, tienda: { storeId, slug, authUserId: creado.user.id } }
}
