// ─── SMART LOGISTICS · Generador de guías Shalom (pendiente #3) ──────────────
// Un pedido de recojo en agencia SHALOM con el adelanto verificado pide su
// propia guía a la cuenta Shalom Pro de la marca. Antes de esto, la guía nacía
// en el mostrador y alguien la copiaba a mano en el pedido.
//
// Lo llama `pay360-webhook` apenas el adelanto cuadra (fire-and-forget: cobrar
// nunca se cuelga de despachar). Es interna — la invoca otra función con la
// service role key, no el navegador.
//
// ⚠️ CADA LLAMADA EXITOSA CUESTA PLATA. El proveedor no tiene sandbox ni
// idempotencia, así que las tres defensas son parte del diseño y no adornos:
//
//   1. CANDADO. Se reclama el pedido con un UPDATE condicional
//      (`shalom_order_status IS NULL`) ANTES de llamar a nadie. Dos webhooks
//      del mismo pago no emiten dos guías para un paquete.
//   2. INTERRUPTOR. `stores.shalom_auto_guide_enabled` arranca en false: la
//      función corre entera, arma el payload y lo deja en el chat de
//      vendedores, pero NO llama al proveedor (status SIMULADO).
//   3. NUNCA REINTENTAR A CIEGAS. Un 2xx, un timeout o una red caída dejan el
//      pedido en un estado que este código no vuelve a tomar solo: puede haber
//      una guía emitida del otro lado. Reintentar es una decisión de una
//      persona, con el comprobante a la vista.
//
// El plan B nunca se va: Logística siempre puede registrar la guía a mano en
// `TrackingBar` — el mismo camino de siempre, que ahora comparte código con
// este (`_shared/guia.ts`).

import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'
import { chatMessage, supabase } from '../_shared/tracking.ts'
import { shalomApiKey } from '../_shared/shalom.ts'
import { buildOrderPayload, esRastreable, parseOrderResponse } from '../_shared/shalom-orders.ts'

const SHALOM_API_BASE = 'https://api.shalom-api-peru.com'
// El primer login de una cuenta Shalom Pro tarda ~90 s (hasta 2 min, dice el
// proveedor): el timeout es de ese orden, no del de una API normal.
const TIMEOUT_MS = 145_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SESSION_COLUMNS =
  'id, order_id, store_id, origin_store_id, buyer_id, buyer_name, buyer_phone, product_id, product_name, ' +
  'product_price, advance_amount, payment_verification, dispatch_type, agency_name, agency_branch_id, ' +
  'delivery_reference, tracking_numero, tracking_ose_id, shalom_order_status'

/** Cierra el expediente del pedido. `status` es también el candado: una vez
 *  escrito, ninguna corrida futura vuelve a tomar este pedido sola. */
async function cerrar(sessionId: string, status: string, reason: string | null, extra: Record<string, unknown> = {}) {
  await supabase.from('order_sessions').update({
    shalom_order_status: status,
    shalom_order_reason: reason,
    shalom_order_at: new Date().toISOString(),
    ...extra,
  }).eq('id', sessionId)
}

/** Aviso a Logística. Nunca al comprador: para él la guía aparece igual que
 *  siempre (el mensaje de `registrarGuia`), venga de una persona o de la API.
 *  Y nunca con el texto crudo del proveedor — ese va solo a los logs. */
