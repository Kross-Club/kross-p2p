// ─── SMART LOGISTICS · Generador de guías OLVA (por Olva LAT) ────────────────
// El gemelo de `shalom-order` para el otro courier: un pedido de recojo en
// agencia OLVA con el pago verificado registra su envío contra
// `POST /shipments` de Olva LAT, y desde ahí sigue el ciclo de siempre —
// rótulo, aviso, guía, fases y cobranza (`_shared/guia.ts`).
//
// Lo llama `flow-confirm` apenas el pago cuadra (fire-and-forget: cobrar nunca
// se cuelga de despachar). Es interna — la invoca otra función con la service
// role key, no el navegador: emitir guías CUESTA PLATA y la anon key vive en
// el bundle de la PWA.
//
// ⚠️ LO QUE CAMBIA RESPECTO A SHALOM, con la doc de set-2026 (`POST /shipments`):
//
//   1. **La guía NO nace con el registro.** Olva devuelve un
//      `registrationNumber` (para reclamar y para el rótulo) y el rótulo en
//      PDF; el número de GUÍA lo asigna cuando ADMITE el paquete en la sede.
//      Así que esta función cierra en CREATED **sin `tracking_numero`**, sube
//      el rótulo al bucket para que la marca lo pegue al paquete, y el barrido
//      (`olva-tracking-sync`) pregunta por `GET /shipments/:id` hasta que la
//      guía exista — ahí recién corre `registrarGuia`, el mismo camino que la
//      guía escrita a mano.
//   2. **Sí se reintenta, gracias a `Idempotency-Key`.** Un timeout o un 5xx se
//      repite con la MISMA clave (pedido + huella del payload): si el primero
//      llegó a registrar, Olva devuelve ese envío en vez de crear otro. Un 4xx
//      no se reintenta: es un dato nuestro que hay que corregir.
//   3. **La clave de recojo la elegimos nosotros** (`pin`, como el `pickup_code`
//      de Shalom) y Olva la confirma en `securityPin`. Se guarda en
//      `shalom_pickup_code` —el nombre es histórico; es LA clave de recojo del
//      pedido— y el chat la suelta cuando el saldo se paga, igual que siempre.
//   4. **La guía nace en la cuenta Olva del PROVEEDOR**, no en una de la marca:
//      el remitente es un documento que Olva valida con su lookup. Quién factura
//      el flete lo decide `stores.olva_who_pays` (STORE: la marca en la sede de
//      origen; DESTINATION: el comprador al recoger).
//
// El candado (defensa #1) es idéntico al de Shalom: se reclama el pedido con un
// UPDATE condicional ANTES de llamar a nadie, así que dos webhooks del mismo
// pago no registran dos envíos para un paquete.
//
// Deploy: supabase functions deploy olva-order --project-ref ofdjghntvmrdfjhazfvz

import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'
import { broadcast, chatMessage, supabase } from '../_shared/tracking.ts'
import { latAgencies, latFetch, olvaLatApiKey } from '../_shared/olva-lat-api.ts'
import { anotar } from '../_shared/api-eventos.ts'
import {
  buildLatShipment, claveDeIdempotencia, esRastreable, esRegistrado, parseLatShipment, resolveAgencyCode,
} from '../_shared/olva-lat-orders.ts'
import { CONTENT_LABELS, isDeclaredContent, nuevoPickupCode } from '../_shared/shalom-orders.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SESSION_COLUMNS =
  'id, order_id, store_id, origin_store_id, buyer_id, buyer_name, buyer_phone, product_id, product_name, ' +
  'product_price, advance_amount, payment_verification, saldo_verification, dispatch_type, agency_name, ' +
  'agency_branch_id, agency_branch_label, delivery_reference, tracking_numero, olva_order_status, ' +
  'shalom_pickup_code, token, buyer_phone, saldo_amount'

/** Cierra el expediente. `status` es también el candado: una vez escrito,
 *  ninguna corrida futura vuelve a tomar este pedido sola. */
async function cerrar(sessionId: string, status: string, reason: string | null, extra: Record<string, unknown> = {}) {
  await supabase.from('order_sessions').update({
    olva_order_status: status,
    olva_order_reason: reason,
    olva_order_at: new Date().toISOString(),
    ...extra,
  }).eq('id', sessionId)
}

