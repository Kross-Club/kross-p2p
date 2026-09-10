// ─── AFILIADOS · Webhook de Stripe (la suscripción del comercio) ─────────────
//
// Stripe cobra el plan mensual del comercio ($67/mes) y **nada más**: no paga
// comisiones, no mueve soles y no sabe qué es un afiliado. Lo único que hace
// esta función es guardar dos cosas:
//
//   · `store_subscriptions` — el estado de HOY. Es el semáforo del panel y la
//     lista de a quién hay que llamar. **No decide comisiones.**
//   · `subscription_periods` — los TRAMOS PAGADOS. Eso sí decide: una venta del
//     comercio comisiona si su fecha cae dentro de alguno (`cubierta()` en
//     `_shared/afiliados.ts`). Ver §51.d del esquema.
//
// Se despliega con --no-verify-jwt: lo llama Stripe, no un usuario. La
// autenticidad la da la FIRMA. Igual que `pay360-webhook` y por el mismo orden
// de defensas — cuerpo crudo primero, firma después, y recién ahí se parsea.
//
//   supabase functions deploy stripe-webhook --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
//
// Secreto: `STRIPE_WEBHOOK_SECRET` (el `whsec_…` del endpoint, NO la API key —
// esta función nunca llama a Stripe, así que no necesita ninguna llave de API).
//
// **Qué código devuelve, y por qué importa.** Stripe reintenta lo que no sea
// 2xx durante tres días:
//   · firma inválida o cuerpo ilegible → **400**. Nunca va a mejorar;
//     reintentarlo es ruido.
//   · evento que no nos toca → **200**. Recibido y descartado.
//   · falló la escritura → **500**. ESTO sí queremos que se reintente: es la
//     diferencia entre un mes que se pagó y no quedó registrado —y por lo tanto
//     un afiliado al que no se le paga— y uno que entra en el segundo intento.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { anotar } from '../_shared/api-eventos.ts'
import {
  firmaValida, storeIdDe, suscripcionDelEvento, tramoDeFactura, idDe, fechaDeStripe,
} from '../_shared/stripe.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const responder = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * De qué tienda es este evento.
 *
 * Primero por lo que el objeto trae escrito (`storeIdDe`: metadata,
 * `client_reference_id`, o el metadata que Stripe copia en las facturas). Si no
 * trae nada, por el customer: la tienda ya quedó enlazada cuando se dio de alta,
 * así que `store_subscriptions` sabe de quién es ese `cus_…`.
 *
 * `null` significa que el evento es de una suscripción que no conocemos —una
 * cuenta de Stripe compartida con otro producto, una prueba manual— y eso no es
 * un error: se contesta 200 y se ignora.
 */
async function tiendaDelEvento(objeto: unknown, customerId: string | null): Promise<string | null> {
  const escrito = storeIdDe(objeto)
  if (escrito) return escrito
  if (!customerId) return null
  const { data } = await supabase
    .from('store_subscriptions').select('store_id')
    .eq('stripe_customer_id', customerId).maybeSingle()
  return data?.store_id ?? null
}

/**
 * Guarda el estado de hoy.
 *
 * ⚠️ **Los webhooks llegan desordenados.** Stripe no garantiza el orden, y un
 * `subscription.updated` viejo que llega después de uno nuevo haría retroceder
 * el estado —una suscripción cancelada volvería a figurar activa sola—. Por eso
 * se compara `stripe_event_at` contra lo guardado y se descarta lo viejo. Es la
 * misma clase de defensa que el dedupe por evento del webhook de 360pay, pero
 * contra otro problema: aquel evita contar dos veces, este evita retroceder.
 */
