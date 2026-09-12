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
  firmaValidaConAlguno, esProduccion, storeIdDe, suscripcionDelEvento, tramoDeFactura,
  idDe, fechaDeStripe, valeReintentar,
} from '../_shared/stripe.ts'
import { esTokenDeAlta } from '../_shared/alta-de-tienda.ts'
import { crearTienda } from '../_shared/crear-tienda.ts'

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

/** El correo que el comerciante tecleó en el checkout. Es con el que va a poder
 *  recuperar su contraseña, así que es el dato que no puede faltar. */
function correoDeLaSesion(s: Record<string, unknown>): string | null {
  const directo = typeof s.customer_email === 'string' ? s.customer_email : null
  const detalles = s.customer_details as Record<string, unknown> | undefined
  const enDetalles = typeof detalles?.email === 'string' ? detalles.email : null
  const v = (directo ?? enDetalles ?? '').trim().toLowerCase()
  return v || null
}

/**
 * Crea la tienda de un alta pagada (§54).
 *
 * **Idempotente**, y no es opcional: Stripe reintenta hasta ver un 200, así que
 * este evento llega dos y tres veces. Sin el corte de abajo, el segundo intento
 * crearía una SEGUNDA tienda para el mismo pago —con otro subdominio, porque el
 * primero ya estaría tomado— y el comerciante acabaría con dos.
 *
 * La contraseña que se pone acá es **aleatoria y se tira**: nadie la conoce, ni
 * siquiera nosotros. La de verdad la elige él en `/bienvenido`, y si pierde esa
 * pestaña entra por «recuperar contraseña» con su correo. Crear la cuenta sin
 * contraseña no es una opción —Auth la pide— y ponerle una previsible sería
 * dejar la tienda abierta hasta que la cambie.
 */
