// ─── SALES ENGINE · Emisión del cupón de adelanto (360pay) ───────────────────
// Aquí NO se cobra: se emite una orden de cobro (el "cupón") y se devuelve el
// deep link que abre Yape pre-llenado. El dinero se confirma después, por
// `pay360-webhook`. Ver docs/06-360PAY.md.
//
// Reglas que no se negocian:
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
// Autenticación: el `order_token` ES la credencial.
// Logging: jamás el body, la llave de partner ni el código de pago completo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer } from '../_shared/advance.ts'
import {
  annulCoupon, consumerCodeFor, createCoupon, getCoupon, isPaid,
  couponExpiryFrom, createCustomer, pay360BaseUrl, paymentUrlOf, pickPartnerKey, yapeDeeplink,
  YAPE_360PAY, type Pay360Env,
} from '../_shared/pay360.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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
      id, order_id, store_id, origin_store_id, status, buyer_id, buyer_name, buyer_phone,
      advance_amount, payment_verification, payment_provider,
      product_price, advance_choice, advance_charge_attempts,
      pay360_coupon_id, pay360_consumer_code
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
  // El adelanto sale del PRECIO, no del destino: `advance_choice` dice si es la
  // mitad o el total. Misma función que usa el front (`advanceFor`), para que
  // se cobre exactamente lo que el paso 3 le mostró al comprador.
  const expected = advanceForServer(Number(session.product_price ?? 0), String(session.advance_choice ?? 'HALF'))
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

  // Los identificadores del servicio 360Pay en Yape. No viven por tienda: son
  // del RECAUDADOR, iguales para todos sus comercios, y quien distingue a la
  // marca es el PREFIJO del código de pago. Traen valor por defecto (ver
  // `YAPE_360PAY`) para que una tienda nueva nazca con botón; el secreto manda
  // si 360pay los cambia. `||` y no `??`: un secreto vacío debe caer al
  // default, no dejar la tienda sin enlace.
  const companyId = Deno.env.get('PAY360_YAPE_COMPANY_ID') || YAPE_360PAY.companyId
  const serviceId = Deno.env.get('PAY360_YAPE_SERVICE_ID') || YAPE_360PAY.serviceId

  const env = (store?.pay360_env === 'live' ? 'live' : 'sandbox') as Pay360Env
  // La llave de PARTNER es de la plataforma, no de la tienda — pero SÍ depende
  // del ambiente de la tienda: ver `partnerKeyFor`.
  const PARTNER_KEY = pickPartnerKey(env, Deno.env.get('PAY360_PARTNER_KEY') ?? '', Deno.env.get('PAY360_PARTNER_KEY_LIVE') ?? '')

  const ready = store?.pay360_enabled && store.pay360_business_id && store.pay360_payment_prefix
    && PARTNER_KEY
  if (!ready) {
    await notePaymentFailure(session, 'Pago en línea no disponible: tienda sin configurar 360pay')
    return json({ ok: false, stage: 'config', code: 'store_not_configured', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 409)
  }

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

  // ─── El CLIENTE, con sus datos reales ──────────────────────────────────────
  // `POST /coupons` con solo el `code` crea un cliente llamado **`Internal
  // Customer`**, sin documento ni teléfono: el `customer` anidado que documenta
  // el spec se ignora entero (verificado contra el cupón real `6a87c28e…`). Con
  // veinte pedidos el comercio ve veinte clientes idénticos en su panel y no
  // puede conciliar a quién le cobró. Por eso el cliente se crea ANTES, por su
  // propio endpoint, donde los campos sí se respetan.
  //
  // Solo la PRIMERA vez de cada comprador: el código de pago es estable por
  // comprador, así que si ya hubo una emisión con este código el cliente ya
  // existe en 360pay y volver a crearlo solo puede duplicarlo.
  //
  // Y **best-effort a propósito**: que el panel muestre bien el nombre no vale
  // un pedido sin cobrar. Si esto falla se sigue igual — 360pay creará su
  // cliente genérico, que es exactamente lo que pasa hoy.
  const { data: yaVisto } = await supabase.from('order_sessions')
    .select('id').eq('pay360_consumer_code', consumerCode).limit(1).maybeSingle()

  if (!yaVisto) {
    const { data: buyer } = session.buyer_id
      ? await supabase.from('buyers')
          .select('document_type, document_number').eq('id', session.buyer_id).maybeSingle()
      : { data: null }
    const cliente = await createCustomer(base, PARTNER_KEY, {
      name: session.buyer_name ?? 'Cliente',
      coupon_code: consumerCode,
      phone: session.buyer_phone ? `+51${String(session.buyer_phone).slice(-9)}` : undefined,
      document_type: buyer?.document_type ?? undefined,
      document_number: buyer?.document_number ?? undefined,
    })
    // Se anota, no se corta: el cupón de abajo no depende de esto.
    if (!cliente.ok) {
      console.warn('[pay360-coupon] cliente no creado, sigue con el genérico', JSON.stringify({
        status: cliente.status, error: cliente.error ?? null,
      }))
    }
  }

  // ─── Emitir ────────────────────────────────────────────────────────────────
  // `external_ref` = id de la sesión: es la llave por la que el webhook vuelve
  // a encontrar este pedido, y lo que hace el cruce determinístico.
  const coupon = await createCoupon(base, PARTNER_KEY, {
    amount: rowAmount,                      // SOLES con decimales, no céntimos
    external_ref: String(session.id),
    // Obligatorio en el API real aunque el OpenAPI lo liste opcional.
    expiry_date: couponExpiryFrom(Date.now()),
    // El API exige el código ARRIBA ("customer_id or code is required"); el
    // `coupon_code` anidado del spec no le alcanza.
    code: consumerCode,
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
    // El texto del error va también al log: `payment_reason` lo guarda, pero
    // esto deja el rastro en el sitio donde se mira primero cuando algo falla.
    console.error('[pay360-coupon] create_failed', JSON.stringify({
      status: coupon.status, error: coupon.error ?? null,
      scopes: coupon.requiredScopes ?? null,
    }))
    return json({ ok: false, stage: 'coupon', code: 'create_failed', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 502)
  }

  // El cupón YA existe en 360pay: se guarda ANTES que cualquier otra decisión.
  // Un cupón emitido y no anotado es un cupón huérfano, y eso no es un registro
  // que falta — es plata mal cobrada: el banco paga SIEMPRE el pendiente más
  // antiguo, así que el huérfano se lleva el pago del próximo pedido de ese
  // mismo comprador. Solo esta fila permite anularlo después.
  await supabase.from('order_sessions').update({
    pay360_coupon_id: coupon.data._id,
    pay360_consumer_code: consumerCode,
    payment_verification: 'PENDING',
    payment_reason: null,
  }).eq('id', session.id)

  // El enlace: primero el que mande 360pay, y si no viene, el que armamos.
  const deeplink = paymentUrlOf(coupon.data as Record<string, unknown>)
    ?? (companyId && serviceId
      ? yapeDeeplink({ companyId, serviceId, consumerCode, name: '360Pay', logo: YAPE_360PAY.logo })
      : null)

  // Sin enlace NO se cae el pedido. El botón es una comodidad, no el cobro: el
  // cupón se paga igual entrando a “Pagar servicios” en Yape y tecleando el
  // código, que es el camino que la caja de pago ya muestra siempre por la
  // paridad con desktop. Tirar aquí dejaba al comprador sin pagar un cupón que
  // sí existía, y al cupón vivo esperando cobrarse solo.
  if (!deeplink) {
    // Qué campos trajo el cupón — solo los NOMBRES, nunca los valores: el
    // cuerpo lleva nombre y teléfono del comprador. Si 360pay devuelve el
    // enlace con otro nombre, esta línea es la que lo delata.
    console.warn('[pay360-coupon] cupón sin enlace — se paga tecleando el código', JSON.stringify({
      coupon: coupon.data._id,
      campos: Object.keys(coupon.data as Record<string, unknown>).sort(),
      yape_configurado: !!(companyId && serviceId),
    }))
  }

  return json({
    ok: true,
    amount_pen: rowAmount,
    consumer_code: consumerCode,
    coupon_id: coupon.data._id,
    // El enlace se resuelve en el SERVIDOR: el front no conoce los
    // identificadores de Yape ni puede alterar a qué servicio apunta. `null`
    // es un valor válido: la caja de pago cae al código tecleado a mano.
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