async function guardarEstado(
  storeId: string, campos: Record<string, unknown>, eventoAt: string,
): Promise<{ ok: boolean; error?: string; ignorado?: boolean }> {
  const { data: previo, error: eLectura } = await supabase
    .from('store_subscriptions').select('stripe_event_at')
    .eq('store_id', storeId).maybeSingle()
  if (eLectura) return { ok: false, error: eLectura.message }

  if (previo?.stripe_event_at && Date.parse(previo.stripe_event_at) > Date.parse(eventoAt)) {
    return { ok: true, ignorado: true }
  }

  const { error } = await supabase.from('store_subscriptions').upsert({
    store_id: storeId, ...campos,
    stripe_event_at: eventoAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id' })
  return error ? { ok: false, error: error.message } : { ok: true }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder({ error: 'method not allowed' }, 405)

  // 1. El cuerpo CRUDO, antes de parsear. Re-serializar el JSON cambia orden y
  //    espacios y rompe la firma de un evento legítimo.
  const crudo = await req.text()
  const secreto = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  // 2. La firma. Sin secreto configurado NO se deja pasar: un webhook abierto
  //    es un endpoint donde cualquiera declara meses pagados que nadie pagó.
  if (!await firmaValida(crudo, req.headers.get('Stripe-Signature'), secreto)) {
    await anotar({
      proveedor: 'STRIPE', op: 'webhook.firma', outcome: 'RECHAZO', httpStatus: 400,
      detail: secreto ? 'firma inválida o vencida' : 'STRIPE_WEBHOOK_SECRET sin configurar',
    })
    return responder({ error: 'firma inválida' }, 400)
  }

  // 3. Recién ahora se parsea.
  let evento: Record<string, unknown>
  try {
    evento = JSON.parse(crudo)
  } catch {
    return responder({ error: 'cuerpo ilegible' }, 400)
  }

  const tipo = String(evento.type ?? '')
  const eventoId = String(evento.id ?? '')
  const objeto = (evento.data as Record<string, unknown> | undefined)?.object
  const eventoAt = fechaDeStripe(evento.created) ?? new Date().toISOString()

  try {
    switch (tipo) {
      // ── El alta. Un Checkout Link con `client_reference_id = store_id` es la
      //    forma de dar de alta a un comercio sin tocar la API: acá se guarda
      //    el enlace tienda↔customer, que es lo que hace que las facturas
      //    siguientes se sepan de quién son.
      case 'checkout.session.completed': {
        const s = objeto as Record<string, unknown>
        const storeId = await tiendaDelEvento(s, idDe(s?.customer))
        if (!storeId) return responder({ received: true, ignorado: 'sin tienda' })
        const r = await guardarEstado(storeId, {
          stripe_customer_id: idDe(s?.customer),
          stripe_subscription_id: idDe(s?.subscription),
        }, eventoAt)
        if (!r.ok) throw new Error(r.error)
        return responder({ received: true, store_id: storeId })
      }

      // ── El estado de la suscripción cambió.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const sub = suscripcionDelEvento(objeto)
        const storeId = await tiendaDelEvento(objeto, sub.stripe_customer_id)
        if (!storeId) return responder({ received: true, ignorado: 'sin tienda' })
        // `deleted` no siempre trae `status: 'canceled'` en el objeto: el
        // estado real es el nombre del evento. Sin esto, una cancelación queda
        // guardada como "active" y el panel enseña al día a quien se fue.
        const status = tipo === 'customer.subscription.deleted' ? 'canceled' : sub.status
        const r = await guardarEstado(storeId, { ...sub, status }, eventoAt)
        if (!r.ok) throw new Error(r.error)
        return responder({ received: true, store_id: storeId, status })
      }

      // ── **La que decide la comisión.** Una factura pagada es un mes que el
      //    comercio pagó de verdad, con el rango que cubre.
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const tramo = tramoDeFactura(objeto)
        if (!tramo) return responder({ received: true, ignorado: 'sin tramo cobrado' })
        const storeId = await tiendaDelEvento(objeto, tramo.stripe_customer_id)
        if (!storeId) return responder({ received: true, ignorado: 'sin tienda' })

        // `upsert` sobre `stripe_invoice_id`, que es único (§51.d): Stripe
        // reintenta hasta ver un 200, así que la MISMA factura llega dos y tres
        // veces. Sin esto, el mismo mes entraría repetido.
        //
        // ⚠️ `invoice.paid` e `invoice.payment_succeeded` se disparan LOS DOS
        // por el mismo cobro. No son un duplicado accidental: son dos eventos
        // distintos de Stripe sobre el mismo hecho, y se atienden los dos a
        // propósito —basta con que llegue uno para que el mes quede registrado—
        // porque el índice único hace que el segundo no agregue nada.
        const { error } = await supabase.from('subscription_periods').upsert({
          store_id: storeId,
          stripe_invoice_id: tramo.stripe_invoice_id,
          inicio: tramo.inicio,
          fin: tramo.fin,
          monto_usd: tramo.monto_usd,
          paid_at: tramo.paid_at,
        }, { onConflict: 'stripe_invoice_id' })
        if (error) throw new Error(error.message)

        return responder({
          received: true, store_id: storeId,
          periodo: { inicio: tramo.inicio, fin: tramo.fin },
        })
      }

      // ── La tarjeta rebotó. No borra ningún tramo ya pagado —lo que se pagó,
      //    pagado está— pero deja el estado en `past_due` para que el panel
      //    sepa a quién llamar. Se anota como RECHAZO porque es exactamente lo
      //    que hay que poder mirar después: qué comercios están rebotando.
      case 'invoice.payment_failed': {
        const customerId = idDe((objeto as Record<string, unknown>)?.customer)
        const storeId = await tiendaDelEvento(objeto, customerId)
        if (storeId) await guardarEstado(storeId, { status: 'past_due' }, eventoAt)
        await anotar({
          proveedor: 'STRIPE', op: 'suscripcion.pago_fallido', outcome: 'RECHAZO',
          storeId, detail: `factura ${idDe((objeto as Record<string, unknown>)?.id) ?? '?'}`,
        })
        return responder({ received: true, store_id: storeId })
      }

      default:
        // Recibido y descartado. 200 para que Stripe no reintente algo que no
        // nos toca.
        return responder({ received: true, ignorado: tipo })
    }
  } catch (e) {
    // 500 A PROPÓSITO: que Stripe lo reintente. Un `invoice.paid` que se pierde
    // por un error transitorio de la base es un mes pagado que no queda
    // registrado, y eso es un afiliado al que no se le paga lo que ganó.
    const detalle = e instanceof Error ? e.message : String(e)
    await anotar({
      proveedor: 'STRIPE', op: `webhook.${tipo || 'desconocido'}`, outcome: 'FALLO',
      httpStatus: 500, detail: detalle, providerRef: eventoId || null,
    })
    return responder({ error: 'no se pudo guardar' }, 500)
  }
})
