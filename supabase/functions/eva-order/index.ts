// ─── SMART LOGISTICS · Registrar el reparto en Eva Courier (§64) ─────────────
// Un pedido A DOMICILIO en Lima o Callao, pagado, que la marca decidió mandar
// con el courier (`reparto_lima = 'COURIER'`, §60), se registra en Eva: Eva
// pasa por el local a recogerlo y lo lleva a la puerta. Antes de esto ese
// pedido lo movía el motorizado propio o nadie.
//
// Lo llama `flow-confirm` apenas el pago cruza (fire-and-forget: cobrar nunca
// se cuelga de despachar) y `order-manage` cuando el vendedor elige COURIER en
// un pedido ya pagado o toca «Reintentar». Es interna — la invoca otra función
// con la service role key, no el navegador.
//
// ⚠️ CADA LLAMADA EXITOSA ES UN MOTORIZADO EN UNA PUERTA. Y Eva NO tiene forma
// de buscar un pedido por nuestro `code` —solo por su `tracking_id`, que es
// justo lo que no tenemos si la llamada murió sin respuesta—. De ahí las
// defensas, calcadas de `shalom-order` y `olva-order`, menos la que acá no
// existe:
//
//   1. CANDADO. Se reclama el pedido con un UPDATE condicional
//      (`eva_order_status IS NULL`) ANTES de llamar a nadie. Dos disparos del
//      mismo pago no registran dos repartos.
//   2. INTERRUPTOR. `stores.courier_lima_enabled` (§60): sin él, SKIPPED.
//   3. NUNCA REINTENTAR A CIEGAS. Un timeout o un 5xx cierra en FAILED con el
//      motivo escrito: «no se sabe si se creó, mira en app.evacourier.pe antes
//      de reintentar». Igual que Olva LAT (`esReconciliable = false`): pagar
//      dos veces el mismo flete —o mandar dos motorizados— cuesta más que una
//      revisión a mano.
//   4. (No hay reconciliación: ver arriba. Es la defensa que Shalom tiene y
//      Eva no permite.)
//
// El rótulo es para el VENDEDOR: Eva recoge en su local y la etiqueta va
// pegada al paquete. Al comprador no le llega documento alguno —le llega el
// paquete—; le llega el aviso de que sale con motorizado y, por el webhook,
// cuándo va en camino.

import { chatMessage, broadcast, saldoOf, supabase } from '../_shared/tracking.ts'
import { anotar, anotarSinRespuesta } from '../_shared/api-eventos.ts'
import {
  NOMBRE_EVA, armarPedidoEva, baseEva, cabeceraEva, cuerpoDeRotulos, esPdf,
  leerRespuestaDeOrden, rutaDePedidos, rutaDeRotulos,
} from '../_shared/eva.ts'

const TIMEOUT_MS = 20_000
const ROTULO_TIMEOUT_MS = 30_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SESSION_COLUMNS =
  'id, order_id, store_id, origin_store_id, buyer_id, buyer_name, buyer_phone, product_name, pack_name, items, ' +
  'product_price, advance_amount, payment_verification, saldo_verification, dispatch_type, reparto_lima, ' +
  'address, address_lat, address_lng, address_verified, delivery_reference, tracking_courier, tracking_numero, eva_order_status'

/** Cierra el expediente. `status` es también el candado: una vez escrito,
 *  ninguna corrida futura vuelve a tomar este pedido sola. `soloDesde` evita
 *  que un error DESPUÉS de CREATED lo degrade a FAILED —que es justo el único
 *  estado que el reintento vuelve a tomar—. */
async function cerrar(
  sessionId: string, status: string, reason: string | null,
  extra: Record<string, unknown> = {}, soloDesde?: string,
) {
  const q = supabase.from('order_sessions').update({
    eva_order_status: status, eva_order_reason: reason, eva_order_at: new Date().toISOString(), ...extra,
  }).eq('id', sessionId)
  await (soloDesde ? q.eq('eva_order_status', soloDesde) : q)
}

