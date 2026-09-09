// ─── Entrar a «Mis pedidos» ─────────────────────────────────────────────────
//
// Tres puertas, y solo tres:
//
//   1. `session_token` — la sesión abierta con el código de WhatsApp
//      (`buyer-code-verify`). Es la puerta normal de quien ya entró.
//   2. `buyer_id` — el auto-login del chat: el comprador abrió `/p/<token>`
//      desde el enlace que le mandamos. Ese token ES la prueba; el `buyer_id`
//      sale del propio pedido, no se teclea.
//   3. `document_number` — el DNI a secas, **solo mientras la tienda no pueda
//      mandar códigos**. Ver abajo.
//
// ⚠️ La puerta 3 es la que había antes, y era un agujero: `document_number`
// devolvía la ficha entera de la persona y el `token` de cada pedido, y ese
// token abre el chat, la guía, la sede de recojo y la clave con la que se
// retira el paquete. En Perú el DNI está en cada boleta. Se cierra SOLA en
// cuanto la marca tiene su plantilla aprobada (`puedeMandarCodigo`): configurar
// la plantilla ES encender la seguridad, sin un interruptor que olvidar.
//
// Sigue abierta mientras la marca no la tenga, porque cerrarla sin un canal
// para mandar el código dejaría a esa tienda sin «Mis pedidos». Está anotado
// como deuda en `ESTADO-OPERATIVO.md`, y lo que la salda es aprobar la
// plantilla, no tocar este archivo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { puedeMandarCodigo } from '../_shared/acceso-comprador.ts'
import {
  CAMPOS_COMPRADOR, cerrarSesion, compradorDeSesion, crearSesion, payloadDeComprador,
} from '../_shared/sesion-comprador.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as {
    document_type?: string
    document_number?: string
    phone?: string
    store_id?: string
    buyer_id?: string
    session_token?: string
    /** Cerrar sesión: el token deja de valer para TODOS los dispositivos.
     *  Borrarlo solo del navegador dejaría la cuenta abierta desde otro. */
    logout?: boolean
  }

  // ─── Cerrar sesión ────────────────────────────────────────────────────────
  if (body.logout) {
    if (body.session_token) await cerrarSesion(body.session_token)
    return json({ ok: true })
  }

  let buyer: Record<string, unknown> | null = null
  let token: string | null = null

  // ─── 1. Con la sesión abierta ─────────────────────────────────────────────
  if (body.session_token) {
    buyer = await compradorDeSesion(body.session_token)
    if (!buyer) return json({ error: 'sesion_invalida' }, 401)
    token = body.session_token
  }

  // ─── 2. Auto-login desde el chat de un pedido ─────────────────────────────
  // El `buyer_id` es un uuid inadivinable que llega del propio pedido: quien
  // lo tiene ya abrió el enlace que le mandamos a SU WhatsApp.
  if (!buyer && body.buyer_id) {
    const { data } = await supabase
      .from('buyers').select(CAMPOS_COMPRADOR).eq('id', body.buyer_id).maybeSingle()
    buyer = data as Record<string, unknown> | null
    // Se le abre sesión igual que al que teclea su código: si no, cada refresco
    // de «Mis pedidos» volvería a entrar por esta puerta.
    if (buyer) token = await crearSesion(buyer.id as string, body.store_id ?? null)
  }

  // ─── 3. DNI o teléfono, solo si la tienda no puede mandar códigos ─────────
  if (!buyer && (body.document_number || body.phone)) {
    if (!body.store_id) return json({ error: 'store_required' }, 400)

    const { data: store } = await supabase
      .from('stores').select('wa_enabled, wa_phone_number_id, wa_codigo_template')
      .eq('id', body.store_id).maybeSingle()
    if (puedeMandarCodigo(store, !!Deno.env.get('WHATSAPP_TOKEN'))) {
      // Esta tienda ya manda códigos: por acá no se entra más.
      return json({ error: 'codigo_requerido' }, 403)
    }

    if (body.document_number) {
      const { data } = await supabase
        .from('buyers').select(CAMPOS_COMPRADOR)
        .eq('document_number', body.document_number)
        .eq('store_id', body.store_id)
        .maybeSingle()
      buyer = data as Record<string, unknown> | null
    }

    if (!buyer && body.phone) {
      const digits = body.phone.replace(/\D/g, '').replace(/^0+/, '')
      const withPrefix = digits.startsWith('51') ? digits : `51${digits}`
      const withoutPrefix = digits.startsWith('51') ? digits.slice(2) : digits
      const { data } = await supabase
        .from('buyers').select(CAMPOS_COMPRADOR)
        .eq('store_id', body.store_id)
        .or(`phone.eq.${withPrefix},phone.eq.${withoutPrefix},phone.eq.${digits}`)
        .maybeSingle()
      buyer = data as Record<string, unknown> | null
    }

    if (buyer) token = await crearSesion(buyer.id as string, body.store_id)
  }

  if (!buyer) {
    return json({ error: 'not_found' }, 404)
  }

  const payload = await payloadDeComprador(buyer, body.store_id)
  return json({ session_token: token, ...payload })
})
