// ─── SALES ENGINE · Emisión de la orden de pago (Flow) ───────────────────────
//
// Gemelo de `pay360-coupon` en invariantes, distinto en el modelo: Flow es un
// CHECKOUT ALOJADO. Aquí no se cobra ni se emite un cupón: se crea una orden y
// se devuelve el ENLACE al que el comprador se va a pagar. El dinero se confirma
// después, por `flow-confirm`, y Flow lo devuelve a la PWA por `flow-return`.
// Ver docs/12-FLOW.md.
//
// Los TRES cobros de un pedido pasan por acá —adelanto, saldo y extra—, igual
// que en 360pay y por la misma razón: partirlo duplicaría la config de la
// tienda, la re-derivación del monto y la reutilización de la orden.
//
// Reglas que no se negocian (las mismas de `pay360-coupon`):
//   · El MONTO jamás viene del cliente: se re-deriva (`_shared/advance.ts`) y
//     se contrasta contra la fila.
//   · La configuración se resuelve por la tienda de ORIGEN (`origin_store_id`),
//     nunca por la del vendedor asignado. Con llaves por marca (bloque §41) eso
//     pesa MÁS que antes: las llaves equivocadas no fallan, cobran — y el dinero
//     entra a la cuenta de Flow de otra marca.
//   · Solo pedidos con `payment_provider='FLOW'`.
//   · La fila de `cobros` se escribe ANTES de responder (la lección de PR #35).
//
// Y una que es propia de este motor:
//   · Una orden PENDIENTE se REUTILIZA, no se duplica. En Flow no hay "cupón más
//     antiguo" que secuestre el pago, pero sí hay otra cosa: el comprador puede
//     tener la página de pago abierta en otra pestaña. Si acá se emitiera otra y
//     la fila apuntara a la nueva, pagar la vieja sería un pago que ninguna
//     fila conoce. Por eso, con token guardado, primero se consulta el estado.
//
// Autenticación: el `order_token` ES la credencial.
// Logging: jamás el body, las llaves de Flow ni el enlace de pago completo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer } from '../_shared/advance.ts'
import { columnasDe } from '../_shared/cobros.ts'
import {
  checkoutUrl, crearOrden, EMAIL_DEL_PAGADOR, esFinalSinPago, esPagada, estadoPorToken,
  flowBaseUrl, llavesDeTienda, montoParaFlow, orderExpiryFrom, ORDER_TTL_S, type FlowEnv,
} from '../_shared/flow.ts'

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

/** Tope de emisiones por pedido. Cada una crea una orden real en Flow; sin
 *  corte, un token válido podría llenar la cuenta del comercio de basura. */
const MAX_ISSUES = 6