const aLogistica = (sessionId: string, body: string) => chatMessage(sessionId, body, 'sellers')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Solo desde adentro: la anon key está en el navegador de cualquiera, y
  // esto manda motorizados. Mismo candado que `shalom-order`.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer || bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return json({ error: 'no autorizado' }, 401)

  const body = await req.json().catch(() => ({})) as { session_id?: string; retry?: boolean }
  const sessionId = String(body.session_id ?? '')
  if (!sessionId) return json({ error: 'session_id requerido' }, 400)
  const reintento = body.retry === true

  const { data: session, error: errSesion } = await supabase.from('order_sessions')
    .select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle()
  if (errSesion) return json({ error: `faltan las columnas de Eva (§64): ${errSesion.message}` }, 500)
  if (!session) return json({ error: 'pedido no encontrado' }, 404)

  // ─── ¿Este pedido va con Eva? ──────────────────────────────────────────────
  // Se descarta ANTES de reclamar: la mayoría de pedidos no son de Eva.
  if (session.dispatch_type !== 'MOTORIZADO_LIMA') return json({ skipped: 'no es domicilio en Lima' })
  if (session.reparto_lima !== 'COURIER') return json({ skipped: 'el pedido no va por courier' })
  if (session.payment_verification !== 'MATCHED') return json({ skipped: 'pago sin verificar' })
  if (session.tracking_numero) return json({ skipped: 'el pedido ya tiene envío registrado' })
  const expediente = String(session.eva_order_status ?? '')
  if (expediente && !(reintento && expediente === 'FAILED')) return json({ skipped: `ya procesado (${expediente})` })

  // ─── El candado ────────────────────────────────────────────────────────────
  const claim = supabase.from('order_sessions')
    .update({ eva_order_status: 'PENDING', eva_order_at: new Date().toISOString() })
    .eq('id', sessionId)
  const { data: claimed } = await (reintento ? claim.eq('eva_order_status', 'FAILED') : claim.is('eva_order_status', null))
    .select('id')
  if (!claimed?.length) return json({ skipped: 'otra corrida ya lo tomó' })

  const storeId = String(session.origin_store_id ?? session.store_id ?? '')
  const ctx = { proveedor: 'EVA' as const, storeId, sessionId }

  try {
    return await registrar()
  } catch (e) {
    const detalle = String(e instanceof Error ? e.message : e).slice(0, 300)
    console.error('[eva-order] error inesperado', sessionId, e)
    await anotar({ ...ctx, op: 'reparto.registrar', outcome: 'RECHAZO', detail: `error de Kross: ${detalle}` })
    await cerrar(sessionId, 'FAILED', `error inesperado al registrar en Eva: ${detalle}`, {}, 'PENDING')
    await aLogistica(sessionId,
      `⚠️ El registro en ${NOMBRE_EVA} falló por un error de Kross. Revisa en app.evacourier.pe si el pedido `
      + `llegó a crearse (código ${session.order_id ?? sessionId}) ANTES de reintentar. El motivo quedó en Panel → Conexiones → Eva.`)
    return json({ error: 'inesperado' }, 500)
  }

  async function registrar(): Promise<Response> {
    const [{ data: store, error: errStore }] = await Promise.all([
      supabase.from('stores').select('nombre, courier_lima_enabled').eq('id', storeId).maybeSingle(),
    ])
    if (errStore) throw new Error(`stores: ${errStore.message}`)

    if (store?.courier_lima_enabled !== true) {
      await cerrar(sessionId, 'SKIPPED', 'la marca no tiene el courier de Lima encendido (Marca → Entrega a domicilio)')
      return json({ skipped: 'courier apagado en la marca' })
    }

    const apiKey = String(Deno.env.get('EVA_API_KEY') ?? '').trim()
    if (!apiKey) {
      // Es un problema de la PLATAFORMA (la llave es de Kross), y se anota
      // para que Conexiones lo diga en vez de fallar pedido por pedido.
      await anotar({ ...ctx, op: 'reparto.registrar', outcome: 'RECHAZO', detail: 'sin EVA_API_KEY en la plataforma' })
      await cerrar(sessionId, 'FAILED', 'la plataforma no tiene la API Key de Eva configurada')
      await aLogistica(sessionId, `⚠️ ${NOMBRE_EVA}: la plataforma no tiene la API Key configurada. Avisar a Kross; mientras tanto, coordinar el reparto por fuera.`)
      return json({ error: 'sin EVA_API_KEY' }, 500)
    }

    // ─── El pedido, como lo quiere Eva ─────────────────────────────────────
    const armado = armarPedidoEva({
      orderId: session.order_id ?? sessionId,
      buyerName: session.buyer_name,
      buyerPhone: session.buyer_phone,
      address: session.address,
      referencia: session.delivery_reference,
      lat: session.address_lat, lng: session.address_lng, verificada: session.address_verified === true,
      saldo: saldoOf(session),
      items: session.items as { nombre?: string; qty?: number; pack_name?: string | null }[] | null,
      productName: session.product_name, packName: session.pack_name,
      tienda: store?.nombre ?? null,
    })
    if (!armado.ok) {
      const motivo = `faltan: ${armado.faltan.join('; ')}`
      await anotar({ ...ctx, op: 'reparto.registrar', outcome: 'RECHAZO', detail: motivo })
      await cerrar(sessionId, 'FAILED', motivo)
      await aLogistica(sessionId,
        `⚠️ No se pudo registrar el reparto en ${NOMBRE_EVA}: ${motivo}. Corrige el pedido (dirección, teléfono) y toca «Reintentar» en Envío Eva.`)
      return json({ error: 'faltan datos', faltan: armado.faltan }, 400)
    }

    // ─── Eva ───────────────────────────────────────────────────────────────
    const base = baseEva({ EVA_API_BASE: Deno.env.get('EVA_API_BASE') })
    const inicio = Date.now()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response | null = null
    try {
      res = await fetch(rutaDePedidos(base), {
        method: 'POST', headers: cabeceraEva(apiKey), body: JSON.stringify(armado.body), signal: ctrl.signal,
      })
    } catch (e) {
      await anotarSinRespuesta({ ...ctx, op: 'reparto.registrar' }, e, Date.now() - inicio)
    } finally {
      clearTimeout(t)
    }

    if (!res) {
      // Sin respuesta NO significa que no se creó. Y no hay cómo preguntar por
      // `code`. Se cierra y se mira a mano: es la regla 3.
      const motivo = `${NOMBRE_EVA} no respondió; NO se sabe si el pedido se creó`
      await cerrar(sessionId, 'FAILED', motivo)
      await aLogistica(sessionId,
        `⚠️ ${motivo}. Busca el código ${session.order_id ?? sessionId} en app.evacourier.pe: si está, copia su tracking; `
        + 'si no está, toca «Reintentar» en Envío Eva. Nunca reintentes sin mirar: serían dos motorizados.')
      return json({ error: 'sin respuesta' }, 502)
    }

    const texto = await res.text().catch(() => '')
    const respuesta = leerRespuestaDeOrden((() => { try { return JSON.parse(texto || 'null') } catch { return null } })(), res.status)
    if (!respuesta.ok) {
      await anotar({
        ...ctx, op: 'reparto.registrar', outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO', httpStatus: res.status,
        detail: `${respuesta.mensaje} · ${texto.slice(0, 400)}`, detailMax: 900, duracionMs: Date.now() - inicio,
      })
      await cerrar(sessionId, 'FAILED', respuesta.mensaje)
      await aLogistica(sessionId, respuesta.reintentable
        ? `⚠️ ${NOMBRE_EVA} falló al registrar (${respuesta.mensaje}). Antes de reintentar, busca el código ${session.order_id ?? sessionId} en app.evacourier.pe.`
        : `⚠️ ${NOMBRE_EVA} rechazó el pedido: ${respuesta.mensaje}. Corrige lo que dice y toca «Reintentar» en Envío Eva.`)
      return json({ error: respuesta.mensaje }, 502)
    }

    // ─── Creado: guardar YA, antes de cualquier otra cosa ──────────────────
    // El tracking es lo único que permite consultar o recibir webhooks de este
    // pedido. Si el rótulo o los mensajes fallan después, esto ya está.
    const trackingId = respuesta.trackingId
    const patch: Record<string, unknown> = {
      tracking_courier: 'EVA', tracking_numero: trackingId, tracking_phase: null,
      eva_estado: 'REGISTRADO', eva_estado_at: new Date().toISOString(),
    }
    await cerrar(sessionId, 'CREATED', null, patch, 'PENDING')
    await anotar({
      ...ctx, op: 'reparto.registrar', outcome: 'OK', httpStatus: res.status, providerRef: trackingId,
      detail: `tracking ${trackingId}${respuesta.dispatchDate ? ` · despacho ${respuesta.dispatchDate}` : ''}`,
      duracionMs: Date.now() - inicio,
    })

    // ─── El rótulo, para pegar al paquete ──────────────────────────────────
    const rotuloUrl = await bajarRotulo(base, apiKey, trackingId)
    if (rotuloUrl) {
      patch.eva_rotulo_url = rotuloUrl
      await supabase.from('order_sessions').update({ eva_rotulo_url: rotuloUrl }).eq('id', sessionId)
    }

    // ─── Avisar ────────────────────────────────────────────────────────────
    await chatMessage(sessionId,
      `🛵 Tu pedido sale con motorizado de ${NOMBRE_EVA}. Te avisamos por aquí cuando esté en camino.`, 'all')
    await aLogistica(sessionId,
      `🛵 Reparto registrado en ${NOMBRE_EVA} · tracking ${trackingId}${respuesta.dispatchDate ? ` · despacho ${respuesta.dispatchDate}` : ''}. `
      + 'Eva lo recoge en tu local: ' + (rotuloUrl
        ? 'imprime el rótulo desde Envío Eva y pégalo al paquete.'
        : 'el rótulo no se pudo bajar; imprímelo desde app.evacourier.pe.'))
    await broadcast(sessionId, 'tracking_update', { ...patch, eva_order_status: 'CREATED', eva_order_reason: null })

    return json({ ok: true, tracking: { ...patch, eva_order_status: 'CREATED', eva_order_reason: null } })
  }

  /** Baja el PDF del rótulo y lo sube al bucket. Best-effort: sin rótulo el
   *  reparto sigue registrado y la marca lo imprime desde el portal de Eva. */
  async function bajarRotulo(base: string, apiKey: string, trackingId: string): Promise<string | null> {
    const inicio = Date.now()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ROTULO_TIMEOUT_MS)
    try {
      const r = await fetch(rutaDeRotulos(base), {
        method: 'POST', headers: cabeceraEva(apiKey), body: JSON.stringify(cuerpoDeRotulos([trackingId])), signal: ctrl.signal,
      })
      const bytes = r.ok ? new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0))) : new Uint8Array(0)
      const tipo = r.headers.get('content-type')
      if (!r.ok || !esPdf(tipo, bytes)) {
        await anotar({
          ...ctx, op: 'reparto.rotulo', outcome: r.status >= 500 ? 'FALLO' : 'RECHAZO', httpStatus: r.status,
          detail: `content-type ${tipo ?? '—'} · ${bytes.length} bytes`, duracionMs: Date.now() - inicio,
        })
        return null
      }
      const path = `${sessionId}/${trackingId}.pdf`
      const up = await supabase.storage.from('eva-rotulos').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) {
        await anotar({ ...ctx, op: 'reparto.storage', outcome: 'FALLO', detail: `Storage eva-rotulos: ${up.error.message}` })
        return null
      }
      return supabase.storage.from('eva-rotulos').getPublicUrl(path).data.publicUrl
    } catch (e) {
      await anotarSinRespuesta({ ...ctx, op: 'reparto.rotulo' }, e, Date.now() - inicio)
      return null
    } finally {
      clearTimeout(t)
    }
  }
})
