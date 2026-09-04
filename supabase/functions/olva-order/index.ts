// ─── SMART LOGISTICS · Generador de guías OLVA (por Olva LAT) ────────────────
// El gemelo de `shalom-order` para el otro courier: un pedido de recojo en
// agencia OLVA con el adelanto verificado registra su propia guía contra
// `POST /account/register` de Olva LAT, y desde ahí sigue el ciclo de siempre —
// aviso al comprador, suscripción al webhook, fases y cobranza (`_shared/guia.ts`).
//
// Lo llama `pay360-webhook` apenas el adelanto cuadra (fire-and-forget: cobrar
// nunca se cuelga de despachar). Es interna — la invoca otra función con la
// service role key, no el navegador: emitir guías CUESTA PLATA y la anon key
// vive en el bundle de la PWA.
//
// ⚠️ TRES DIFERENCIAS CON SHALOM QUE CAMBIAN EL DISEÑO, no el estilo:
//
//   1. **La guía nace en la cuenta del PROVEEDOR, no en una de la marca.** Los
//      endpoints de «cuenta» de Olva LAT corren sobre su OAuth2 global con Olva;
//      no hay credenciales por cliente como el Shalom Pro de cada marca. El
//      remitente es un dato que mandamos (`sender`), no una identidad
//      verificada. Quién factura el flete es una conversación comercial abierta
//      —anotada en 02-SMART-LOGISTICS y en ESTADO-OPERATIVO—, y hasta que se
//      cierre el interruptor por marca se queda APAGADO: la función corre
//      entera y deja el payload en el chat de vendedores sin emitir (SIMULADO).
//   2. **No hay forma de reconciliar.** Shalom tiene `GET /v1/orders` y
//      `shalom-order` la usa como su defensa central: ante un timeout, pregunta
//      si la guía ya existe antes de reintentar. Olva LAT no publica ese
//      endpoint (`esReconciliable === false`), así que acá **no se reintenta
//      nunca** —ni un 5xx—: sin respuesta se cierra en FAILED y una persona
//      verifica antes de emitir otra. Pagar dos veces el mismo flete, o mandar
//      dos paquetes, cuesta más que una guía hecha a mano.
//   3. **No hay clave de retiro.** Shalom deja elegir el `pickup_code`; acá el
//      campo no existe. El pedido queda como una guía Olva registrada a mano:
//      el chat entrega la guía y la clave la coordina una persona.
//
// El candado (defensa #1) sí es idéntico: se reclama el pedido con un UPDATE
// condicional ANTES de llamar a nadie, así que dos webhooks del mismo pago no
// registran dos envíos para un paquete.
//
// Deploy: supabase functions deploy olva-order --project-ref ofdjghntvmrdfjhazfvz