async function altaDeTienda(token: string, ctx: {
  email: string | null
  customerId: string | null
  subId: string | null
  checkoutSessionId: string | null
  live: boolean
  eventoAt: string
}): Promise<{ cuerpo: Record<string, unknown>; status: number }> {
  const { data: alta } = await supabase.from('signups')
    .select('token, marca, nombre_admin, slug, affiliate_ref, estado, store_id')
    .eq('token', token).maybeSingle()

  // El token no existe: puede ser una purga (§54.a) o un evento de otra cuenta.
  // 200 y a otra cosa — reintentarlo no lo va a hacer aparecer.
  if (!alta) return { cuerpo: { received: true, ignorado: 'alta desconocida' }, status: 200 }

  // Ya se creó. Este es un reintento de Stripe: se reconfirma el estado de la
  // suscripción —que puede haber llegado desordenado— y se contesta 200.
  if (alta.estado === 'CREADA' && alta.store_id) {
    await guardarEstado(alta.store_id, {
      stripe_customer_id: ctx.customerId,
      stripe_subscription_id: ctx.subId,
      livemode: ctx.live,
    }, ctx.eventoAt)
    return { cuerpo: { received: true, store_id: alta.store_id, ya: true }, status: 200 }
  }

  // Sin correo no se puede crear la cuenta, y sin cuenta no hay a quién
  // entregarle la tienda. 500 para que Stripe reintente: es más probable que el
  // campo llegue en el siguiente intento a que este evento no sirva nunca.
  if (!ctx.email) {
    await anotar({
      proveedor: 'STRIPE', op: 'alta.sin_correo', outcome: 'RECHAZO', httpStatus: 500,
      detail: `el checkout de ${token} no trajo correo`,
    })
    return { cuerpo: { error: 'sin correo en el checkout' }, status: 500 }
  }

  const r = await crearTienda(supabase, {
    nombre: alta.marca,
    slug: alta.slug,
    adminNombre: alta.nombre_admin,
    adminEmail: ctx.email,
    // Aleatoria y desechable: la de verdad la elige él en `/bienvenido`.
    adminPassword: crypto.randomUUID() + crypto.randomUUID(),
    affiliateRef: alta.affiliate_ref,
  })

  if (!r.ok) {
    await anotar({
      proveedor: 'STRIPE', op: 'alta.fallida', outcome: 'FALLO', httpStatus: 500,
      detail: `${token}: ${r.motivo}${'detalle' in r ? ` — ${r.detalle}` : ''}`,
    })
    // 500 para que Stripe reintente. El comerciante ya pagó: quedarse sin
    // tienda por un fallo transitorio de la base es lo peor que puede pasar
    // acá, y el reintento es gratis.
    return { cuerpo: { error: 'no se pudo crear la tienda' }, status: 500 }
  }

  await supabase.from('signups').update({
    estado: 'CREADA',
    store_id: r.tienda.storeId,
    email: ctx.email,
    stripe_customer_id: ctx.customerId,
    stripe_subscription_id: ctx.subId,
    checkout_session_id: ctx.checkoutSessionId,
  }).eq('token', token)

  await guardarEstado(r.tienda.storeId, {
    stripe_customer_id: ctx.customerId,
    stripe_subscription_id: ctx.subId,
    livemode: ctx.live,
  }, ctx.eventoAt)

  return {
    cuerpo: { received: true, store_id: r.tienda.storeId, slug: r.tienda.slug, creada: true },
    status: 200,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder({ error: 'method not allowed' }, 405)

  // 1. El cuerpo CRUDO, antes de parsear. Re-serializar el JSON cambia orden y
  //    espacios y rompe la firma de un evento legítimo.
  const crudo = await req.text()

  // Los DOS secretos: producción y prueba. Son dos destinos distintos en Stripe
  // y hacen falta a la vez — con el cobro real encendido uno sigue necesitando
  // probar un alta completa sin mover plata (§53.b). Tener solo el de
  // producción es el caso normal, no un error.
  const secretos = [
    Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    Deno.env.get('STRIPE_WEBHOOK_SECRET_TEST'),
  ]

  // 2. La firma. Sin ningún secreto configurado NO se deja pasar: un webhook
  //    abierto es un endpoint donde cualquiera declara meses pagados que nadie
  //    pagó.
  if (!await firmaValidaConAlguno(crudo, req.headers.get('Stripe-Signature'), secretos)) {
    await anotar({
      proveedor: 'STRIPE', op: 'webhook.firma', outcome: 'RECHAZO', httpStatus: 400,
      detail: secretos.some(Boolean)
        ? 'firma inválida o vencida'
        : 'ni STRIPE_WEBHOOK_SECRET ni STRIPE_WEBHOOK_SECRET_TEST están configurados',
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
  // ⚠️ Una firma válida NO dice que el pago sea real: un evento de prueba está
  // tan bien firmado como uno de verdad. Lo que lo dice es esto, y es lo que
  // impide que una tarjeta 4242 se convierta en soles transferidos a una
  // persona (§53.b).
  const live = esProduccion(evento)

  try {
    switch (tipo) {
      // ── El alta. Un Checkout Link con `client_reference_id = store_id` es la
      //    forma de dar de alta a un comercio sin tocar la API: acá se guarda
      //    el enlace tienda↔customer, que es lo que hace que las facturas
      //    siguientes se sepan de quién son.
      case 'checkout.session.completed': {
        const s = objeto as Record<string, unknown>
        const customerId = idDe(s?.customer)
        const subId = idDe(s?.subscription)
        const ref = String(s?.client_reference_id ?? '')

        // ── EL ALTA AUTOMÁTICA (§54) ────────────────────────────────────
        // Un `client_reference_id` con prefijo `sg_` no es una tienda: es una
        // INTENCIÓN reservada en la landing, y este evento es la única prueba
        // de que esa intención se pagó. **Acá es donde nace la tienda**, y en
        // ningún otro sitio: crearla al reservar la regalaría, y crearla en la
        // pantalla de bienvenida bastaría con navegar a esa URL a mano.
        if (esTokenDeAlta(ref)) {
          const nueva = await altaDeTienda(ref, {
            email: correoDeLaSesion(s),
            customerId,
            subId,
            checkoutSessionId: idDe(s?.id),
            live,
            eventoAt,
          })
          return responder(nueva.cuerpo, nueva.status)
        }

        // El camino de siempre: una marca que YA existe y recién se suscribe.
        const storeId = await tiendaDelEvento(s, customerId)
        if (!storeId) return responder({ received: true, ignorado: 'sin tienda' })
        const r = await guardarEstado(storeId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
          livemode: live,
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
        const r = await guardarEstado(storeId, { ...sub, status, livemode: live }, eventoAt)
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
        if (!storeId) {
          // ⚠️ **Acá NO se descarta.** Stripe no garantiza el orden, y en el
          // alta esta factura suele llegar ANTES que
          // `checkout.session.completed` —el evento que enlaza la tienda con su
          // cliente—. Contestar 200 sería perder el PRIMER MES de todas las
          // tiendas, en silencio.
          //
          // Así que mientras el evento sea reciente se pide el reintento (500)
          // y se resuelve solo en el siguiente intento, cuando el enlace ya
          // existe. Pasada la ventana se deja ir: lo que no se pudo atribuir en
          // una hora no es una carrera de entrega, es una suscripción que no es
          // de Kross — y reintentarla tres días llena el registro de fallos que
          // no son fallos.
          if (valeReintentar(eventoAt)) {
            await anotar({
              proveedor: 'STRIPE', op: 'suscripcion.sin_tienda', outcome: 'RECHAZO',
              httpStatus: 409, providerRef: eventoId || null,
              detail: `factura ${tramo.stripe_invoice_id} del cliente ${tramo.stripe_customer_id ?? '?'}`
                + ' todavía sin tienda enlazada; se reintenta',
            })
            return responder({ error: 'tienda todavía sin enlazar', reintentar: true }, 500)
          }
          await anotar({
            proveedor: 'STRIPE', op: 'suscripcion.sin_tienda', outcome: 'RECHAZO',
            providerRef: eventoId || null,
            detail: `factura ${tramo.stripe_invoice_id} del cliente ${tramo.stripe_customer_id ?? '?'}`
              + ' sin tienda tras la ventana de reintento; se descarta',
          })
          return responder({ received: true, ignorado: 'sin tienda' })
        }

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
          // La marca que decide si este mes puede comisionar (§53.b). Se guarda
          // igual en los dos casos: ver entrar un pago de prueba es lo que
          // confirma que el webhook funciona.
          livemode: live,
        }, { onConflict: 'stripe_invoice_id' })
        if (error) throw new Error(error.message)

        return responder({
          received: true, store_id: storeId, livemode: live,
          periodo: { inicio: tramo.inicio, fin: tramo.fin },
          // Dicho con todas sus letras: en prueba el tramo queda registrado
          // pero NO comisiona. Es lo primero que uno necesita saber mirando la
          // respuesta en el panel de Stripe.
          ...(live ? {} : { aviso: 'modo prueba: se registra pero no comisiona' }),
        })
      }

      // ── La tarjeta rebotó. No borra ningún tramo ya pagado —lo que se pagó,
      //    pagado está— pero deja el estado en `past_due` para que el panel
      //    sepa a quién llamar. Se anota como RECHAZO porque es exactamente lo
      //    que hay que poder mirar después: qué comercios están rebotando.
      case 'invoice.payment_failed': {
        const customerId = idDe((objeto as Record<string, unknown>)?.customer)
        const storeId = await tiendaDelEvento(objeto, customerId)
        if (storeId) await guardarEstado(storeId, { status: 'past_due', livemode: live }, eventoAt)
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