const NO_PUDIMOS = 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = await req.json().catch(() => ({})) as { order_token?: string; tipo?: string; cobro_id?: string }
  const orderToken = String(body.order_token ?? '').trim()
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
      saldo_amount, saldo_verification
    `)
    .eq('token', orderToken)
    .maybeSingle()

  if (!session) return json({ ok: false, stage: 'validation', code: 'not_found' }, 404)

  const tipo = esExtra ? 'extra' : esSaldo ? 'saldo' : 'adelanto'

  // ─── La fila del cobro, si ya existe ───────────────────────────────────────
  // El extra SIEMPRE existe (la creó el vendedor) y su monto sale de su fila —
  // nunca del cuerpo de la petición. El adelanto y el saldo pueden existir de
  // un intento anterior: se leen para poder REUTILIZAR su orden.
  const { data: fila } = esExtra
    ? await supabase.from('cobros')
        .select('id, tipo, monto, estado, concepto, flow_token, flow_pay_url')
        .eq('id', cobroId).eq('session_id', session.id).maybeSingle()
    : await supabase.from('cobros')
        .select('id, tipo, monto, estado, concepto, flow_token, flow_pay_url')
        .eq('session_id', session.id).eq('tipo', tipo).maybeSingle()

  if (esExtra) {
    if (!fila || fila.tipo !== 'extra') return json({ ok: false, stage: 'validation', code: 'cobro_not_found' }, 404)
    if (String(fila.estado).toUpperCase() === 'ANULADO') {
      return json({ ok: false, stage: 'validation', code: 'cobro_anulado', user_message: 'Este cobro ya no está vigente.' }, 409)
    }
  }

  // ─── Idempotencia por estado ───────────────────────────────────────────────
  const yaCobrado = esExtra
    ? String(fila?.estado).toUpperCase() === 'MATCHED'
    : esSaldo ? session.saldo_verification === 'MATCHED' : session.payment_verification === 'MATCHED'
  if (yaCobrado) {
    const monto = esExtra ? Number(fila?.monto ?? 0) : Number((esSaldo ? session.saldo_amount : session.advance_amount) ?? 0)
    return json({ ok: true, already_paid: true, amount_pen: monto })
  }

  // El saldo y los extras solo se cobran DESPUÉS del adelanto. En Flow no hay
  // el riesgo del "cupón más antiguo", pero la regla de producto es la misma:
  // un saldo pagado antes que el adelanto es una caja que no cuadra.
  if ((esSaldo || esExtra) && session.payment_verification !== 'MATCHED') {
    return json({
      ok: false, stage: 'validation', code: 'advance_not_paid',
      user_message: 'Primero se confirma tu adelanto. Apenas cuadre te habilitamos el pago del saldo.',
    }, 409)
  }

  if (session.status !== 'active') {
    return json({ ok: false, stage: 'validation', code: 'cancelled', user_message: 'Este pedido ya no está activo.' }, 409)
  }
  if (session.payment_provider !== 'FLOW') {
    return json({ ok: false, stage: 'config', code: 'not_flow_order' }, 409)
  }
  if ((session.advance_charge_attempts ?? 0) >= MAX_ISSUES) {
    return json({ ok: false, stage: 'validation', code: 'too_many_attempts', user_message: 'Demasiados intentos. Un asesor te escribirá para coordinar el pago.' }, 429)
  }

  // ─── El monto lo deriva ESTE servidor ──────────────────────────────────────
  // Idéntico a `pay360-coupon`: el adelanto sale del precio y de `advance_choice`
  // con la misma función que usa el front; el saldo, por resta; el extra, de su
  // fila. Nunca del cliente.
  const precio = Number(session.product_price ?? 0)
  const rowAmount = esExtra
    ? Number(fila?.monto ?? 0)
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
      return json({ ok: false, stage: 'config', code: 'amount_mismatch', user_message: NO_PUDIMOS }, 409)
    }
  }

  // ─── Config de la tienda de ORIGEN ─────────────────────────────────────────
  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const { data: store } = await supabase.from('stores')
    .select('flow_enabled, flow_payment_method, flow_env')
    .eq('id', originStoreId).maybeSingle()

  const env = (store?.flow_env === 'live' ? 'live' : 'sandbox') as FlowEnv
  // Las llaves son de LA MARCA (bloque §41), no de plataforma: Flow no habilita
  // integrador para esta cuenta, así que cada marca abre la suya. Viven en
  // `store_secrets` porque `stores` se lee en público.
  const { data: secretos } = await supabase.from('store_secrets')
    .select('flow_api_key, flow_secret_key').eq('store_id', originStoreId).maybeSingle()
  const keys = llavesDeTienda(secretos)

  if (!store?.flow_enabled || !keys) {
    await notePaymentFailure(session, 'Pago en línea no disponible: tienda sin configurar Flow')
    return json({ ok: false, stage: 'config', code: 'store_not_configured', user_message: NO_PUDIMOS }, 409)
  }

  const base = flowBaseUrl(env)

  await supabase.from('order_sessions')
    .update({ advance_charge_attempts: (session.advance_charge_attempts ?? 0) + 1 })
    .eq('id', session.id)

  // ─── ¿Ya hay una orden? Se consulta ANTES de emitir otra ───────────────────
  // Pagada → se responde el hecho (el webhook la cruzará, o ya la cruzó).
  // Pendiente → se devuelve el MISMO enlace: es la orden que el comprador puede
  // tener abierta en otra pestaña. Rechazada o anulada → hace falta otra.
  // Sin respuesta → no se emite a ciegas: `network_after`, y el front espera.
  if (fila?.flow_token) {
    const prev = await estadoPorToken(base, keys, String(fila.flow_token))
    if (!prev.ok && prev.network) return json({ ok: false, stage: 'network_after' }, 502)
    if (prev.ok && esPagada(prev.data)) {
      return json({ ok: true, already_paid: true, amount_pen: rowAmount })
    }
    if (prev.ok && !esFinalSinPago(prev.data) && fila.flow_pay_url) {
      return json({ ok: true, tipo, amount_pen: rowAmount, pay_url: fila.flow_pay_url, reused: true })
    }
    // Un 4xx al consultar (token que Flow ya no reconoce) cae a emitir otra:
    // la vieja no se puede pagar de todos modos.
  }

  // ─── La fila PRIMERO: su id es el `commerceOrder` ──────────────────────────
  // Un pedido tiene N cobros y cada uno es su propia orden en Flow, así que la
  // llave de la orden es la fila, no la sesión. Y existir antes de emitir es lo
  // que garantiza que una orden emitida nunca quede sin fila que la conozca.
  let filaId: string | null = fila?.id ?? null
  if (!esExtra) {
    const { data: creada } = await supabase.from('cobros')
      .upsert(
        { session_id: session.id, store_id: session.store_id ?? null, tipo, monto: rowAmount, estado: 'PENDING' },
        { onConflict: 'session_id,tipo' },
      )
      .select('id').maybeSingle()
    filaId = creada?.id ?? filaId
  }
  if (!filaId) return json({ ok: false, stage: 'config', code: 'no_cobro_row', user_message: NO_PUDIMOS }, 500)

  // ─── Emitir ────────────────────────────────────────────────────────────────
  const venceEl = orderExpiryFrom(Date.now())
  const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1`
  const subject = (esExtra
    ? `${fila?.concepto ?? 'Cobro'} ${session.order_id ?? session.id}`
    : `${esSaldo ? 'Saldo' : 'Adelanto'} ${session.order_id ?? session.id}`).slice(0, 80)

  const orden = await crearOrden(base, keys, {
    commerceOrder: filaId,
    subject,
    amount: montoParaFlow(rowAmount),
    currency: 'PEN',
    payment_currency: 'PEN',
    email: EMAIL_DEL_PAGADOR,
    // Con el ID de Yape el comprador cae DIRECTO en su pantalla, sin selector.
    // Sin él, Flow le muestra el selector — funciona igual, con un paso más.
    paymentMethod: typeof store.flow_payment_method === 'number' ? store.flow_payment_method : undefined,
    urlConfirmation: `${fnBase}/flow-confirm`,
    urlReturn: `${fnBase}/flow-return`,
    optional: { tipo },
    timeout: ORDER_TTL_S,
  })

  if (!orden.ok) {
    if (orden.network) {
      // El POST salió y la respuesta se perdió: la orden PUDO crearse, con un
      // token que no conocemos. No se reintenta a ciegas: el siguiente intento
      // vuelve a pasar por acá y, sin token guardado, emite otra — la vieja no
      // tiene fila y nadie puede pagarla porque nadie tiene su enlace.
      return json({ ok: false, stage: 'network_after' }, 502)
    }
    await notePaymentFailure(session, `No se pudo generar la orden de pago${orden.error ? ` (${orden.error})` : ''}`)
    console.error('[flow-order] create_failed', JSON.stringify({ status: orden.status, error: orden.error ?? null }))
    return json({ ok: false, stage: 'order', code: 'create_failed', user_message: NO_PUDIMOS }, 502)
  }

  const payUrl = checkoutUrl(orden.data)

  // La orden YA existe en Flow: se guarda ANTES que cualquier otra decisión.
  const delCobro = {
    monto: rowAmount,
    estado: 'PENDING',
    flow_token: String(orden.data.token),
    flow_pay_url: payUrl,
    coupon_expires_at: venceEl,
  }
  await supabase.from('cobros').update(delCobro).eq('id', filaId)

  // Las columnas de siempre, mientras dura la mudanza al bloque §36. Un extra no
  // tiene columna que espejar (`columnasDe` devuelve `{}`).
  if (!esExtra) {
    await supabase.from('order_sessions').update({
      ...columnasDe(tipo, { monto: rowAmount, estado: 'PENDING', coupon_expires_at: venceEl }),
      ...(esSaldo ? {} : { payment_reason: null }),
    }).eq('id', session.id)
  }

  return json({
    ok: true,
    tipo,
    amount_pen: rowAmount,
    expires_at: venceEl,
    // El enlace lo arma el SERVIDOR. El front solo navega.
    pay_url: payUrl,
  })
})

/** Deja el motivo en la fila y, la PRIMERA vez, avisa a Ventas por el chat. */
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
