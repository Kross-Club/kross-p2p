// ─── ALTA · De la landing a su panel, sin nadie en medio (§54) ───────────────
//
// Tres acciones, y las tres las llama alguien que **todavía no tiene cuenta**.
// Por eso esta función no autentica nada: lo que autoriza es el TOKEN de la
// fila de `signups`, que es una llave de un solo uso.
//
//   `reservar`  · la landing, antes de pagar. Guarda la intención y devuelve a
//                 dónde mandarlo a pagar.
//   `estado`    · `/bienvenido`, dando vueltas hasta que el webhook cree la
//                 tienda. Stripe cobra en un segundo pero el webhook llega
//                 cuando llega.
//   `clave`     · `/bienvenido`, cuando ya hay tienda. Pone la contraseña del
//                 primer administrador. **Un solo uso.**
//
// ⚠️ **Acá NO se crea ninguna tienda.** La crea `stripe-webhook`, cuando Stripe
// confirma que cobró. Si se creara acá —al reservar— cualquiera llenaría el
// formulario y tendría una tienda gratis; y si se creara en `/bienvenido`,
// bastaría con navegar a esa URL a mano. Lo único que prueba que alguien pagó
// es un evento firmado de Stripe.
//
// Deploy: supabase functions deploy alta --project-ref ofdjghntvmrdfjhazfvz
// Secreto: STRIPE_PAYMENT_LINK (el `https://buy.stripe.com/…` del plan).

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  MOTIVO_DE_ALTA, esTokenDeAlta, nuevoTokenDeAlta, revisarAlta, slugLibre,
} from '../_shared/alta-de-tienda.ts'

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

/** Cuánto vale el token para poner la contraseña. Un día es de sobra —el
 *  comerciante vuelve del pago en el mismo minuto— y deja margen para el que
 *  cierra la pestaña y la reabre por la noche. Pasado eso queda
 *  «recuperar contraseña», que va a su correo. */
const HORAS_PARA_LA_CLAVE = 24

