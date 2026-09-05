// ─── SALES ENGINE · Emisión del cupón de cobro (360pay) ──────────────────────
//
// DOS cobros por pedido, no uno (bloque §31 del esquema):
//
//   · `adelanto` — al cerrar el checkout. O una parte, o el precio entero.
//   · `saldo`    — después, cuando el pedido ya tiene guía: lo que falta. Al
//                  pagarlo se suelta la clave de recojo (27.d).
//
// Es la MISMA emisión con otro monto y otras columnas, así que vive en la misma
// función: partirla en dos habría duplicado la config de la tienda, el cliente
// de 360pay, la anulación previa y el armado del deeplink — cinco sitios donde
// las dos podrían separarse.
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
import { columnasDe } from '../_shared/cobros.ts'
import { anotarResultado } from '../_shared/api-eventos.ts'
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

  const body = await req.json().catch(() => ({})) as { order_token?: string; tipo?: string; cobro_id?: string }
  const orderToken = String(body.order_token ?? '').trim()
  // Un cobro EXTRA se pide por su id: el monto sale de su fila, que la escribió
  // el vendedor. El adelanto y el saldo siguen derivándose acá — de esos el
  // monto nunca lo pone nadie, se calcula (ver más abajo).
  const cobroId = String(body.cobro_id ?? '').trim()
  const esExtra = !!cobroId
  const esSaldo = !esExtra && body.tipo === 'saldo'
  if (!orderToken) return json({ ok: false, stage: 'validation', code: 'missing_token' }, 400)

  const { data: session } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, origin_store_id, status, buyer_id, buyer_name, buyer_phone,
      advance_amount, payment_verification, payment_provider,
      product_price, advance_choice, advance_charge_attempts,
      pay360_coupon_id, pay360_consumer_code,
      saldo_amount, saldo_verification, pay360_saldo_coupon_id
    `)
    .eq('token', orderToken)
    .maybeSingle()

  if (!session) return json({ ok: false, stage: 'validation', code: 'not_found' }, 404)

  // ─── El cobro extra, si es uno ─────────────────────────────────────────────
  // Su fila manda: el monto lo escribió el vendedor y ya está guardado. Se lee
  // de la base y NO del cuerpo de la petición — si el monto viniera en el POST,
  // quien llama fijaría lo que se le cobra.
  const { data: filaExtra } = esExtra
    ? await supabase.from('cobros')
        .select('id, tipo, monto, estado, concepto, pay360_coupon_id')
        .eq('id', cobroId).eq('session_id', session.id).maybeSingle()
    : { data: null }

  if (esExtra) {
    if (!filaExtra || filaExtra.tipo !== 'extra') return json({ ok: false, stage: 'validation', code: 'cobro_not_found' }, 404)
    if (String(filaExtra.estado).toUpperCase() === 'ANULADO') {
      return json({ ok: false, stage: 'validation', code: 'cobro_anulado', user_message: 'Este cobro ya no está vigente.' }, 409)
    }
    if (String(filaExtra.estado).toUpperCase() === 'MATCHED') {
      return json({ ok: true, already_paid: true, amount_pen: Number(filaExtra.monto ?? 0) })
    }
  }

  // ─── Idempotencia por estado ───────────────────────────────────────────────
  // Ya pagado: se responde el hecho, jamás se emite otro cupón. Emitir uno nuevo
  // sobre un cobro pagado es pedirle al comprador que pague dos veces.
  const yaCobrado = !esExtra && (esSaldo ? session.saldo_verification === 'MATCHED' : session.payment_verification === 'MATCHED')
  if (yaCobrado) {
    return json({ ok: true, already_paid: true, amount_pen: Number((esSaldo ? session.saldo_amount : session.advance_amount) ?? 0) })
  }

  // El saldo solo se cobra DESPUÉS del adelanto, y no es una regla de orden: es
  // la que evita cobrar dos veces mal. El código de pago identifica al CLIENTE y
  // el banco cobra SIEMPRE el cupón pendiente más antiguo — con el adelanto sin
  // pagar y un cupón de saldo vivo, quien va a pagar el saldo termina pagando el
  // adelanto, por otro monto.
  // El mismo candado vale para un extra: mientras el adelanto no haya cruzado,
  // el cupón más antiguo del comprador es ESE, y el que venga a pagar otra cosa
  // terminaría pagándolo — por otro monto.
  if ((esSaldo || esExtra) && session.payment_verification !== 'MATCHED') {
    return json({
      ok: false, stage: 'validation', code: 'advance_not_paid',
      user_message: 'Primero se confirma tu adelanto. Apenas cuadre te habilitamos el pago del saldo.',
    }, 409)
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
  //
  // El saldo se deriva igual de estricto y por resta: precio menos lo ya
  // cobrado. Nunca del cliente — pedir "cuánto debo" y creerle es dejar que el
  // comprador fije lo que se le cobra.
  const precio = Number(session.product_price ?? 0)
  const rowAmount = esExtra
    ? Number(filaExtra?.monto ?? 0)
    : esSaldo
      ? Math.max(0, Math.round(precio - Number(session.advance_amount ?? 0)))
      : Number(session.advance_amount ?? 0)

  if (esExtra) {
    if (!(rowAmount > 0)) return json({ ok: false, stage: 'validation', code: 'monto_invalido' }, 409)
  } else if (esSaldo) {
    if (rowAmount <= 0) {
      return json({ ok: false, stage: 'validation', code: 'no_saldo', user_message: 'Este pedido ya está pagado por completo.' }, 409)
    }
  } else {
    const expected = advanceForServer(precio, String(session.advance_choice ?? 'HALF'))
    if (expected <= 0 || rowAmount <= 0 || session.payment_verification === 'NOT_REQUIRED') {
      return json({ ok: false, stage: 'validation', code: 'no_advance' }, 400)
    }
    if (rowAmount !== expected) {
      await supabase.from('order_sessions')
        .update({ payment_reason: `Adelanto del pedido (S/${rowAmount}) no coincide con el derivado (S/${expected}) — revisar antes de emitir` })
        .eq('id', session.id)
      return json({ ok: false, stage: 'config', code: 'amount_mismatch', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 409)
    }
  }

  // ─── Config de la tienda de ORIGEN ─────────────────────────────────────────
  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const [{ data: store }, { data: secrets }] = await Promise.all([
    supabase.from('stores')
      .select('pay360_enabled, pay360_business_id, pay360_payment_prefix, pay360_env')
      .eq('id', originStoreId).maybeSingle(),
    supabase.from('store_secrets')
      .select('payment_code_secret').eq('store_id', originStoreId).maybeSingle(),
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
  const codeSecret = secrets?.payment_code_secret ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const consumerCode = session.pay360_consumer_code
    ?? await consumerCodeFor(String(store.pay360_payment_prefix), codeSecret, buyerKey)

  await supabase.from('order_sessions')
    .update({ advance_charge_attempts: (session.advance_charge_attempts ?? 0) + 1 })
    .eq('id', session.id)

  // ─── Reemisión: ¿el cupón anterior ya se pagó? ─────────────────────────────
  // Antes de anular nada se consulta. Anular un cupón ya pagado perdería el
  // rastro del dinero que YA entró.
  const cuponPrevio = esExtra
    ? filaExtra?.pay360_coupon_id ?? null
    : esSaldo ? session.pay360_saldo_coupon_id : session.pay360_coupon_id
  if (cuponPrevio) {
    const prev = await getCoupon(base, PARTNER_KEY, cuponPrevio)
    if (prev.ok && isPaid(prev.data)) {
      return json({ ok: true, already_paid: true, amount_pen: rowAmount })
    }
    if (prev.ok) await annulCoupon(base, PARTNER_KEY, cuponPrevio)
  }

  // ─── Un solo cupón vivo por comprador ──────────────────────────────────────
  //
  // El banco cobra SIEMPRE el cupón pendiente más antiguo del código de pago, y
  // el código es del CLIENTE, no del cobro. Con dos cupones vivos —el saldo y un
  // flete, digamos— quien viene a pagar el flete termina pagando el saldo, por
  // otro monto. Hasta hoy no podía pasar: un pedido tenía dos cobros y nunca
  // estaban vivos a la vez. Con los `extra` sí puede.
  //
  // Se anulan los demás antes de emitir, y no se pierde nada: cada tarjeta del
  // chat pide su cupón cuando la tocan, así que la que quedó sin cupón se emite
  // sola en el siguiente clic.
  //
  // El que YA se pagó no se toca —anularlo borraría el rastro del dinero que
  // entró—, por eso se consulta uno por uno antes.
  const { data: otrosCobros } = await supabase.from('cobros')
    .select('pay360_coupon_id, estado')
    .eq('session_id', session.id)
    .not('pay360_coupon_id', 'is', null)

  for (const otro of otrosCobros ?? []) {
    const cupon = String(otro.pay360_coupon_id ?? '')
    if (!cupon || cupon === cuponPrevio) continue
    if (String(otro.estado ?? '').toUpperCase() !== 'PENDING') continue
    const est = await getCoupon(base, PARTNER_KEY, cupon)
    if (est.ok && !isPaid(est.data)) await annulCoupon(base, PARTNER_KEY, cupon)
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
      await anotarResultado(
        { proveedor: 'PAY360', op: 'cliente.crear', storeId: originStoreId, sessionId: session.id },
        cliente,
      )
    }
  }

  // ─── Emitir ────────────────────────────────────────────────────────────────
  // `external_ref` = id de la sesión: es la llave por la que el webhook vuelve
  // a encontrar este pedido, y lo que hace el cruce determinístico.
  // La MISMA fecha que se manda es la que se guarda abajo. Calcularla dos veces
  // —una para el API y otra para la fila— sería que el panel diga un día y el
  // cupón caduque otro, que es peor que no guardarla.
  const venceEl = couponExpiryFrom(Date.now())
  const coupon = await createCoupon(base, PARTNER_KEY, {
    amount: rowAmount,                      // SOLES con decimales, no céntimos
    external_ref: String(session.id),
    // Obligatorio en el API real aunque el OpenAPI lo liste opcional.
    expiry_date: venceEl,
    // El API exige el código ARRIBA ("customer_id or code is required"); el
    // `coupon_code` anidado del spec no le alcanza.
    code: consumerCode,
    // El concepto va en la descripción del cupón: es lo que el comercio ve en el
    // panel de 360pay, y "Cobro ORD-123" sin decir de qué no se concilia.
    description: (esExtra
      ? `${filaExtra?.concepto ?? 'Cobro'} ${session.order_id ?? session.id}`
      : `${esSaldo ? 'Saldo' : 'Adelanto'} ${session.order_id ?? session.id}`).slice(0, 80),
    customer: {
      name: session.buyer_name ?? 'Cliente',
      phone: session.buyer_phone ? `+51${String(session.buyer_phone).slice(-9)}` : undefined,
      coupon_code: consumerCode,
    },
  })

  if (!coupon.ok) {
    await anotarResultado(
      { proveedor: 'PAY360', op: 'cupon.crear', storeId: originStoreId, sessionId: session.id },
      coupon,
    )
    if (coupon.network) {
      // El POST salió y la respuesta se perdió: el cupón PUDO crearse. NO se
      // reintenta a ciegas — el siguiente intento consulta por `external_ref`
      // antes de emitir, o el comprador termina con dos cupones y paga el que
      // no era (gana el más antiguo).
      return json({ ok: false, stage: 'network_after' }, 502)
    }
    await notePaymentFailure(session, `No se pudo generar el cupón de pago${coupon.error ? ` (${coupon.error})` : ''}`)
    return json({ ok: false, stage: 'coupon', code: 'create_failed', user_message: 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.' }, 502)
  }

  // El cupón YA existe en 360pay: se guarda ANTES que cualquier otra decisión.
  // Un cupón emitido y no anotado es un cupón huérfano, y eso no es un registro
  // que falta — es plata mal cobrada: el banco paga SIEMPRE el pendiente más
  // antiguo, así que el huérfano se lleva el pago del próximo pedido de ese
  // mismo comprador. Solo esta fila permite anularlo después.
  //
  // Se escribe en LOS DOS sitios mientras dura la mudanza al bloque §36: la fila
  // de `cobros`, que es el modelo, y las columnas de siempre, que es lo que
  // veinte archivos siguen leyendo. La traducción la hace `columnasDe` —un solo
  // sitio— para que los dos no puedan separarse por descuido.
  const tipo = esExtra ? 'extra' : esSaldo ? 'saldo' : 'adelanto'
  const delCobro = {
    monto: rowAmount,
    estado: 'PENDING',
    pay360_coupon_id: coupon.data._id as string,
    pay360_consumer_code: consumerCode,
    coupon_expires_at: venceEl,
  }

  if (esExtra) {
    // Su fila ya existe —la creó el vendedor—, así que se actualiza por id. Y no
    // toca ninguna columna de `order_sessions`: un extra no tiene columna que
    // espejar, que es exactamente por lo que se hizo la mudanza al bloque §36.
    await supabase.from('cobros').update(delCobro).eq('id', filaExtra!.id)
  } else {
    await supabase.from('cobros')
      .upsert({ session_id: session.id, store_id: session.store_id ?? null, tipo, ...delCobro },
              { onConflict: 'session_id,tipo' })

    await supabase.from('order_sessions').update({
      ...columnasDe(tipo, delCobro),
      ...(esSaldo ? {} : { payment_reason: null }),
    }).eq('id', session.id)
  }

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
    tipo,
    amount_pen: rowAmount,
    consumer_code: consumerCode,
    coupon_id: coupon.data._id,
    expires_at: venceEl,
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
