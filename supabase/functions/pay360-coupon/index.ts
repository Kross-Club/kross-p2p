// ─── SALES ENGINE · Emisión del cupón de adelanto (360pay) ───────────────────
// Gemelo de `culqi-charge`, pero el modelo es otro y la diferencia importa:
// aquí NO se cobra. Se emite una orden de cobro (el "cupón") y se devuelve el
// deep link que abre Yape pre-llenado. El dinero se confirma después, por
// `pay360-webhook`. Ver docs/06-360PAY.md.
//
// Reglas que no se negocian (las mismas de culqi-charge, por las mismas razones):
//   · El MONTO jamás viene del cliente: se re-deriva del destino del pedido
//     (`_shared/advance.ts`) y se contrasta contra la fila.
//   · La configuración se resuelve por la tienda de ORIGEN (`origin_store_id`),
//     nunca por la del vendedor asignado — emitir contra el negocio de otra
//     marca manda su dinero a la cuenta equivocada.
//   · Solo pedidos con `payment_provider='360PAY'`.
//
// Y una que es propia de este motor:
//   · ANTES de emitir se ANULAN los cupones pendientes del comprador. El código
//     de pago identifica al CLIENTE y el banco cobra SIEMPRE EL MÁS ANTIGUO, así
//     que un cupón viejo vivo secuestra el pago: quien abandonó un checkout de
//     S/25 y vuelve por S/5 pagaría el viejo. En una marca de recompra eso es
//     rutina, no un borde.
//
// Autenticación: el `order_token` ES la credencial, igual que en culqi-charge.
// Logging: jamás el body, la llave de partner ni el código de pago completo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer } from '../_shared/advance.ts'
import {
  annulCoupon, consumerCodeFor, createCoupon, getCoupon, isPaid,
  pay360BaseUrl, paymentUrlOf, yapeDeeplink, type Pay360Env,
} from '../_shared/pay360.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Llave de PARTNER: es de la plataforma, no de una tienda. */
const PARTNER_KEY = Deno.env.get('PAY360_PARTNER_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Tope de emisiones por pedido. Cada una crea un cupón real en 360pay; sin
 *  corte, un token válido podría llenar la cuenta de la marca de basura. */
const MAX_ISSUES = 6

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = await req.json().catch(() => ({})) as { order_token?: string }
  const orderToken = String(body.order_token ?? '').trim()
  if (!orderToken) return json({ ok: false, stage: 'validation', code: 'missing_token' }, 400)

  const { data: session } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, origin_store_id, status, buyer_name, buyer_phone,
      advance_amount, payment_verification, payment_provider, dispatch_type,
      agency_name, advance_charge_attempts, pay360_coupon_id, pay360_consumer_code
    `)
    .eq('token', orderToken)
    .maybeSingle()

  if (!session) return json({ ok: false, stage: 'validation', code: 'not_found' }, 404)

  // ─── Idempotencia por estado ───────────────────────────────────────────────
  // Ya pagado: se responde el hecho, jamás se emite otro cupón. Emitir uno nuevo
  // sobre un pedido pagado es pedirle al comprador que pague dos veces.
  if (session.payment_verification === 'MATCHED') {
    return json({ ok: true, already_paid: true, amount_pen: Number(session.advance_amount ?? 0) })
  }
  if (session.status !== 'active') {
    return json({ ok: false, stage: 'validation', code: 'cancelled', user_message: 'Este pedido ya no está activo.' }, 409)
  }
  if (session.payment_provider !== '360PAY') {
    return json({ ok: false, stage: 'config', code: 'not_pay360_order' }, 409)
  }
  if ((session.advance_charge_attempts ?? 0) >= MAX_ISSUES) {
    return json({ ok: false, stage: 'validation', code: 'too_many_attempts', user_message: 'Demasiados intentos. Un asesor te escribirá para coordinar el pago.' }, 429)
  }

  // ─── El monto lo deriva ESTE servidor, dos veces ───────────────────────────
  const expected = advanceForServer(String(session.dispatch_type ?? ''), session.agency_name ?? null)
  const rowAmount = Number(session.advance_amount ?? 0)
  if (expected <= 0 || rowAmount <= 0 || session.payment_verification === 'NOT_REQUIRED') {
    return json({ ok: false, stage: 'validation', code: 'no_advance' }, 400)
  }
  if (rowAmount !== expected) {
    await supabase.from('order_sessions')
      .update({ payment_reason: `Adelanto del pedido (S/${rowAmount}) no coincide con el derivado (S/${expected}) — revisar antes de emitir` })
      .eq('id', session.id)
    return json({ ok: false, stage: 'config', code: 'amount_mismatch', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 409)
  }

  // ─── Config de la tienda de ORIGEN ─────────────────────────────────────────
  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const [{ data: store }, { data: secrets }] = await Promise.all([
    supabase.from('stores')
      .select('pay360_enabled, pay360_business_id, pay360_payment_prefix, pay360_env')
      .eq('id', originStoreId).maybeSingle(),
    supabase.from('store_secrets')
      .select('payment_ingest_token').eq('store_id', originStoreId).maybeSingle(),
  ])

  // Los identificadores de Yape son INTERNOS de 360pay y el partner pidió no
  // mapearlos: por eso no viven por tienda, sino como secreto de plataforma —
  // son los mismos para todos sus comercios, y quien distingue a la marca es el
  // PREFIJO del código de pago. Sirven de respaldo: si el cupón trae su propio
  // enlace, ese gana (ver `paymentUrlOf`).
  const companyId = Deno.env.get('PAY360_YAPE_COMPANY_ID') ?? ''
  const serviceId = Deno.env.get('PAY360_YAPE_SERVICE_ID') ?? ''

  const ready = store?.pay360_enabled && store.pay360_business_id && store.pay360_payment_prefix
    && PARTNER_KEY
  if (!ready) {
    await notePaymentFailure(session, 'Pago en línea no disponible: tienda sin configurar 360pay')
    return json({ ok: false, stage: 'config', code: 'store_not_configured', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 409)
  }

  const env = (store.pay360_env === 'live' ? 'live' : 'sandbox') as Pay360Env
  const base = pay360BaseUrl(env, 'partner')

  // ─── Código de pago del COMPRADOR ──────────────────────────────────────────
  // Estable por comprador: el que vuelve cae en el mismo `customer` de 360pay.
  // Se siembra con el celular acotado a la tienda para que dos marcas no
  // compartan código, y se firma con un secreto de la tienda para que no sea
  // adivinable — teclear un código en Yape muestra lo que ese cliente debe.
  const buyerKey = `${originStoreId}:${String(session.buyer_phone ?? session.id)}`
  const codeSecret = secrets?.payment_ingest_token ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const consumerCode = session.pay360_consumer_code
    ?? await consumerCodeFor(String(store.pay360_payment_prefix), codeSecret, buyerKey)

  await supabase.from('order_sessions')
    .update({ advance_charge_attempts: (session.advance_charge_attempts ?? 0) + 1 })
    .eq('id', session.id)

  // ─── Reemisión: ¿el cupón anterior ya se pagó? ─────────────────────────────
  // Antes de anular nada se consulta. Anular un cupón ya pagado perdería el
  // rastro del dinero que YA entró.
  if (session.pay360_coupon_id) {
    const prev = await getCoupon(base, PARTNER_KEY, session.pay360_coupon_id)
    if (prev.ok && isPaid(prev.data)) {
      return json({ ok: true, already_paid: true, amount_pen: rowAmount })
    }
    if (prev.ok) await annulCoupon(base, PARTNER_KEY, session.pay360_coupon_id)
  }

  // ─── Emitir ────────────────────────────────────────────────────────────────
  // `external_ref` = id de la sesión: es la llave por la que el webhook vuelve
  // a encontrar este pedido, y lo que hace el cruce determinístico.
  const coupon = await createCoupon(base, PARTNER_KEY, {
    amount: rowAmount,                      // SOLES con decimales, no céntimos
    external_ref: String(session.id),
    description: `Adelanto ${session.order_id ?? session.id}`.slice(0, 80),
    customer: {
      name: session.buyer_name ?? 'Cliente',
      phone: session.buyer_phone ? `+51${String(session.buyer_phone).slice(-9)}` : undefined,
      coupon_code: consumerCode,
    },
  })

  if (!coupon.ok) {
    if (coupon.network) {
      // El POST salió y la respuesta se perdió: el cupón PUDO crearse. NO se
      // reintenta a ciegas — el siguiente intento consulta por `external_ref`
      // antes de emitir, o el comprador termina con dos cupones y paga el que
      // no era (gana el más antiguo).
      return json({ ok: false, stage: 'network_after' }, 502)
    }
    await notePaymentFailure(session, `No se pudo generar el cupón de pago${coupon.error ? ` (${coupon.error})` : ''}`)
    console.error('[pay360-coupon] create_failed', JSON.stringify({
      status: coupon.status, scopes: coupon.requiredScopes ?? null,
    }))
    return json({ ok: false, stage: 'coupon', code: 'create_failed', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 502)
  }

  // El enlace: primero el que mande 360pay, y si no viene, el que armamos. Si
  // no hay ninguno el cupón YA está emitido, así que no se puede fallar en
  // silencio — se deja el pedido a un asesor en vez de mostrar un botón muerto.
  const deeplink = paymentUrlOf(coupon.data as Record<string, unknown>)
    ?? (companyId && serviceId
      ? yapeDeeplink({ companyId, serviceId, consumerCode, name: '360Pay' })
      : null)

  if (!deeplink) {
    await notePaymentFailure(session, 'Cupón emitido pero sin enlace de pago — falta configurar el servicio de Yape')
    console.error('[pay360-coupon] sin enlace de pago', JSON.stringify({ coupon: coupon.data._id }))
    return json({ ok: false, stage: 'config', code: 'no_payment_link', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 409)
  }

  await supabase.from('order_sessions').update({
    pay360_coupon_id: coupon.data._id,
    pay360_consumer_code: consumerCode,
    payment_verification: 'PENDING',
    payment_reason: null,
  }).eq('id', session.id)

  return json({
    ok: true,
    amount_pen: rowAmount,
    consumer_code: consumerCode,
    coupon_id: coupon.data._id,
    // El enlace se resuelve en el SERVIDOR: el front no conoce los
    // identificadores de Yape ni puede alterar a qué servicio apunta.
    deeplink,
  })
})

/** Deja el motivo en la fila y, la PRIMERA vez, avisa a Ventas por el chat.
 *  Frases propias y cortas: todo lo que entra a `payment_reason` puede terminar
 *  frente al comprador por `get-session?viewer=seller` (deuda conocida). */
async function notePaymentFailure(
  session: { id: string; advance_amount: unknown }, reason: string,
) {
  const { data: row } = await supabase.from('order_sessions')
    .select('payment_reason').eq('id', session.id).maybeSingle()
  await supabase.from('order_sessions').update({ payment_reason: reason }).eq('id', session.id)
  if (!row?.payment_reason) {
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'text', visibility: 'sellers',
      body: `⚠️ No se pudo generar el pago en línea del adelanto de S/${Number(session.advance_amount ?? 0)}. Coordina el cobro por el chat.`,
    })
  }
}