const aLogistica = (sessionId: string, body: string) => chatMessage(sessionId, body, 'sellers')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as { session_id?: string }
  const sessionId = String(body.session_id ?? '')
  if (!sessionId) return json({ error: 'session_id requerido' }, 400)

  const { data: session } = await supabase.from('order_sessions')
    .select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle()
  if (!session) return json({ error: 'pedido no encontrado' }, 404)

  // ─── ¿Este pedido va a Shalom? ─────────────────────────────────────────────
  // Se descarta ANTES de reclamar nada: la mayoría de pedidos no son de Shalom
  // y marcarlos a todos ensuciaría la columna que sirve de candado.
  if (session.agency_name !== 'SHALOM') return json({ skipped: 'no es un pedido Shalom' })
  if (!String(session.dispatch_type ?? '').startsWith('AGENCIA')) {
    return json({ skipped: 'no es recojo en agencia' })
  }
  // El adelanto es lo que autoriza a despachar (02 §Antes de despachar).
  if (session.payment_verification !== 'MATCHED') return json({ skipped: 'adelanto sin verificar' })
  if (session.tracking_numero || session.tracking_ose_id) {
    return json({ skipped: 'el pedido ya tiene guía' })
  }
  if (session.shalom_order_status) return json({ skipped: `ya procesado (${session.shalom_order_status})` })

  // ─── El candado ────────────────────────────────────────────────────────────
  // Gana una sola llamada. `.is(null)` hace la condición en la base, no acá:
  // dos invocaciones simultáneas no pueden pasar las dos.
  const { data: claimed } = await supabase.from('order_sessions')
    .update({ shalom_order_status: 'PENDING', shalom_order_at: new Date().toISOString() })
    .eq('id', sessionId).is('shalom_order_status', null)
    .select('id')
  if (!claimed?.length) return json({ skipped: 'otra corrida ya lo tomó' })

  // A partir de acá el pedido YA está reclamado: pase lo que pase, tiene que
  // quedar cerrado. Un throw suelto lo dejaría en PENDING para siempre —sin
  // guía, sin aviso y sin que nadie lo vuelva a mirar—, que es peor que
  // cualquier fallo explicado.
  try {
    return await generar()
  } catch (e) {
    console.error('[shalom-order] error inesperado', sessionId, e)
    await cerrar(sessionId, 'FAILED', 'error inesperado al generar la guía')
    await aLogistica(sessionId,
      '⚠️ La guía automática falló por un error de Kross. Revisa en pro.shalom.pe si el envío '
      + 'llegó a crearse ANTES de emitir otro; si no está, regístrala a mano al despachar.')
    return json({ error: 'inesperado' }, 500)
  }

  async function generar(): Promise<Response> {
    // ─── La config: marca, producto, comprador ─────────────────────────────────
    const storeId = String(session.origin_store_id ?? session.store_id ?? '')
    const [{ data: store }, { data: secrets }, { data: product }, { data: buyer }] = await Promise.all([
      supabase.from('stores').select('nombre, shalom_auto_guide_enabled').eq('id', storeId).maybeSingle(),
      supabase.from('store_secrets')
        .select('shalom_pro_email, shalom_pro_password, shalom_pro_status').eq('store_id', storeId).maybeSingle(),
      session.product_id
        ? supabase.from('products').select('shalom_origin_branch_id, package_size').eq('id', session.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      session.buyer_id
        ? supabase.from('buyers').select('document_number, phone').eq('id', session.buyer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    // La sede de recojo: la columna nueva manda, y los pedidos anteriores a ella
    // guardan su id dentro de `delivery_reference` (ver sección 27.b).
    const destino = String(session.agency_branch_id ?? session.delivery_reference ?? '').trim()

    const armado = buildOrderPayload({
      orderRef: String(session.order_id ?? session.id),
      origenBranchId: String(product?.shalom_origin_branch_id ?? ''),
      destinoBranchId: /^\d+$/.test(destino) ? destino : '',
      remitente: { nombre: String(store?.nombre ?? '') },
      destinatario: {
        nombre: String(session.buyer_name ?? ''),
        dni: String(buyer?.document_number ?? ''),
        telefono: String(session.buyer_phone ?? buyer?.phone ?? ''),
      },
      paquete: {
        size: product?.package_size ?? null,
        contenido: String(session.product_name ?? ''),
        valorDeclarado: Number(session.product_price ?? 0),
      },
    })

    if (!armado.ok) {
      // Falta configuración, no falló nada: el pedido sigue su curso y Logística
      // hace la guía a mano. Se dice QUÉ falta, para que el siguiente pedido de
      // este producto ya salga solo.
      await cerrar(sessionId, 'SKIPPED', 'faltan datos para armar el envío')
      await aLogistica(sessionId,
        `📦 Guía automática no generada — falta: ${armado.faltan.join(', ')}. `
        + 'Registra la guía a mano cuando despaches (se completa en Productos → el producto → Envío).')
      return json({ skipped: 'faltan datos', faltan: armado.faltan })
    }

    const email = String(secrets?.shalom_pro_email ?? '')
    const password = String(secrets?.shalom_pro_password ?? '')
    if (!email || !password || secrets?.shalom_pro_status !== 'CONNECTED') {
      await cerrar(sessionId, 'SKIPPED', 'la marca no tiene su cuenta Shalom Pro conectada')
      await aLogistica(sessionId,
        '📦 Guía automática no generada — la marca no tiene conectada su cuenta Shalom Pro '
        + '(Panel → Mi marca → Envíos). Registra la guía a mano cuando despaches.')
      return json({ skipped: 'cuenta Shalom Pro no conectada' })
    }

    // ─── Modo SIMULADO — el ensayo con un pedido real, sin gastar ──────────────
    if (store?.shalom_auto_guide_enabled !== true) {
      console.log('[shalom-order] SIMULADO', sessionId, JSON.stringify(armado.body))
      await cerrar(sessionId, 'SIMULADO', 'interruptor de guía automática apagado en la marca')
      await aLogistica(sessionId,
        '🧪 Ensayo de guía automática: el envío se armó completo y NO se emitió '
        + '(la marca tiene apagada la guía automática). Registra la guía a mano cuando despaches.')
      return json({ simulado: true, body: armado.body })
    }

    // ─── La llamada que cuesta plata ───────────────────────────────────────────
    const key = await shalomApiKey()
    if (!key) {
      await cerrar(sessionId, 'FAILED', 'sin llave de la API de envíos')
      await aLogistica(sessionId, '📦 Guía automática no generada — problema de configuración de Kross. Regístrala a mano y avisa al equipo.')
      return json({ error: 'sin api key' }, 500)
    }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${SHALOM_API_BASE}/v1/orders`, {
        method: 'POST',
        headers: {
          'X-API-Key': key,
          'X-Shalom-Email': email,
          'X-Shalom-Password': password,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(armado.body),
        signal: ctrl.signal,
      })
    } catch (e) {
      clearTimeout(t)
      // El caso delicado: sin respuesta NO significa sin guía. Puede haberse
      // emitido igual. Por eso nadie reintenta esto solo.
      console.error('[shalom-order] sin respuesta del proveedor', sessionId, e)
      await cerrar(sessionId, 'FAILED', 'el proveedor no respondió')
      await aLogistica(sessionId,
        '⚠️ Guía automática sin confirmar: Shalom no respondió a tiempo. '
        + 'ANTES de emitir otra, revisa en pro.shalom.pe si el envío ya se creó — puede existir. '
        + 'Si existe, registra esa guía acá con el botón de siempre.')
      return json({ error: 'sin respuesta' }, 502)
    }
    clearTimeout(t)

    const raw = await res.text().catch(() => '')
    if (!res.ok) {
      // El texto crudo del proveedor va SOLO a los logs (misma regla que
      // pay360: nada de terceros frente a la gente del chat).
      console.error('[shalom-order] rechazo del proveedor', sessionId, res.status, raw.slice(0, 500))
      await cerrar(sessionId, 'FAILED', `el proveedor rechazó el envío (${res.status})`)
      await aLogistica(sessionId,
        '📦 Guía automática no generada — Shalom rechazó el pedido de envío. '
        + 'Regístrala a mano cuando despaches; el detalle quedó en los logs de Kross.')
      return json({ error: 'rechazado', status: res.status }, 502)
    }

    // De acá para abajo, ASUMIMOS QUE LA GUÍA EXISTE. Cualquier problema es de
    // lectura, nunca motivo para volver a emitir.
    let cuerpo: unknown
    try { cuerpo = JSON.parse(raw || 'null') } catch { cuerpo = null }
    const guia = parseOrderResponse(cuerpo)
    if (!esRastreable(guia)) {
      console.error('[shalom-order] respuesta sin guía rastreable', sessionId, raw.slice(0, 500))
      await cerrar(sessionId, 'CREATED', 'guía emitida, sin datos rastreables en la respuesta',
        { shalom_order_id: guia.orderId })
      await aLogistica(sessionId,
        '⚠️ El envío se creó en Shalom pero la respuesta no trajo la guía. '
        + 'Búscala en pro.shalom.pe y regístrala acá con el botón de siempre — NO generes otra.')
      return json({ created: true, sinGuia: true })
    }

    const g = normalizarGuia(
      { courier: 'SHALOM', numero: guia.numero, codigo: guia.codigo, ose_id: guia.oseId },
      session.agency_name,
    )
    if (!g.ok) {
      console.error('[shalom-order] guía con formato inesperado', sessionId, JSON.stringify(guia))
      await cerrar(sessionId, 'CREATED', 'guía emitida con formato inesperado', { shalom_order_id: guia.orderId })
      await aLogistica(sessionId,
        '⚠️ El envío se creó en Shalom pero su guía no tiene el formato esperado. '
        + 'Regístrala a mano desde el comprobante — NO generes otra.')
      return json({ created: true, formatoRaro: true })
    }

    const reg = await registrarGuia(session, g)
    await cerrar(sessionId, 'CREATED', reg.ok ? null : 'guía emitida, no se pudo escribir en el pedido',
      { shalom_order_id: guia.orderId })
    if (!reg.ok) {
      console.error('[shalom-order] no se pudo escribir la guía en el pedido', sessionId, reg.error)
      await aLogistica(sessionId, '⚠️ El envío se creó en Shalom pero no se pudo escribir en el pedido. Regístralo a mano — NO generes otro.')
      return json({ created: true, guardado: false }, 500)
    }

    await aLogistica(sessionId, `📦 Guía generada automáticamente en Shalom · ${g.ids}. El comprador ya la tiene en su chat.`)
    return json({ created: true, tracking: g.tracking })
  }
})
