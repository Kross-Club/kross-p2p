// ─── SALES ENGINE · Webhook de pago de 360pay ────────────────────────────────
// Aquí se confirma el dinero, y es el CAMINO PRINCIPAL, no una red de
// seguridad: con cupones no hay ninguna respuesta síncrona que diga "pagado".
// Si este handler falla, el pedido queda cobrado y sin cruzar.
//
// Se despliega con --no-verify-jwt: lo llama 360pay, no un usuario.
// La autenticidad la da la FIRMA, no un JWT.
//
// Orden de las defensas, y ninguna es opcional:
//   1. Body CRUDO primero. Se verifica antes de parsear: re-serializar el JSON
//      cambia orden y espacios, y rompe la firma de un evento legítimo.
//   2. Firma HMAC-SHA256 sobre `timestamp + "." + body`, con ventana de replay.
//   3. Dedupe por X-360Pay-Event-Id (NO Delivery-Id: cambia en cada reintento,
//      así que dedupear por él dejaría entrar el mismo pago una vez por intento).
//   4. **Re-consulta del cupón contra 360pay.** La firma dice que el mensaje es
//      auténtico; la consulta dice que el pago existe. La doc lo pide explícito:
//      "no dependas del número de intento para decidir si el pago es válido;
//      usa el estado y los IDs del payload".
//   5. El MONTO se contrasta contra el del pedido. Un cupón pagado por menos no
//      es un adelanto pagado.
//
// Responder 2xx rápido es parte del contrato: 360pay reintenta si no lo ve.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { columnasDe } from '../_shared/cobros.ts'
import { anotar, anotarConversion, anotarResultado } from '../_shared/api-eventos.ts'
import { comisionDeKross, desgloseDelEvento, hayDesvio } from '../_shared/comision.ts'
import { acuseDePago } from '../_shared/acuse-de-pago.ts'
import { mensajeDeClave } from '../_shared/mensaje-de-guia.ts'
import { isPickupDispatch } from '../_shared/despacho.ts'
import { notifyBuyer } from '../_shared/notificar.ts'
import {
  PAY360_HEADERS, getCoupon, isPaid, pay360BaseUrl, pickPartnerKey, verifySignature, type Pay360Env,
} from '../_shared/pay360.ts'
import { dispatchConversion, hasAnyCapi, runInBackground, type AdsConfig } from '../_shared/capi.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** 200 salvo que queramos el reintento. Un 4xx por evento inválido evita que
 *  360pay reintente algo que nunca va a mejorar. */
const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ─── Avisarle a quien esté mirando ───────────────────────────────────────────
//
// Esta función escribía en la base y no le avisaba a nadie. Mientras lo único
// que cambiaba era el color de una tarjeta, se notaba poco: el vendedor recargaba
// y ahí estaba. Con el COMPROBANTE deja de ser aceptable — el mensaje que lleva
// el botón entra al hilo y el chat abierto no se entera, así que el pago cruza y
// en pantalla no pasa nada. Es exactamente lo que uno mira cuando prueba un
// cobro.
//
// Best-effort a propósito: el 2xx del webhook JAMÁS depende de esto. La plata ya
// está confirmada en la base; que la pantalla se entere ahora o al recargar es
// otra cosa, y perder el cobro por un aviso sería el peor negocio posible.
async function broadcast(sessionId: string, event: string, payload: unknown) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ messages: [{ topic: `order:${sessionId}`, event, payload }] }),
    })
  } catch (e) {
    console.warn('[pay360-webhook] no se pudo avisar por el canal', String(e).slice(0, 200))
  }
}

/**
 * Los dos avisos que van juntos cuando un cobro entra: el mensaje nuevo y que
 * la plata del pedido cambió.
 *
 * El mensaje se manda ENTERO por el canal —igual que lo hace el chat cuando
 * escribe alguien— y `cobros_update` no lleva nada: la lista se vuelve a pedir
 * por la puerta que la calcula. La plata no viaja por un canal de broadcast.
 *
 * ⚠️ Solo el acuse del comprador (`visibility: 'all'`). El mensaje INTERNO del
 * cruce no se anuncia por acá: `order:<id>` es el canal del comprador —su chat
 * está suscrito y pinta lo que llegue—, así que mandarlo se lo aparecería en
 * pantalla en vivo. Una fuga peor que la de leerlo, porque no hay que buscarla.
 */