import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'
import { chatMessage, supabase } from '../_shared/tracking.ts'
import { latAgencies, latFetch, olvaLatApiKey } from '../_shared/olva-lat-api.ts'
import {
  buildLatShipment, esRastreable, parseLatShipment, resolveAgencyCode,
} from '../_shared/olva-lat-orders.ts'
import { CONTENT_LABELS, isDeclaredContent } from '../_shared/shalom-orders.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SESSION_COLUMNS =
  'id, order_id, store_id, origin_store_id, buyer_id, buyer_name, buyer_phone, product_id, product_name, ' +
  'product_price, advance_amount, payment_verification, saldo_verification, dispatch_type, agency_name, ' +
  'agency_branch_id, agency_branch_label, delivery_reference, tracking_numero, olva_order_status'

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
        .select('nombre, olva_auto_guide_enabled, olva_sender_name, olva_sender_document, olva_sender_phone')
        .eq('id', storeId).maybeSingle(),
      session.product_id
        ? supabase.from('products')
            .select('olva_origin_agency_code, package_weight_kg, declared_content').eq('id', session.product_id).maybeSingle()
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

    const armado = buildLatShipment({
      sender: {
        name: store?.olva_sender_name ?? store?.nombre ?? null,
        document: store?.olva_sender_document ?? null,
        phone: store?.olva_sender_phone ?? null,
      },
      recipient: {
        name: session.buyer_name ?? null,
        document: dni,
        phone: String(session.buyer_phone ?? buyer?.phone ?? ''),
      },
      originAgencyCode: product?.olva_origin_agency_code ?? null,
      destinationAgencyCode: destino,
      weightKg: product?.package_weight_kg ?? null,
      description: contenido,
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
    // UNA sola. Sin reintentos y sin reconciliación: el proveedor no publica
    // cómo preguntar si el envío ya existe (`esReconciliable`), así que repetir
    // es arriesgarse a dos guías por un paquete. Un fallo cierra en FAILED y el
    // panel ofrece reintentar a mano DESPUÉS de que una persona verificó.
    const res = await latFetch('/account/register', {
      key,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(armado.body),
      timeoutMs: 60_000,
    })

    if (!res.ok) {
      // El detalle crudo del proveedor quedó en los logs de `latFetch`.
      const sinRespuesta = res.stage === 'network'
      await cerrar(sessionId, 'FAILED', sinRespuesta
        ? 'el proveedor no respondió'
        : `el proveedor rechazó el envío (${res.stage})`)
      await aLogistica(sessionId, sinRespuesta
        ? '⚠️ Envío Olva sin confirmar: el proveedor no respondió y no hay forma de preguntarle si '
          + 'llegó a registrarse. ANTES de registrar otro, verifícalo en Olva — puede existir. '
          + 'Si existe, registra esa guía acá con el botón de siempre.'
        : '📦 Envío Olva no registrado — el proveedor lo rechazó. Regístralo a mano cuando '
          + 'despaches; el detalle quedó en los logs de Kross.')
      return json({ error: sinRespuesta ? 'sin respuesta' : 'rechazado', stage: res.stage }, 502)
    }

    // De acá para abajo, EL ENVÍO EXISTE. Cualquier problema es de lectura o de
    // escritura nuestra, nunca motivo para volver a registrar.
    const guia = parseLatShipment(res.data)
    if (!esRastreable(guia)) {
      console.error('[olva-order] respuesta sin guía rastreable', sessionId)
      await cerrar(sessionId, 'CREATED', 'envío registrado, sin número de guía en la respuesta', { olva_order_id: guia.orderId })
      await aLogistica(sessionId,
        '⚠️ El envío se registró en Olva pero la respuesta no trajo el número de guía. '
        + 'Búscalo en el comprobante y regístralo acá con el botón de siempre — NO registres otro.')
      return json({ created: true, sinGuia: true })
    }

    const g = normalizarGuia({ courier: 'OLVA', numero: guia.numero }, session.agency_name)
    if (!g.ok) {
      console.error('[olva-order] guía con formato inesperado', sessionId, JSON.stringify(guia))
      await cerrar(sessionId, 'CREATED', 'envío registrado con guía de formato inesperado', { olva_order_id: guia.orderId })
      await aLogistica(sessionId,
        '⚠️ El envío se registró en Olva pero su guía no tiene el formato esperado. '
        + 'Regístrala a mano desde el comprobante — NO registres otro envío.')
      return json({ created: true, formatoRaro: true })
    }

    // `registrarGuia` se encarga del resto y es el MISMO camino que la guía
    // escrita a mano: mensaje al comprador, broadcast y —acá sí— la suscripción
    // al webhook de Olva LAT, que es gratis y arranca el tracking al instante.
    const reg = await registrarGuia(session, g, { pdfUrl: guia.pdfUrl })
    await cerrar(sessionId, 'CREATED', reg.ok ? null : 'envío registrado, no se pudo escribir en el pedido',
      { olva_order_id: guia.orderId })
    if (!reg.ok) {
      console.error('[olva-order] no se pudo escribir la guía en el pedido', sessionId, reg.error)
      await aLogistica(sessionId, '⚠️ El envío se registró en Olva pero no se pudo escribir en el pedido. Regístralo a mano — NO registres otro.')
      return json({ created: true, guardado: false }, 500)
    }

    await aLogistica(sessionId,
      `📦 Envío registrado automáticamente en Olva · ${g.ids}. El comprador ya tiene su guía en el chat. `
      + 'La clave de recojo la coordina una persona: Olva no la emite por API.')
    return json({ created: true, tracking: g.tracking })
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
