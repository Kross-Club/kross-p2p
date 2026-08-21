// ─── SALES ENGINE · Cobro directo del adelanto con Culqi ─────────────────────
// El comprador pega su código de aprobación de Yape (6 dígitos, vence en 2 min)
// y esta función cobra el adelanto contra la cuenta Culqi de la MARCA:
//
//   token Yape (secure, llave pública) → cargo (api, llave secreta) →
//   payment_events + pedido MATCHED/confirmado + acuse en el chat.
//
// Reglas que no se negocian:
//   · El MONTO jamás viene del cliente: se re-deriva aquí del destino del
//     pedido (`_shared/advance.ts`) y se contrasta contra la fila.
//   · Las llaves se resuelven por la tienda de ORIGEN del pedido
//     (`origin_store_id`) — nunca por la del vendedor asignado.
//   · Solo pedidos con `payment_provider='CULQI'`: los del flujo manual tienen
//     su propia piscina de cruce y mezclarlas produce dobles cobros.
//   · Un claim-lock en `payment_events` (índice único de 13.c) garantiza que
//     dos toques concurrentes no generen dos cargos reales.
//   · Si la red muere DESPUÉS de mandar el cargo, se responde `network_after`:
//     el front NO reintenta (el dinero pudo salir) y el webhook repara.
//
// Autenticación: el `order_token` ES la credencial — el mismo secreto de
// 24 chars que `get-session` acepta; quien lo tiene es el dueño del pedido.
// Logging: jamás el body, el OTP, el celular ni una llave. Ver _shared/culqi.ts.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { advanceForServer } from '../_shared/advance.ts'
import {
  chargeForStorage, createCharge, createYapeToken, declineCodeOf, errorForLog,
} from '../_shared/culqi.ts'

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

/** Intentos de cobro por pedido. Con un token válido (el propio) se podrían
 *  lanzar OTPs sin fin contra la pk de la marca; después de esto, lo humano
 *  es que un asesor cobre por el chat. */
const MAX_ATTEMPTS = 8

/** Un lock más viejo que esto se considera huérfano (la función murió a mitad)
 *  y el siguiente intento puede tomarlo. También es el enfriamiento natural
 *  tras un `network_after`. */
const LOCK_STALE_MS = 90_000