async function avisar(sessionId: string, acuse: unknown) {
  if (acuse) await broadcast(sessionId, 'new_message', acuse)
  await broadcast(sessionId, 'cobros_update', {})
}

/**
 * Y el PUSH, para el comprador que no tiene la app abierta — que es casi
 * siempre: acaba de pagar en Yape y está en Yape. Es la mejor notificación que
 * la tienda puede mandar, y hasta hoy el acuse solo existía dentro del chat.
 *
 * El mismo embudo que los mensajes del equipo (`_shared/notificar.ts`): push
 * primero, WhatsApp de respaldo si está encendido, todo en `notifications_log`.
 * Best-effort SIEMPRE: el 2xx del webhook jamás depende de un aviso.
 */
async function empujarAcuse(s: {
  sesion: { id: string; token?: string | null; buyer_id?: string | null; buyer_name?: string | null
            store_id?: string | null; product_name?: string | null }
  tienda: { nombre?: string | null; notif_icon_url?: string | null; logo_url?: string | null } | null
  cuerpo: string
}) {
  try {
    const icono = s.tienda?.notif_icon_url ?? s.tienda?.logo_url ?? null
    await notifyBuyer({
      buyerId: s.sesion.buyer_id ?? null,
      sessionId: s.sesion.id,
      storeId: s.sesion.store_id ?? null,
      title: `✅ ${s.tienda?.nombre ?? 'Kross'} · Pago recibido`,
      // El acuse ya arranca con "✅ ¡Recibimos…": en el push el check va en el
      // título, así que del cuerpo se quita para no decirlo dos veces.
      body: s.cuerpo.replace(/^✅\s*/, '').slice(0, 140),
      url: s.sesion.token ? `/p/${s.sesion.token}` : '/',
      tag: `pago-${s.sesion.id}`,
      type: 'status',
      icon: icono, badge: icono,
      waName: (s.sesion.buyer_name ?? 'Hola').split(' ')[0],
      waProduct: s.sesion.product_name ?? 'tu pedido',
    })
  } catch (e) {
    console.warn('[pay360-webhook] push del acuse no salió', String(e).slice(0, 200))
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'Method not allowed' }, 405)

  // 1 · el body CRUDO, antes de cualquier parseo
  const rawBody = await req.text()
  const h = req.headers
  const eventId = h.get(PAY360_HEADERS.eventId)
  const hookId = h.get(PAY360_HEADERS.hookId)

  if (!eventId) {
    console.error('[pay360-webhook] sin event id')
    return ok({ error: 'missing_event_id' }, 400)
  }

  // ─── ¿De qué tienda es este hook? ──────────────────────────────────────────
  // El secreto es POR NEGOCIO, así que primero hay que saber cuál. `Hook-Id` es
  // la vía directa; si no viene, se cae al `external_ref` del payload.
  const payload = safeJson(rawBody)
  const externalRef = pickString(payload, 'external_ref')
  const couponId = pickString(payload, '_id') ?? pickString(payload, 'coupon_id')

  let secretRow: { store_id: string; pay360_hook_secret: string | null } | null = null
  if (hookId) {
    const { data } = await supabase.from('store_secrets')
      .select('store_id, pay360_hook_secret').eq('pay360_hook_id', hookId).maybeSingle()
    secretRow = data
  }
  if (!secretRow && externalRef) {
    const { data: s } = await supabase.from('order_sessions')
      .select('origin_store_id, store_id').eq('id', externalRef).maybeSingle()
    const storeId = s?.origin_store_id ?? s?.store_id
    if (storeId) {
      const { data } = await supabase.from('store_secrets')
        .select('store_id, pay360_hook_secret').eq('store_id', storeId).maybeSingle()
      secretRow = data
    }
  }

  const secret = secretRow?.pay360_hook_secret ?? ''
  // 2 · firma. Sin secreto configurado NO se procesa: un webhook sin verificar
  // es una puerta abierta para marcar pedidos como pagados desde fuera.
  const check = await verifySignature(secret, rawBody, {
    signature: h.get(PAY360_HEADERS.signature),
    timestamp: h.get(PAY360_HEADERS.timestamp),
  })
  if (!check.ok) {
    await anotar({
      proveedor: 'PAY360', op: 'webhook.firma', outcome: 'RECHAZO',
      errorCode: check.reason, detail: `hook ${hookId ? 'sí' : 'no'} · evento ${eventId}`,
    })
    // 401 y no 4xx genérico: si el motivo es nuestro (secreto no cargado
    // todavía), que 360pay reintente y el evento no se pierda.
    return ok({ error: 'bad_signature' }, 401)
  }

  const storeId = String(secretRow!.store_id)

  // 3 · dedupe por Event-Id, contra el índice único (store_id, dedupe_key)
  const dedupeKey = `360pay:${eventId}`
  const { error: dupErr } = await supabase.from('payment_events').insert({
    store_id: storeId, source: '360PAY', provider: '360PAY',
    dedupe_key: dedupeKey, received_at: new Date().toISOString(),
    raw: rawBody.slice(0, 20_000),
    ignored_reason: 'procesando',
  })
  if (dupErr) {
    // 23505 = ya lo procesamos. Es un reintento de 360pay, no un error: 2xx para
    // que deje de reintentar.
    if (dupErr.code === '23505') return ok({ received: true, duplicate: true })
    console.error('[pay360-webhook] insert falló', JSON.stringify({ code: dupErr.code }))
    return ok({ error: 'db' }, 500)
  }

  // ─── El pedido ─────────────────────────────────────────────────────────────
  const sessionCols = 'id, order_id, token, store_id, origin_store_id, buyer_name, buyer_phone, buyer_id, product_id, product_name, product_price, dispatch_type, advance_amount, payment_verification, payment_provider, pay360_coupon_id, pay360_saldo_coupon_id, pay360_consumer_code, pay360_saldo_consumer_code, saldo_amount, saldo_verification, shalom_pickup_code, ad_fbp, ad_fbc, ad_ttp, ad_ttclid, ad_client_ua, ad_client_ip, ad_source_url'
  const { data: session } = externalRef
    ? await supabase.from('order_sessions')
        .select(sessionCols)
        .eq('id', externalRef).maybeSingle()
    : await supabase.from('order_sessions')
        .select(sessionCols)
        // Los DOS cobros del pedido comparten `external_ref`, así que por ahí
        // no se distinguen; por cupón sí. `or` porque el saldo tiene el suyo.
        .or(`pay360_coupon_id.eq.${couponId ?? '__none__'},pay360_saldo_coupon_id.eq.${couponId ?? '__none__'}`)
        .maybeSingle()

  if (!session) return await ignore(storeId, dedupeKey, 'pedido no encontrado')
  if (session.payment_provider !== '360PAY') {
    return await ignore(storeId, dedupeKey, 'pedido de otro motor de cobro')
  }

  // ─── ¿Cuál de los DOS cobros pagó? ─────────────────────────────────────────
  //
  // Un pedido tiene hasta dos cupones —adelanto y saldo (bloque §31 del
  // esquema)— y el webhook llega igual para los dos. Lo decide el id del cupón,
  // que es lo único que los distingue: `external_ref` es el mismo pedido en
  // ambos, y el monto no sirve —la mitad de un pedido de S/180 es 90, igual que
  // su saldo—.
  //
  // ⚠️ Primero se busca el cupón entre los COBROS (bloque §36). Sin esto, un
  // cobro extra pagado no calzaba con ninguna de las dos columnas, caía en el
  // `else` de abajo y se marcaba como ADELANTO: le pisaba `advance_amount` con
  // el monto del flete y daba por cobrado un adelanto que nadie pagó. Es la
  // clase de error que solo se nota cuando ya no cuadra la caja.
  const { data: cobroDelCupon } = couponId
    ? await supabase.from('cobros')
        .select('id, tipo, monto, estado, concepto')
        .eq('session_id', session.id).eq('pay360_coupon_id', couponId).maybeSingle()
    : { data: null }

  const esExtra = cobroDelCupon?.tipo === 'extra'

  // Sin cupón identificable manda el estado: si el adelanto ya está cruzado, lo
  // que puede estar pagándose es el saldo.
  const esSaldo = esExtra
    ? false
    : cobroDelCupon?.tipo === 'saldo' || (couponId && session.pay360_saldo_coupon_id === couponId)
      ? true
      : couponId && session.pay360_coupon_id === couponId
        ? false
        : session.payment_verification === 'MATCHED'

  if (esExtra && String(cobroDelCupon?.estado).toUpperCase() === 'MATCHED') {
    return await ignore(storeId, dedupeKey, 'actualización de un cobro ya verificado')
  }
  if (!esExtra && esSaldo && session.saldo_verification === 'MATCHED') {
    return await ignore(storeId, dedupeKey, 'actualización de un saldo ya verificado')
  }
  if (!esExtra && !esSaldo && session.payment_verification === 'MATCHED') {
    // No es un duplicado ni un error: la doc avisa que si el cupón ya estaba
    // pagado y DESPUÉS se corrige el código bancario (`operation_number`,
    // `bank_tx_id`), 360pay emite otro PAYMENT_PAID con un Event-Id DISTINTO.
    // O sea, pasa el dedupe legítimamente. Se registra como actualización y no
    // se vuelve a tocar el pedido: re-confirmar lo ya confirmado solo puede
    // romperlo.
    return await ignore(storeId, dedupeKey, 'actualización de un pago ya verificado')
  }

  // 4 · la VERDAD la da 360pay, no el payload
  const id = session.pay360_coupon_id ?? couponId
  if (!id) return await ignore(storeId, dedupeKey, 'evento sin cupón identificable')

  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const { data: store } = await supabase.from('stores')
    .select('pay360_env, meta_pixel_id, tiktok_pixel_id, nombre, notif_icon_url, logo_url').eq('id', originStoreId).maybeSingle()
  const env = (store?.pay360_env === 'live' ? 'live' : 'sandbox') as Pay360Env

  const coupon = await getCoupon(pay360BaseUrl(env, 'partner'),
    pickPartnerKey(env, Deno.env.get('PAY360_PARTNER_KEY') ?? '', Deno.env.get('PAY360_PARTNER_KEY_LIVE') ?? ''), id)
  if (!coupon.ok) {
    // No se pudo confirmar: se suelta el dedupe para que el reintento de 360pay
    // pueda volver a intentarlo, y se pide el reintento con un 5xx.
    await supabase.from('payment_events').delete()
      .eq('store_id', storeId).eq('dedupe_key', dedupeKey)
    await anotarResultado({ proveedor: 'PAY360', op: 'cupon.estado', storeId: originStoreId }, coupon)
    return ok({ error: 'coupon_unverified' }, 503)
  }
  if (!isPaid(coupon.data)) {
    return await ignore(storeId, dedupeKey, `cupón en estado ${coupon.data.status ?? '?'}`)
  }

  // 5 · el monto. Un cupón pagado por menos NO es el cobro pagado.
  const rowAmount = esExtra
    ? Number(cobroDelCupon?.monto ?? 0)
    : esSaldo
      ? Math.max(0, Math.round(Number(session.product_price ?? 0) - Number(session.advance_amount ?? 0)))
      : Number(session.advance_amount ?? 0)
  const paid = Number(coupon.data.amount ?? 0)
  const queCobro = esExtra ? (cobroDelCupon?.concepto ?? 'cobro') : esSaldo ? 'saldo' : 'adelanto'
  if (!(paid >= rowAmount)) {
    await supabase.from('order_sessions').update({
      payment_reason: `Cupón 360pay pagado por S/${paid}, el ${queCobro} era S/${rowAmount} — revisar antes de confirmar`,
    }).eq('id', session.id)
    return await ignore(storeId, dedupeKey, `monto insuficiente (S/${paid} < S/${rowAmount})`)
  }

  // ─── Confirmar ─────────────────────────────────────────────────────────────
  const matchedAt = new Date().toISOString()
  await supabase.from('payment_events').update({
    provider_charge_id: String(coupon.data._id),
    provider_fee_pen: typeof coupon.data.fee_platform === 'number' ? coupon.data.fee_platform : null,
    amount_pen: paid,
    sender_name: session.buyer_name ?? null,
    matched_order_id: session.id, matched_at: matchedAt,
    ignored_reason: null,
  }).eq('store_id', storeId).eq('dedupe_key', dedupeKey)

  const { data: ev } = await supabase.from('payment_events')
    .select('id').eq('store_id', storeId).eq('dedupe_key', dedupeKey).maybeSingle()

  // El cobro entró. Se marca en LOS DOS sitios mientras dura la mudanza al
  // bloque §36 —la fila de `cobros` y las columnas de siempre— y la traducción
  // la hace `columnasDe`, un solo sitio, para que no puedan separarse.
  //
  // La fila se busca POR EL CUPÓN y no por el tipo: es el cupón el que acaba de
  // pagarse, y un pedido puede tener varios cobros vivos. Buscar por tipo daría
  // por cobrado el que no fue en cuanto exista un `extra`.
  const tipo = esExtra ? 'extra' : esSaldo ? 'saldo' : 'adelanto'

  // Lo que se le descontó al comercio por ESTE cobro (bloque §39). Sale del
  // evento y no del cálculo: `fee_platform + fee_partner` es lo que de verdad
  // se descuenta de la liquidación, y la marca tiene derecho a ver eso y no lo
  // que nuestra tabla cree. Si 360pay no mandó el desglose queda NULL — un
  // número estimado en una columna de plata no se distingue de uno medido.
  const desglose = desgloseDelEvento(coupon.data.fee_platform, coupon.data.fee_partner)

  // Y el control: la tarifa la aplica la PASARELA, así que si lo descontado no
  // coincide con la tarifa de Kross, el config del business quedó con la vieja.
  // Solo se registra —la plata ya entró y rechazarla sería mucho peor que
  // cobrar de más— pero sin esta línea el desvío no lo notaría nadie.
  if (desglose && hayDesvio(comisionDeKross(paid), desglose.comision)) {
    console.warn(`[comision] desvío en ${session.id}: cobro de S/${paid} `
      + `→ esperado S/${comisionDeKross(paid)}, descontado S/${desglose.comision}`)
  }

  const delCobro = {
    monto: paid, estado: 'MATCHED', matched_at: matchedAt, payment_event_id: ev?.id ?? null,
    // `columnasDe` ignora lo que no sabe espejar, así que estos dos no viajan
    // a `order_sessions`: viven solo en la fila del cobro, que es de quien son.
    comision_pen: desglose?.comision ?? null,
    costo_pasarela_pen: desglose?.costo ?? null,
  }

  // Y su id se guarda: es la dirección del COMPROBANTE que sale enseguida por el
  // chat. Sin él el comprador recibe un "gracias por tu pago" sin nada que
  // enseñar.
  let cobroId: string | null = cobroDelCupon?.id ?? null
  if (cobroDelCupon) {
    await supabase.from('cobros').update(delCobro).eq('id', cobroDelCupon.id)
  } else {
    // Sin fila previa —un cupón emitido antes de que existiera la tabla— se
    // crea ahora: la plata entró y tiene que quedar registrada igual.
    const { data: creado } = await supabase.from('cobros').upsert(
      { session_id: session.id, store_id: session.store_id ?? null, tipo,
        pay360_coupon_id: coupon.data._id,
        // El código de pago viene de la fila del pedido: es lo que el
        // comprobante enseña como identificador, y sin él la constancia sale
        // sin con qué buscarla en el portal de 360pay.
        pay360_consumer_code: (esSaldo ? session.pay360_saldo_consumer_code : session.pay360_consumer_code) ?? null,
        ...delCobro },
      { onConflict: 'session_id,tipo' })
      .select('id').maybeSingle()
    cobroId = creado?.id ?? null
  }

  // Un `extra` NO tiene columna que espejar —`columnasDe` devuelve `{}`— y
  // tampoco mueve la etapa: cobrar un flete no confirma un pedido.
  const patch = { ...columnasDe(tipo, delCobro), ...(esExtra || esSaldo ? {} : { payment_reason: null, stage: 'confirmado' }) }
  if (Object.keys(patch).length > 0) {
    await supabase.from('order_sessions').update(patch).eq('id', session.id)
  }

  // Los DOS mensajes del cruce manual, con la misma copy: ya está calibrada y el
  // comprador no tiene por qué notar QUÉ motor cobró.
  const bank = coupon.data.bank_tx_id ? ` · ${coupon.data.bank_tx_id}` : ''
  await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    type: 'text', visibility: 'sellers',
    body: `✅ ${esExtra ? (cobroDelCupon?.concepto ?? 'Cobro') : esSaldo ? 'Saldo' : 'Adelanto'} de S/${paid} verificado automáticamente`
      + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
      + ` · 360pay ${coupon.data._id}${bank}`,
  })
  // El acuse al comprador. La copy vive en `_shared/acuse-de-pago.ts` porque la
  // escriben DOS: esta función, en una tienda de verdad, y el demo, que enseña
  // este mismo momento diez segundos después de mandar la tarjeta. Un demo que
  // dijera otra frase estaría enseñando un producto que no existe.
  //
  // Si el pedido lo RECOGE el comprador cambia dónde paga su saldo, y eso lo
  // responde `_shared/despacho.ts` — la única definición de "es recojo" del
  // repo. Acá había una copia escrita a mano que no conocía `AGENCIA`.
  const esRecojo = isPickupDispatch(session.dispatch_type)
  if (esExtra) {
    const { data: acuse } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'status_update', visibility: 'all', cobro_id: cobroId,
      body: acuseDePago({ tipo: 'extra', pagado: paid, total: Number(session.product_price ?? 0), esRecojo, concepto: cobroDelCupon?.concepto }),
    }).select().single()
    await avisar(session.id, acuse)
    if (acuse) await empujarAcuse({ sesion: session, tienda: store, cuerpo: acuse.body ?? '' })
    // Y se corta acá, antes de CAPI: un cobro extra no es otra compra. Contarlo
    // como `Purchase` le sumaría a Meta y a TikTok una conversión por cada flete
    // cobrado, y el público "de los que sí pagaron" —que es para lo que existe
    // ese evento— quedaría inflado con pedidos repetidos.
    return ok({ received: true, matched: true, extra: true })
  }

  const { data: acuse } = await supabase.from('chat_messages').insert({
    session_id: session.id, sender_role: 'system', sender_name: 'Kross',
    // Apunta al cobro: eso convierte este aviso en la tarjeta con el botón que
    // abre la constancia (`TarjetaDeComprobante`). Ver bloque §37.
    type: 'status_update', visibility: 'all', cobro_id: cobroId,
    body: acuseDePago({
      tipo: esSaldo ? 'saldo' : 'adelanto',
      pagado: paid, total: Number(session.product_price ?? 0), esRecojo,
    }),
  }).select().single()
  await avisar(session.id, acuse)
  if (acuse) await empujarAcuse({ sesion: session, tienda: store, cuerpo: acuse.body ?? '' })

  // ─── La clave de recojo, contra el saldo pagado ────────────────────────────
  //
  // El acuse de arriba acaba de prometer "Te enviamos tu clave de recojo por
  // acá", y esta es la entrega: el pago del saldo es EL momento en que la clave
  // deja de estar retenida (02 §El saldo de agencia — quien la tiene se lleva
  // el paquete). Solo si el pedido la tiene: la guía registrada a mano no
  // eligió clave —la suya vive en el comprobante físico— y ahí la manda una
  // persona, como siempre. Sin push aparte: el push del acuse ya lo trae al
  // chat, donde la clave lo espera.
  if (esSaldo && esRecojo && session.shalom_pickup_code) {
    const { data: claveMsg } = await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'status_update', visibility: 'all',
      body: mensajeDeClave(session.shalom_pickup_code),
    }).select().single()
    if (claveMsg) await broadcast(session.id, 'new_message', claveMsg)
  }

  // ─── CAPI · Purchase server-side ───────────────────────────────────────────
  //
  // SOLO en el primer cobro. El saldo es la segunda mitad de la MISMA compra:
  // reportarlo como otro `Purchase` le contaría a Meta y a TikTok dos
  // conversiones por un pedido, y el público "de los que sí pagaron" —que es
  // para lo que existe este evento— se llenaría de duplicados.
  if (esSaldo) return ok({ received: true, matched: true, saldo: true })

  // El evento que arma el público "de los que SÍ pagaron": se dispara SOLO aquí,
  // desde el servidor, porque el pago se confirma por webhook cuando el
  // comprador ya se fue a Yape y el navegador no puede reportarlo. `value` = el
  // adelanto realmente pagado (dinero garantizado); el total va como propiedad
  // extra. event_id = session.id (determinístico). Corre en segundo plano y va
  // en try/catch: una falla de CAPI JAMÁS cambia el 2xx del webhook —el dinero
  // ya está confirmado—. Ver docs/09-PIXELS-CAPI.md.
  try {
    const cfg: AdsConfig = {
      metaPixelId: store?.meta_pixel_id ?? null,
      tiktokPixelId: store?.tiktok_pixel_id ?? null,
    }
    if (cfg.metaPixelId || cfg.tiktokPixelId) {
      const { data: adSec } = await supabase.from('store_secrets')
        .select('meta_capi_token, tiktok_capi_token, meta_test_event_code, tiktok_test_event_code')
        .eq('store_id', originStoreId).maybeSingle()
      cfg.metaToken = adSec?.meta_capi_token ?? null
      cfg.metaTestCode = adSec?.meta_test_event_code ?? null
      cfg.tiktokToken = adSec?.tiktok_capi_token ?? null
      cfg.tiktokTestCode = adSec?.tiktok_test_event_code ?? null
      if (hasAnyCapi(cfg)) {
        const orderValue = Number(session.product_price ?? 0)
        runInBackground(anotarConversion({ storeId: originStoreId, sessionId: String(session.id), evento: 'PURCHASE' }, dispatchConversion('PURCHASE', cfg, {
          eventId: String(session.id),
          sourceUrl: session.ad_source_url ?? null,
          value: paid,
          contentId: session.product_id ? String(session.product_id) : null,
          custom: orderValue > 0 ? { order_value: orderValue } : undefined,
          user: {
            phone: session.buyer_phone ?? null,
            fullName: session.buyer_name ?? null,
            externalId: session.buyer_id ? String(session.buyer_id) : null,
            fbp: session.ad_fbp ?? null, fbc: session.ad_fbc ?? null,
            ttp: session.ad_ttp ?? null, ttclid: session.ad_ttclid ?? null,
            clientIp: session.ad_client_ip ?? null, clientUserAgent: session.ad_client_ua ?? null,
          },
        })))
      }
    }
  } catch (e) {
    console.error('[pay360-webhook] CAPI Purchase falló:', String(e))
  }

  // ─── Despachar: el adelanto verificado es lo que autoriza a generar la guía ─
  // Fire-and-forget a propósito: cobrar no puede colgarse de despachar. Si el
  // generador tarda o falla, 360pay ya recibió su 200 y el pedido sigue su
  // curso — Logística registra la guía a mano, como siempre. La función decide
  // sola si el pedido le toca (Shalom + agencia) y trae su propio candado
  // contra dobles emisiones, así que acá no se filtra nada.
  runInBackground(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/shalom-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ session_id: session.id }),
  }))

  return ok({ received: true, matched: true })
})

/** El evento era auténtico pero no aplica. Se DEJA la fila —con el motivo— para
 *  que el reintento no lo re-procese y para que quede la trazabilidad. */
async function ignore(storeId: string, dedupeKey: string, reason: string) {
  await supabase.from('payment_events')
    .update({ ignored_reason: reason })
    .eq('store_id', storeId).eq('dedupe_key', dedupeKey)
  return ok({ received: true, ignored: reason })
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}

/** Busca una clave en la raíz o dentro de `data`: 360pay puede envolver el
 *  evento, y el payload es configurable por hook (`payload_mapping`). */
function pickString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const direct = p[key]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const d = p.data
  if (d && typeof d === 'object') {
    const nested = (d as Record<string, unknown>)[key]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }
  return null
}