/** Aviso a Logística. Nunca al comprador: para él la guía aparece igual que
 *  siempre (el mensaje de `registrarGuia`), venga de una persona o de la API.
 *  Y nunca con el texto crudo del proveedor — ese va solo a los logs. */
const aLogistica = (sessionId: string, body: string) => chatMessage(sessionId, body, 'sellers')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ─── Solo desde adentro ────────────────────────────────────────────────────
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer || bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return json({ error: 'no autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { session_id?: string; retry?: boolean }
  const sessionId = String(body.session_id ?? '')
  if (!sessionId) return json({ error: 'session_id requerido' }, 400)
  // Reintento a mano (vía `order-manage` · retry_olva): SOLO reabre un
  // expediente FAILED. `CREATED`/`SIMULADO`/`SKIPPED` siguen cerrados.
  const reintento = body.retry === true

  const { data: session } = await supabase.from('order_sessions')
    .select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle()
  if (!session) return json({ error: 'pedido no encontrado' }, 404)

  // ─── ¿Este pedido va a Olva? ───────────────────────────────────────────────
  // Se descarta ANTES de reclamar nada: la mayoría de pedidos no son de Olva y
  // marcarlos a todos ensuciaría la columna que sirve de candado.
  if (session.agency_name !== 'OLVA') return json({ skipped: 'no es un pedido Olva' })
  if (!String(session.dispatch_type ?? '').startsWith('AGENCIA')) {
    return json({ skipped: 'no es recojo en agencia' })
  }
  // El adelanto es lo que autoriza a despachar (02 §Antes de despachar).
  if (session.payment_verification !== 'MATCHED') return json({ skipped: 'adelanto sin verificar' })
  if (session.tracking_numero) return json({ skipped: 'el pedido ya tiene guía' })
  const expediente = String(session.olva_order_status ?? '')
  if (expediente && !(reintento && expediente === 'FAILED')) {
    return json({ skipped: `ya procesado (${expediente})` })
  }

  // ─── El candado ────────────────────────────────────────────────────────────
  // Gana una sola llamada. La condición se hace en la base, no acá.
  const claim = supabase.from('order_sessions')
    .update({ olva_order_status: 'PENDING', olva_order_at: new Date().toISOString() })
    .eq('id', sessionId)
  const { data: claimed } = await (reintento
    ? claim.eq('olva_order_status', 'FAILED')
    : claim.is('olva_order_status', null))
    .select('id')
  if (!claimed?.length) return json({ skipped: 'otra corrida ya lo tomó' })

  // A partir de acá el pedido YA está reclamado: pase lo que pase, tiene que
  // quedar cerrado. Un throw suelto lo dejaría en PENDING para siempre.
  try {
    return await generar()
  } catch (e) {
    console.error('[olva-order] error inesperado', sessionId, e)
    await cerrar(sessionId, 'FAILED', 'error inesperado al registrar el envío')
    await aLogistica(sessionId,
      '⚠️ El registro automático del envío Olva falló por un error de Kross. Antes de registrar '
      + 'otro, verifica en Olva si el envío llegó a crearse; si no está, regístralo a mano al despachar.')
    return json({ error: 'inesperado' }, 500)
  }

  async function generar(): Promise<Response> {
    // ─── La config: marca, producto, comprador ───────────────────────────────
    const storeId = String(session.origin_store_id ?? session.store_id ?? '')
    const [{ data: store }, { data: product }, { data: buyer }] = await Promise.all([
      supabase.from('stores')
        .select('nombre, olva_auto_guide_enabled, olva_sender_document, olva_sender_phone, olva_sender_email, olva_who_pays')
        .eq('id', storeId).maybeSingle(),
      session.product_id
        ? supabase.from('products')
            .select('olva_origin_agency_code, package_weight_kg, package_dims_cm, declared_content').eq('id', session.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      session.buyer_id
        ? supabase.from('buyers').select('document_number, phone').eq('id', session.buyer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const key = await olvaLatApiKey()
    if (!key) {
      await cerrar(sessionId, 'FAILED', 'sin llave de la API de envíos de Olva')
      await aLogistica(sessionId, '📦 Envío Olva no registrado — problema de configuración de Kross. Regístralo a mano y avisa al equipo.')
      return json({ error: 'sin api key' }, 500)
    }

    // ─── El destino: del rótulo de la sede al código del proveedor ───────────
    // `agency_branch_label` es la foto en palabras de la sede que eligió el
    // comprador. Hace falta porque las dos listas de agencias no comparten
    // llave: nuestro catálogo guarda el id del buscador de Olva ("579") y Olva
    // LAT usa un código propio ("LIM-MIR-01"). Los pedidos anteriores a esta
    // columna no lo tienen: esos se despachan a mano, y el aviso lo dice.
    const rotulo = String(session.agency_branch_label ?? '').trim()
    const sede = parseRotulo(rotulo)
    const agencias = sede.district ? await latAgencies(key, sede.department) : []
    const destino = sede.district ? resolveAgencyCode(agencias, sede) : null

    const dni = String(buyer?.document_number ?? '').replace(/\D/g, '')
    const contenido = isDeclaredContent(product?.declared_content)
      ? CONTENT_LABELS[product.declared_content]
      : null

    // La clave de recojo: la del pedido si ya tenía (un reintento no cambia la
    // clave que quizá ya se le dijo a alguien), o una nueva.
    const pin = /^\d{4}$/.test(String(session.shalom_pickup_code ?? '')) ? String(session.shalom_pickup_code) : nuevoPickupCode()

    const armado = buildLatShipment({
      sender: {
        document: store?.olva_sender_document ?? null,
        phone: store?.olva_sender_phone ?? null,
        email: store?.olva_sender_email ?? null,
      },
      recipient: {
        name: session.buyer_name ?? null,
        document: dni,
        phone: String(session.buyer_phone ?? buyer?.phone ?? ''),
      },
      originHeadquarterId: product?.olva_origin_agency_code ?? null,
      destinationAgencyCode: destino,
      weightKg: product?.package_weight_kg ?? null,
      dimsCm: product?.package_dims_cm ?? null,
      description: contenido,
      declaredValue: Number(session.product_price ?? 0),
      whoPays: store?.olva_who_pays ?? null,
      pin,
    })

    if (!armado.ok) {
      // Falta configuración, no falló nada: el pedido sigue su curso y Logística
      // hace la guía a mano. Se dice QUÉ falta, para que el siguiente pedido de
      // este producto ya salga solo.
      await cerrar(sessionId, 'SKIPPED', 'faltan datos para armar el envío')
      await aLogistica(sessionId,
        `📦 Envío Olva no registrado — falta: ${armado.faltan.join(', ')}. `
        + 'Regístralo a mano cuando despaches (los datos del envío se completan en '
        + 'Productos → el producto → Envío, y el remitente en Mi marca → Envíos).')
      return json({ skipped: 'faltan datos', faltan: armado.faltan })
    }

    // ─── Modo SIMULADO — el ensayo con un pedido real, sin gastar ────────────
    if (store?.olva_auto_guide_enabled !== true) {
      console.log('[olva-order] SIMULADO', sessionId, JSON.stringify(armado.body))
      await cerrar(sessionId, 'SIMULADO', 'interruptor de guía automática Olva apagado en la marca')
      await aLogistica(sessionId,
        '🧪 Ensayo de envío Olva: se armó completo y NO se registró '
        + '(la marca tiene apagado el registro automático). Regístralo a mano cuando despaches.')
      return json({ simulado: true, body: armado.body })
    }

    // ─── La llamada que cuesta plata ─────────────────────────────────────────
    // Con `Idempotency-Key` (pedido + huella del payload): un timeout o un 5xx
    // se repite con la misma clave y Olva devuelve el mismo envío en vez de
    // crear otro. Un 4xx no se repite: es un dato nuestro que hay que corregir.
    const idem = claveDeIdempotencia(String(session.order_id ?? session.id), armado.body)
    const ESPERAS_MS = [0, 2_000, 6_000]
    let res: Awaited<ReturnType<typeof latFetch>> | null = null
    for (const espera of ESPERAS_MS) {
      if (espera) await new Promise(r => setTimeout(r, espera))
      res = await latFetch('/shipments', {
        key,
        sessionId,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify(armado.body),
        timeoutMs: 45_000,
      })
      if (res.ok) break
      const reintentable = res.stage === 'network' || res.stage === 'upstream' || res.stage === 'rate_limit'
      if (!reintentable) break
    }

    if (!res || !res.ok) {
      // El detalle crudo del proveedor quedó anotado en `api_events` por
      // `latFetch`, con su referencia para reclamárselo (§42).
      const sinRespuesta = res?.stage === 'network'
      await cerrar(sessionId, 'FAILED', sinRespuesta
        ? 'el proveedor no respondió (3 intentos con la misma clave de idempotencia)'
        : `el proveedor rechazó el envío (${res?.stage ?? 'desconocido'})`)
      await aLogistica(sessionId, sinRespuesta
        ? '⚠️ Envío Olva sin confirmar: el proveedor no respondió en tres intentos. Mira en su panel si el '
          + 'envío llegó a crearse; si no está, «Reintentar» lo pide de nuevo con la misma clave de '
          + 'idempotencia (no duplica). Si prefieres, regístralo a mano al despachar.'
        : res?.stage === 'quota' || res?.stage === 'auth'
          ? '📦 Envío Olva no registrado — la llave de la API de envíos no sirve o se agotó la cuota. '
            + 'Avisa al equipo; mientras tanto regístralo a mano al despachar.'
          : '📦 Envío Olva no registrado — el proveedor lo rechazó (un dato del envío). El detalle quedó '
            + 'en Conexiones; corrige el producto o el remitente y toca «Reintentar», o regístralo a mano.')
      return json({ error: sinRespuesta ? 'sin respuesta' : 'rechazado', stage: res?.stage }, 502)
    }

    // De acá para abajo, EL ENVÍO EXISTE (o Olva contestó algo). Cualquier
    // problema es de lectura o de escritura nuestra, nunca motivo para volver
    // a registrar sin la misma clave.
    const envio = parseLatShipment(res.data)
    if (!esRegistrado(envio)) {
      // `PENDING_PAYMENT` (un `whoPays: ONLINE` que no mandamos) o `DRAFT` (un
      // `confirm: false` que tampoco): no hay guía por venir. Se cierra en
      // FAILED con el estado, y se anota el cuerpo para ver qué contestó.
      await anotar({
        proveedor: 'OLVA_LAT', op: 'shipments', outcome: 'RECHAZO', sessionId, httpStatus: 200,
        detail: `registro sin REGISTERED · ${JSON.stringify(res.data).slice(0, 900)}`, detailMax: 1000,
      })
      await cerrar(sessionId, 'FAILED', `Olva contestó ${envio.status ?? 'sin estado'} en vez de REGISTERED`)
      await aLogistica(sessionId,
        `⚠️ Olva no dio por registrado el envío (contestó ${envio.status ?? 'sin estado'}). `
        + 'Mira el detalle en Conexiones y avisa al equipo; regístralo a mano al despachar.')
      return json({ error: 'no registrado', status: envio.status }, 502)
    }

    // ─── El rótulo, para pegar al paquete ────────────────────────────────────
    const rotuloUrl = await subirRotulo(envio.registrationNumber!, envio.labelBase64)

    // La clave de recojo definitiva: la que Olva confirmó, o la nuestra.
    const clave = envio.securityPin ?? pin
    const registro = {
      olva_order_id: envio.id,
      olva_registration_number: envio.registrationNumber,
      olva_rotulo_url: rotuloUrl,
      olva_cost: envio.cost,
      shalom_pickup_code: clave,
    }

    // Una guía registrada es plata gastada: se anota SIEMPRE, salga bien o
    // mal, y por eso este `OK` no es ruido como el de una consulta cualquiera.
    await anotar({
      proveedor: 'OLVA_LAT', op: 'shipments', outcome: 'OK', sessionId, providerRef: envio.registrationNumber,
      detail: `registro ${envio.registrationNumber}${envio.cost != null ? ` · S/${envio.cost}` : ''}${envio.trackingNumber ? ` · guía ${envio.trackingNumber}` : ' · guía pendiente de admisión'}`,
    })

    // ─── Si por excepción la guía ya vino, se registra ahora mismo ───────────
    if (esRastreable(envio)) {
      const g = normalizarGuia({ courier: 'OLVA', numero: envio.trackingNumber }, session.agency_name)
      if (g.ok) {
        const reg = await registrarGuia({ ...session, shalom_pickup_code: clave }, g, { pdfUrl: rotuloUrl })
        await cerrar(sessionId, 'CREATED', reg.ok ? null : 'envío registrado, no se pudo escribir la guía en el pedido', registro)
        if (!reg.ok) {
          console.error('[olva-order] no se pudo escribir la guía en el pedido', sessionId, reg.error)
          await aLogistica(sessionId, '⚠️ El envío se registró en Olva pero la guía no se pudo escribir en el pedido. Regístrala a mano — NO registres otro envío.')
          return json({ created: true, guardado: false }, 500)
        }
        await aLogistica(sessionId,
          `📦 Envío registrado en Olva · registro ${envio.registrationNumber} · ${g.ids}. `
          + (rotuloUrl ? 'Imprime el rótulo desde la tarjeta del envío y pégalo al paquete.' : 'El rótulo no se pudo guardar: imprímelo desde el panel de Olva.'))
        return json({ created: true, tracking: { ...g.tracking, ...registro, olva_order_status: 'CREATED', olva_order_reason: null } })
      }
    }

    // ─── Lo normal: registrado, la guía llega con la admisión ────────────────
    // El pedido queda en CREATED sin `tracking_numero`. El barrido pregunta por
    // `GET /shipments/:id` hasta que Olva asigne la guía, y ahí `registrarGuia`
    // se la manda al comprador (y la clave, si ya no debe nada).
    await cerrar(sessionId, 'CREATED', null, registro)
    await chatMessage(sessionId,
      '📦 Tu pedido ya está registrado en Olva. Te mandamos por aquí tu número de guía en cuanto el paquete '
      + 'entre a la agencia.', 'all')
    await aLogistica(sessionId,
      `📦 Envío registrado en Olva · registro ${envio.registrationNumber}${envio.cost != null ? ` · flete S/${envio.cost}` : ''}. `
      + (rotuloUrl
        ? 'Imprime el rótulo desde la tarjeta del envío, pégalo al paquete y llévalo a la sede de origen. '
        : 'El rótulo no se pudo guardar: imprímelo desde el panel de Olva. ')
      + 'La guía de rastreo la asigna Olva al admitir el paquete; el sistema la pone sola y se la manda al comprador.')
    const patch = { ...registro, olva_order_status: 'CREATED', olva_order_reason: null }
    await broadcast(sessionId, 'tracking_update', patch)
    return json({ created: true, pendienteDeGuia: true, tracking: patch })
  }

  /** Decodifica el rótulo (base64) y lo sube al bucket. Best-effort: sin
   *  rótulo el envío sigue registrado y la marca lo imprime desde Olva. */
  async function subirRotulo(registro: string, base64: string | null): Promise<string | null> {
    if (!base64) return null
    try {
      const limpio = base64.replace(/^data:application\/pdf;base64,/, '').replace(/\s+/g, '')
      const bin = atob(limpio)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      // Un PDF empieza por `%PDF`: lo que no, no se guarda como rótulo.
      if (bytes.length < 4 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') {
        await anotar({ proveedor: 'OLVA_LAT', op: 'shipments.rotulo', outcome: 'RECHAZO', sessionId, detail: `el rótulo no es un PDF (${bytes.length} bytes)` })
        return null
      }
      const path = `${sessionId}/${registro}.pdf`
      const up = await supabase.storage.from('olva-rotulos').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) {
        await anotar({ proveedor: 'OLVA_LAT', op: 'shipments.storage', outcome: 'FALLO', sessionId, detail: `Storage olva-rotulos: ${up.error.message}` })
        return null
      }
      return supabase.storage.from('olva-rotulos').getPublicUrl(path).data.publicUrl
    } catch (e) {
      await anotar({ proveedor: 'OLVA_LAT', op: 'shipments.rotulo', outcome: 'FALLO', sessionId, detail: String(e).slice(0, 300) })
      return null
    }
  }
})

/**
 * El rótulo de la sede, tal como lo guardó el checkout:
 * `"NOMBRE · DISTRITO, PROVINCIA, DEPARTAMENTO"`. Se parte con tolerancia —es
 * texto que puede venir de versiones distintas del front— y sin inventar: lo
 * que no venga queda en `null` y `resolveAgencyCode` decide si alcanza.
 */
function parseRotulo(rotulo: string): { name: string | null; district: string | null; province: string | null; department: string | null } {
  if (!rotulo) return { name: null, district: null, province: null, department: null }
  const [nombre, ubicacion] = rotulo.includes('·') ? rotulo.split('·') : ['', rotulo]
  const partes = (ubicacion ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return {
    name: nombre.trim() || null,
    district: partes[0] ?? null,
    province: partes[1] ?? null,
    department: partes[2] ?? null,
  }
}