const LOCK_PREFIX = 'culqi:lock:'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = await req.json().catch(() => ({})) as {
    order_token?: string; phone?: string; otp?: string
  }

  const orderToken = String(body.order_token ?? '').trim()
  if (!orderToken) return json({ ok: false, stage: 'validation', code: 'missing_token' }, 400)

  // ─── El pedido es la credencial ────────────────────────────────────────────
  const { data: session } = await supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, origin_store_id, status, stage, buyer_name,
      advance_amount, payment_verification, payment_event_id, payment_reason,
      payment_provider, dispatch_type, agency_name, advance_charge_attempts,
      product_price, advance_choice
    `)
    .eq('token', orderToken)
    .maybeSingle()

  if (!session) return json({ ok: false, stage: 'validation', code: 'not_found' }, 404)

  // ─── Entrada del comprador ─────────────────────────────────────────────────
  // Errores de formato no consumen intentos: son typos, no ataques.
  const phone = String(body.phone ?? '').replace(/\D/g, '')
  const otp = String(body.otp ?? '').replace(/\D/g, '')
  if (phone.length !== 9 || !phone.startsWith('9')) {
    return json({ ok: false, stage: 'validation', code: 'bad_phone', user_message: 'Revisa tu número de celular: son 9 dígitos y empieza en 9.' }, 400)
  }
  if (otp.length !== 6) {
    return json({ ok: false, stage: 'validation', code: 'bad_otp', user_message: 'El código de aprobación tiene 6 dígitos.' }, 400)
  }

  // ─── Idempotencia por estado ───────────────────────────────────────────────
  // Doble tap, retry tras red caída, o el webhook llegó primero: si el adelanto
  // ya está cobrado POR CULQI, se devuelve el cargo existente y listo. Si está
  // MATCHED por un evento del flujo manual, algo se mezcló que no debía:
  // jamás cobrarle encima — se frena y Ventas decide.
  if (session.payment_verification === 'MATCHED') {
    const { data: ev } = await supabase
      .from('payment_events')
      .select('id, provider, provider_charge_id, amount_pen')
      .eq('matched_order_id', session.id)
      .eq('provider', 'CULQI')
      .not('provider_charge_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (ev) {
      return json({ ok: true, already_paid: true, charge_id: ev.provider_charge_id, amount_pen: Number(ev.amount_pen) })
    }
    return json({ ok: false, stage: 'config', code: 'matched_manual', user_message: 'Tu adelanto ya figura registrado. Un asesor lo revisa por el chat.' }, 409)
  }

  if (session.status !== 'active') {
    return json({ ok: false, stage: 'validation', code: 'cancelled', user_message: 'Este pedido ya no está activo.' }, 409)
  }
  // Solo pedidos nacidos para el cobro en línea: uno del flujo manual tiene su
  // dinero llegando por el Yape de la marca, y cobrarlo aquí lo duplicaría.
  if (session.payment_provider !== 'CULQI') {
    return json({ ok: false, stage: 'config', code: 'not_culqi_order' }, 409)
  }

  // ─── El monto lo deriva ESTE servidor, dos veces ───────────────────────────
  const expected = advanceForServer(Number(session.product_price ?? 0), String(session.advance_choice ?? 'HALF'))
  const rowAmount = Number(session.advance_amount ?? 0)
  if (expected <= 0 || rowAmount <= 0 || session.payment_verification === 'NOT_REQUIRED') {
    return json({ ok: false, stage: 'validation', code: 'no_advance' }, 400)
  }
  if (rowAmount !== expected) {
    // La fila no coincide con la tabla de adelantos: front desalineado o fila
    // manipulada. No se cobra NINGUNO de los dos montos sin que alguien mire.
    await supabase.from('order_sessions')
      .update({ payment_reason: `Adelanto del pedido (S/${rowAmount}) no coincide con el derivado (S/${expected}) — revisar antes de cobrar` })
      .eq('id', session.id)
    return json({ ok: false, stage: 'config', code: 'amount_mismatch', user_message: 'No pudimos procesar el pago en línea. Un asesor te escribirá para coordinarlo.' }, 409)
  }
  const amountCents = Math.round(expected * 100)

  if ((session.advance_charge_attempts ?? 0) >= MAX_ATTEMPTS) {
    return json({ ok: false, stage: 'validation', code: 'too_many_attempts', user_message: 'Demasiados intentos. Un asesor te escribirá para coordinar el pago.' }, 429)
  }

  // ─── Llaves de la tienda de ORIGEN ─────────────────────────────────────────
  const originStoreId = String(session.origin_store_id ?? session.store_id)
  const [{ data: store }, { data: secrets }] = await Promise.all([
    supabase.from('stores').select('culqi_enabled, culqi_scope').eq('id', originStoreId).maybeSingle(),
    supabase.from('store_secrets').select('culqi_public_key, culqi_secret_key').eq('store_id', originStoreId).maybeSingle(),
  ])

  const pk = secrets?.culqi_public_key ?? null
  const sk = secrets?.culqi_secret_key ?? null
  const storeNotReady = !store?.culqi_enabled || !pk || !sk
  const outOfScope = store?.culqi_scope === 'PROVINCIA' && session.dispatch_type === 'MOTORIZADO_LIMA'
  if (storeNotReady || outOfScope) {
    // El front no debería llegar aquí (pinta la UI manual sin config), pero si
    // llega, el pedido YA existe: se le dice al comprador que un asesor cobra,
    // y a Ventas se le deja el motivo.
    await notePaymentFailure(session, 'Pago en línea no disponible: tienda sin configurar Culqi')
    return json({ ok: false, stage: 'config', code: storeNotReady ? 'store_not_configured' : 'out_of_scope', user_message: 'No pudimos procesar el pago en línea. Un asesor te escribirá para coordinarlo.' }, 409)
  }

  // ─── Claim-lock: un solo cobro en vuelo por pedido ─────────────────────────
  // INSERT contra el índice único (store_id, dedupe_key). Si choca, hay otro
  // intento en vuelo (o uno murió a medias): con lock fresco se rebota; con
  // lock viejo se toma la posta con un UPDATE condicionado — si ese UPDATE no
  // afecta filas, otro proceso ganó la carrera en este mismo instante.
  const lockKey = `${LOCK_PREFIX}${session.id}`
  const nowIso = new Date().toISOString()
  const { error: lockErr } = await supabase.from('payment_events').insert({
    store_id: originStoreId, source: 'CULQI', raw: '(lock de cobro en vuelo)',
    dedupe_key: lockKey, received_at: nowIso,
    ignored_reason: 'lock', // jamás participa de ningún cruce
  })
  if (lockErr) {
    if (lockErr.code !== '23505') return json({ ok: false, stage: 'network_before' }, 500)
    const staleCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString()
    const { data: takeover } = await supabase.from('payment_events')
      .update({ received_at: nowIso })
      .eq('store_id', originStoreId).eq('dedupe_key', lockKey)
      .lt('received_at', staleCutoff)
      .select('id')
    if (!takeover?.length) {
      return json({ ok: false, stage: 'validation', code: 'already_charging', user_message: 'Tu pago anterior aún se está procesando. Espera unos segundos.' }, 409)
    }
    // Lock huérfano tomado. El pago anterior PUDO haber entrado: si el webhook
    // ya cuadró el pedido, la relectura de abajo lo detiene antes de cobrar.
    const { data: fresh } = await supabase.from('order_sessions')
      .select('payment_verification').eq('id', session.id).maybeSingle()
    if (fresh?.payment_verification === 'MATCHED') {
      await releaseLock(originStoreId, lockKey)
      const { data: ev } = await supabase.from('payment_events')
        .select('provider_charge_id, amount_pen').eq('matched_order_id', session.id)
        .eq('provider', 'CULQI').limit(1).maybeSingle()
      return json({ ok: true, already_paid: true, charge_id: ev?.provider_charge_id ?? null, amount_pen: Number(ev?.amount_pen ?? rowAmount) })
    }
  }

  await supabase.from('order_sessions')
    .update({ advance_charge_attempts: (session.advance_charge_attempts ?? 0) + 1 })
    .eq('id', session.id)

  const meta = {
    kross_order_session_id: String(session.id),
    kross_order_id: String(session.order_id ?? ''),
    kross_store_id: originStoreId,
  }

  // ─── 1. Token Yape (llave pública, server-to-server) ───────────────────────
  const token = await createYapeToken(pk, { amount: amountCents, number_phone: phone, otp, metadata: meta })
  if (!token.ok) {
    await releaseLock(originStoreId, lockKey)
    if ('network' in token && token.network) {
      // Aún no hay cargo: reintentar es gratis.
      return json({ ok: false, stage: 'network_before' }, 502)
    }
    // OTP mal tecleado, vencido (>2 min), ya usado, o número sin Yape.
    await notePaymentFailure(session, 'Pago en línea falló: código de aprobación inválido o vencido')
    console.error('[culqi-charge] token_failed', JSON.stringify(errorForLog(token.status, token.error)))
    return json({
      ok: false, stage: 'token', code: token.error?.code,
      user_message: token.error?.user_message ?? 'Tu código no fue aceptado. Genera uno nuevo en Yape e inténtalo de nuevo.',
    }, 402)
  }

  // ─── 2. Cargo (llave secreta) ──────────────────────────────────────────────
  const charge = await createCharge(sk, {
    amount: amountCents,
    currency_code: 'PEN',
    // El checkout no pide email y meter un campo más en el paso del cobro
    // cuesta conversión: se sintetiza del celular, práctica normal en COD.
    email: `${phone}@buyers.krossclub.app`,
    source_id: token.data.id,
    description: `Adelanto ${session.order_id ?? session.id}`.slice(0, 80),
    metadata: meta,
  })

  if (!charge.ok) {
    if ('network' in charge && charge.network) {
      // El POST salió y la respuesta se perdió: el dinero PUDO salir. El lock
      // se QUEDA (enfría reintentos 90 s), el front no reintenta y el webhook
      // repara si el cargo entró.
      return json({ ok: false, stage: 'network_after' }, 502)
    }
    await releaseLock(originStoreId, lockKey)
    const decline = declineCodeOf(charge.error)
    await notePaymentFailure(session, `Pago en línea falló: cargo rechazado${decline ? ` (${decline})` : ''}`)
    console.error('[culqi-charge] charge_failed', JSON.stringify(errorForLog(charge.status, charge.error)))
    return json({
      ok: false, stage: 'charge', code: charge.error?.code, decline_code: decline,
      user_message: charge.error?.user_message ?? 'El cargo no pasó. Revisa tu saldo de Yape e inténtalo de nuevo.',
    }, 402)
  }

  // ─── 3. Persistir — a partir de aquí el dinero YA salió ────────────────────
  const chr = charge.data
  try {
    const matchedAt = new Date().toISOString()

    // ¿Hubo ANTES otro cargo Culqi real para este pedido? (p. ej. un
    // network_after que sí entró y el webhook ya grabó). No se re-marca en
    // silencio: Ventas tiene que devolver uno.
    const { data: prior } = await supabase.from('payment_events')
      .select('provider_charge_id').eq('matched_order_id', session.id)
      .eq('provider', 'CULQI').not('provider_charge_id', 'is', null)
      .neq('provider_charge_id', chr.id).limit(1)

    const { data: inserted, error: insertErr } = await supabase.from('payment_events').insert({
      store_id: originStoreId, source: 'CULQI', provider: 'CULQI',
      provider_charge_id: chr.id,
      provider_fee_pen: typeof chr.total_fee === 'number' ? chr.total_fee / 100 : null,
      raw: JSON.stringify(chargeForStorage(chr)),
      amount_pen: rowAmount, sender_name: session.buyer_name ?? null,
      dedupe_key: `culqi:${chr.id}`,
      matched_order_id: session.id, matched_at: matchedAt, received_at: matchedAt,
    }).select('id').single()

    let eventId = inserted?.id ?? null
    if (insertErr) {
      // 23505 = el webhook grabó este MISMO cargo un instante antes. No es un
      // error: se reutiliza su fila.
      if (insertErr.code !== '23505') throw insertErr
      const { data: existing } = await supabase.from('payment_events')
        .select('id').eq('store_id', originStoreId).eq('dedupe_key', `culqi:${chr.id}`).maybeSingle()
      eventId = existing?.id ?? null
    }

    await supabase.from('order_sessions').update({
      payment_verification: 'MATCHED', payment_matched_at: matchedAt,
      payment_reason: null, payment_event_id: eventId, stage: 'confirmado',
    }).eq('id', session.id)

    // Los DOS mensajes del cruce manual, con la misma copy — esa redacción ya
    // está calibrada y el comprador no tiene por qué notar QUÉ motor cobró.
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'text', visibility: 'sellers',
      body: `✅ Adelanto de S/${rowAmount} verificado automáticamente`
        + (session.buyer_name ? ` · pagó ${session.buyer_name}` : '')
        + ` · Culqi ${chr.id}`
        + (prior?.length ? `\n⚠️ Ya existía otro cargo Culqi (${prior[0].provider_charge_id}) para este pedido — revisar y devolver uno.` : ''),
    })
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'status_update', visibility: 'all',
      body: `✅ ¡Recibimos tu adelanto de S/${rowAmount}! Ya estamos preparando tu pedido.`
        + ' Por aquí te avisamos cuando salga.',
    })

    await releaseLock(originStoreId, lockKey)
    return json({ ok: true, charge_id: chr.id, amount_pen: rowAmount })
  } catch (err) {
    // El cargo ENTRÓ pero la base no lo pudo escribir. Decirle "falló" al
    // comprador lo empuja a pagar de nuevo: se responde ok y el webhook (o una
    // persona, vía la nota) termina de cuadrar los registros.
    console.error('[culqi-charge] CARGO COBRADO SIN REGISTRAR', JSON.stringify({
      charge_id: chr.id, session_id: session.id, error: err instanceof Error ? err.message : String(err),
    }))
    await supabase.from('order_sessions')
      .update({ payment_reason: `Cargo Culqi ${chr.id} cobrado pero NO registrado — conciliar a mano` })
      .eq('id', session.id)
      .then(() => {}, () => {})
    return json({ ok: true, charge_id: chr.id, amount_pen: rowAmount, unrecorded: true })
  }
})

async function releaseLock(storeId: string, lockKey: string) {
  await supabase.from('payment_events').delete()
    .eq('store_id', storeId).eq('dedupe_key', lockKey)
    .then(() => {}, () => {})
}

/** Deja el motivo en la fila y, la PRIMERA vez, avisa a Ventas por el chat.
 *  Frases cortas y propias — jamás el merchant_message de Culqi: todo lo que
 *  entra a `payment_reason` o a un mensaje `sellers` puede terminar frente al
 *  comprador por la puerta de `get-session?viewer=seller` (deuda conocida). */
async function notePaymentFailure(
  session: { id: string; payment_reason: string | null; advance_amount: unknown },
  reason: string,
) {
  const firstFailure = !session.payment_reason
  await supabase.from('order_sessions').update({ payment_reason: reason }).eq('id', session.id)
  if (firstFailure) {
    await supabase.from('chat_messages').insert({
      session_id: session.id, sender_role: 'system', sender_name: 'Kross',
      type: 'text', visibility: 'sellers',
      body: `⚠️ El comprador intentó pagar el adelanto de S/${Number(session.advance_amount ?? 0)} en línea y no se pudo (${reason.replace('Pago en línea falló: ', '').replace('Pago en línea no disponible: ', '')}). Si no reintenta, coordina el cobro por el chat.`,
    })
  }
}