/** ¿Está tomado este subdominio? También contra los ANTERIORES (§47). */
async function slugTomado(slug: string): Promise<boolean> {
  const { data } = await supabase.from('stores').select('id')
    .or(`slug.eq.${slug},slug_anterior.eq.${slug}`).maybeSingle()
  return !!data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'cuerpo ilegible' }, 400)
  }

  const action = String(body.action ?? '')

  try {
    switch (action) {
      // ── RESERVAR. Guarda la intención y dice a dónde ir a pagar. ────────
      case 'reservar': {
        const marca = String(body.marca ?? '').trim().slice(0, 80)
        const nombre = String(body.nombre ?? '').trim().slice(0, 80)

        // Las MISMAS reglas que la landing ya aplicó. No es redundante: la
        // landing valida para no ofrecer un botón que va a rebotar, y esto
        // valida porque no se fía de la landing.
        const mal = revisarAlta({ marca, nombre })
        if (mal) return json({ error: MOTIVO_DE_ALTA[mal], motivo: mal }, 400)

        const enlace = Deno.env.get('STRIPE_PAYMENT_LINK') ?? ''
        if (!enlace.startsWith('https://buy.stripe.com/')) {
          // Falta el secreto. Se dice con todas sus letras en vez de mandarlo a
          // una URL vacía: el que lo va a leer es quien despliega, no el
          // visitante, y el visitante ve un error genérico.
          console.error('[alta] STRIPE_PAYMENT_LINK sin configurar o no es un enlace de Stripe')
          return json({ error: 'El alta no está disponible en este momento.' }, 503)
        }

        // El subdominio que se le PROMETE. Se vuelve a resolver al crear —entre
        // esto y el pago pueden pasar minutos— pero enseñarle el suyo antes de
        // pagar es la mitad de la razón para pedirle el nombre de la marca.
        const descartados = new Set<string>()
        let slug: string | null = null
        for (let i = 0; i < 20; i++) {
          const cand = slugLibre(marca, s => descartados.has(s))
          if (!cand) break
          if (!await slugTomado(cand)) { slug = cand; break }
          descartados.add(cand)
        }
        if (!slug) return json({ error: MOTIVO_DE_ALTA.slug_reservado, motivo: 'slug_reservado' }, 400)

        const token = nuevoTokenDeAlta()
        const ref = String(body.affiliate_ref ?? '').trim().slice(0, 40) || null
        const { error } = await supabase.from('signups').insert({
          token, marca, nombre_admin: nombre, slug, affiliate_ref: ref,
        })
        if (error) return json({ error: error.message }, 500)

        // `client_reference_id` es el token, NO un `store_id`: la tienda todavía
        // no existe. El webhook mira el prefijo `sg_` para saber que le toca
        // crearla (§54).
        const url = new URL(enlace)
        url.searchParams.set('client_reference_id', token)
        return json({ ok: true, token, slug, url_pago: url.toString() })
      }

      // ── ESTADO. ¿Ya existe la tienda? ───────────────────────────────────
      case 'estado': {
        const fila = await buscarSignup(body)
        if (!fila) return json({ estado: 'desconocido' })
        return json({
          estado: fila.estado,
          slug: fila.slug,
          marca: fila.marca,
          email: fila.email,
          // Si ya eligió contraseña, `/bienvenido` no puede volver a pedirla:
          // el token es de un solo uso.
          clave_puesta: !!fila.password_set_at,
        })
      }

      // ── CLAVE. El primer ingreso. ───────────────────────────────────────
      case 'clave': {
        const fila = await buscarSignup(body)
        const clave = String(body.password ?? '')

        // **Un solo mensaje para todos los rechazos.** Distinguir «ese token no
        // existe» de «ya se usó» de «caducó» solo le sirve a quien está
        // probando tokens ajenos. Al legítimo le sirve la salida, y la salida
        // es la misma en los tres casos: recuperar por correo.
        const noVa = !fila
          || fila.estado !== 'CREADA'
          || !fila.store_id
          || !!fila.password_set_at
          || Date.parse(fila.created_at) < Date.now() - HORAS_PARA_LA_CLAVE * 3600_000
        if (noVa) {
          return json({
            error: 'Este enlace ya no sirve para elegir tu contraseña. '
              + 'Usa «Recuperar contraseña» con el correo con el que pagaste.',
          }, 410)
        }
        if (clave.length < 6) return json({ error: 'La contraseña necesita 6 caracteres o más.' }, 400)

        // El administrador de esa tienda. Es el que creó el webhook, y es el
        // único al que este token puede tocarle la contraseña.
        const { data: admin } = await supabase.from('sellers')
          .select('auth_user_id').eq('store_id', fila!.store_id)
          .eq('is_admin', true).eq('active', true)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        if (!admin?.auth_user_id) return json({ error: 'No encontramos tu cuenta.' }, 404)

        const { error } = await supabase.auth.admin.updateUserById(
          admin.auth_user_id, { password: clave },
        )
        if (error) return json({ error: error.message }, 400)

        // Se quema el token ANTES de contestar. Si esto fallara, el enlace
        // seguiría sirviendo para cambiar la contraseña otra vez.
        const { error: eQuemar } = await supabase.from('signups')
          .update({ password_set_at: new Date().toISOString() })
          .eq('token', fila!.token).is('password_set_at', null)
        if (eQuemar) console.error('[alta] no se pudo quemar el token', eQuemar.message)

        return json({ ok: true, email: fila!.email, slug: fila!.slug })
      }

      default:
        return json({ error: `acción desconocida: ${action}` }, 400)
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('[alta]', action, detalle)
    return json({ error: 'No se pudo completar el alta.' }, 500)
  }
})

interface Signup {
  token: string
  marca: string
  slug: string
  estado: string
  store_id: string | null
  email: string | null
  password_set_at: string | null
  created_at: string
}

/**
 * La fila del alta, por su token o por la sesión de checkout.
 *
 * Los dos caminos existen porque Stripe **no sabe** devolver el
 * `client_reference_id` en la URL de retorno: solo sustituye
 * `{CHECKOUT_SESSION_ID}`. El token va en `localStorage` (lo puso la landing) y
 * el `cs_…` va en la URL; con los dos, el comerciante llega a su pantalla
 * aunque el navegador haya borrado el storage.
 */
async function buscarSignup(body: Record<string, unknown>): Promise<Signup | null> {
  const campos = 'token, marca, slug, estado, store_id, email, password_set_at, created_at'
  const token = String(body.token ?? '')
  if (esTokenDeAlta(token)) {
    const { data } = await supabase.from('signups').select(campos).eq('token', token).maybeSingle()
    if (data) return data as Signup
  }
  const cs = String(body.checkout_session_id ?? '')
  // Alfabeto cerrado: los ids de Stripe son `cs_` + alfanuméricos, y esto entra
  // a una consulta.
  if (/^cs_[A-Za-z0-9_]{10,80}$/.test(cs)) {
    const { data } = await supabase.from('signups').select(campos)
      .eq('checkout_session_id', cs).maybeSingle()
    if (data) return data as Signup
  }
  return null
}
