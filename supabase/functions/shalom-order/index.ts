// ─── SMART LOGISTICS · Generador de guías Shalom (pendiente #3) ──────────────
// Un pedido de recojo en agencia SHALOM con el adelanto verificado pide su
// propia guía a la cuenta Shalom Pro de la marca. Antes de esto, la guía nacía
// en el mostrador y alguien la copiaba a mano en el pedido.
//
// Lo llama `pay360-webhook` apenas el adelanto cuadra (fire-and-forget: cobrar
// nunca se cuelga de despachar). Es interna — la invoca otra función con la
// service role key, no el navegador.
//
// ⚠️ CADA LLAMADA EXITOSA CUESTA PLATA. La doc del proveedor es explícita: no
// hay sandbox ni clave de idempotencia, y un timeout NO significa que la orden
// no se creó. De ahí las cuatro defensas, que son el diseño y no un adorno:
//
//   1. CANDADO. Se reclama el pedido con un UPDATE condicional
//      (`shalom_order_status IS NULL`) ANTES de llamar a nadie. Dos webhooks
//      del mismo pago no emiten dos guías para un paquete.
//   2. INTERRUPTOR. `stores.shalom_auto_guide_enabled` arranca en false: la
//      función corre entera, arma el payload y lo deja en el chat de
//      vendedores, pero NO emite (status SIMULADO).
//   3. RECONCILIAR ANTES QUE REINTENTAR. Si la llamada no responde, se
//      pregunta a `GET /v1/orders` si la guía ya existe —que es justo lo que
//      la doc manda hacer— y se registra esa. Nunca se emite una segunda.
//   4. NUNCA REINTENTAR A CIEGAS. Si ni siquiera eso se puede resolver, el
//      pedido queda en un estado que este código no vuelve a tomar solo.
//
// El plan B nunca se va: Logística siempre puede registrar la guía a mano en
// `TrackingBar` — el mismo camino de siempre, que ahora comparte código con
// este (`_shared/guia.ts`).

import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'
import { chatMessage, supabase } from '../_shared/tracking.ts'
import { shalomApiKey } from '../_shared/shalom.ts'
import {
  buildOrderPayload, buscarOrdenPorDni, esRastreable, isShalomSize,
  nuevoPickupCode, parseOrderResponse, resolveProductId,
} from '../_shared/shalom-orders.ts'

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
 *  Y nunca con el texto crudo del proveedor —ese va solo a los logs— ni con la
 *  clave de retiro: `viewer=seller` se resuelve con el token del comprador. */
const aLogistica = (sessionId: string, body: string) => chatMessage(sessionId, body, 'sellers')

/** Una llamada al proveedor con timeout. Devuelve la respuesta o `null` si no
 *  hubo ninguna (timeout o red), que es un caso MUY distinto de un rechazo. */
async function llamar(url: string, init: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    console.error('[shalom-order] sin respuesta de', url, e)
    return null
  } finally {
    clearTimeout(t)
  }
}

const leerJson = async (r: Response): Promise<unknown> => {
  const raw = await r.text().catch(() => '')
  try { return JSON.parse(raw || 'null') } catch { return null }
}

/**
 * Nombres y apellidos de RENIEC. Solo hacen falta cuando el destinatario aún NO
 * existe en la cuenta Shalom Pro: si existe, se manda su `person_id` y Shalom
 * usa los suyos. No se parte `buyer_name` en pedazos —"Juan Pérez de la Cruz"
 * no se separa por espacios— porque registrar mal a una persona en la cuenta
 * del cliente no se deshace desde acá.
 */
async function nombreReniec(dni: string): Promise<{ name: string; lastName: string; surName: string } | null> {
  const token = Deno.env.get('DECOLECTA_TOKEN')
  if (!token) return null
  try {
    const r = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!r.ok) return null
    const d = await r.json() as Record<string, unknown>
    const name = String(d?.first_name ?? '').trim()
    const lastName = String(d?.first_last_name ?? '').trim()
    const surName = String(d?.second_last_name ?? '').trim()
    return name && lastName && surName ? { name, lastName, surName } : null
  } catch (e) {
    console.error('[shalom-order] RENIEC falló', e)
    return null
  }
}

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
    // ─── La config: marca, producto, comprador ───────────────────────────────
    const storeId = String(session.origin_store_id ?? session.store_id ?? '')
    const [{ data: store }, { data: secrets }, { data: product }, { data: buyer }] = await Promise.all([
      supabase.from('stores').select('nombre, shalom_auto_guide_enabled').eq('id', storeId).maybeSingle(),
      supabase.from('store_secrets')
        .select('shalom_pro_email, shalom_pro_password, shalom_pro_status').eq('store_id', storeId).maybeSingle(),
      session.product_id
        ? supabase.from('products')
            .select('shalom_origin_branch_id, package_size, declared_content').eq('id', session.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      session.buyer_id
        ? supabase.from('buyers').select('document_number, phone').eq('id', session.buyer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const email = String(secrets?.shalom_pro_email ?? '')
    const password = String(secrets?.shalom_pro_password ?? '')
    if (!email || !password || secrets?.shalom_pro_status !== 'CONNECTED') {
      await cerrar(sessionId, 'SKIPPED', 'la marca no tiene su cuenta Shalom Pro conectada')
      await aLogistica(sessionId,
        '📦 Guía automática no generada — la marca no tiene conectada su cuenta Shalom Pro '
        + '(Panel → Mi marca → Envíos). Registra la guía a mano cuando despaches.')
      return json({ skipped: 'cuenta Shalom Pro no conectada' })
    }

    const key = await shalomApiKey()
    if (!key) {
      await cerrar(sessionId, 'FAILED', 'sin llave de la API de envíos')
      await aLogistica(sessionId, '📦 Guía automática no generada — problema de configuración de Kross. Regístrala a mano y avisa al equipo.')
      return json({ error: 'sin api key' }, 500)
    }
    const auth = {
      'X-API-Key': key,
      'X-Shalom-Email': email,
      'X-Shalom-Password': password,
    }

    // Credenciales rechazadas: se refleja en la marca para que el panel lo diga
    // (⏳ Verificando → ✗ Rechazadas) en vez de fallar en silencio pedido a pedido.
    const credencialesRechazadas = async () => {
      await supabase.from('store_secrets')
        .update({ shalom_pro_status: 'FAILED', shalom_pro_checked_at: new Date().toISOString() })
        .eq('store_id', storeId)
      await cerrar(sessionId, 'FAILED', 'Shalom Pro rechazó las credenciales de la marca')
      await aLogistica(sessionId,
        '📦 Guía automática no generada — Shalom Pro rechazó el usuario y contraseña de la marca. '
        + 'Actualízalos en Panel → Mi marca → Envíos; mientras tanto, la guía va a mano.')
    }

    // ─── El destino y el DNI, que son del pedido ─────────────────────────────
    // La sede de recojo: la columna nueva manda, y los pedidos anteriores a ella
    // guardan su id dentro de `delivery_reference` (ver sección 27.b).
    const destinoRaw = String(session.agency_branch_id ?? session.delivery_reference ?? '').trim()
    const destino = /^\d+$/.test(destinoRaw) ? destinoRaw : ''
    const dni = String(buyer?.document_number ?? '').replace(/\D/g, '')
    const size = isShalomSize(product?.package_size) ? product.package_size : null

    // ─── Lo que hay que resolver contra el proveedor ─────────────────────────
    // El producto (su id es POR CUENTA) y la persona (para no chocar con el 409
    // por documento ya registrado). Van juntos: la conexión con Shalom se
    // reutiliza, así que el login caro se paga una sola vez.
    const [productos, persona] = await Promise.all([
      size ? llamar(`${SHALOM_API_BASE}/v1/products`, { headers: auth }) : Promise.resolve(null),
      /^\d{8}$/.test(dni)
        ? llamar(`${SHALOM_API_BASE}/v1/persons/search?document=${dni}&type=DNI`, { headers: auth })
        : Promise.resolve(null),
    ])

    if (productos?.status === 401 || persona?.status === 401) {
      await credencialesRechazadas()
      return json({ error: 'credenciales rechazadas' }, 502)
    }

    const productId = productos?.ok && size ? resolveProductId(await leerJson(productos), size) : null
    // El tamaño está configurado pero no se pudo resolver contra la cuenta: o el
    // catálogo no respondió, o esa cuenta no ofrece ese producto. Se distingue
    // del "producto sin configurar" porque se arregla en otro lado — y sin esto,
    // Logística iría a completar un campo que ya estaba lleno.
    if (size && !productId) {
      await cerrar(sessionId, 'SKIPPED', 'no se pudo resolver el tamaño contra el catálogo de Shalom')
      await aLogistica(sessionId,
        `📦 Guía automática no generada — Shalom no confirmó el tamaño "${size}" en el catálogo de la cuenta `
        + '(puede estar caído, o esa cuenta no ofrece ese producto). Registra la guía a mano cuando despaches.')
      return json({ skipped: 'catálogo sin resolver' })
    }
    // 404 = la persona no está registrada en la cuenta: hay que mandar sus
    // nombres. Cualquier otra cosa (500, timeout) se trata igual: sin id.
    const personId = persona?.ok
      ? Number((await leerJson(persona) as { id?: unknown })?.id) || null
      : null
    const reniec = personId ? null : (/^\d{8}$/.test(dni) ? await nombreReniec(dni) : null)

    const pickupCode = nuevoPickupCode()
    const armado = buildOrderPayload({
      originTerminalId: String(product?.shalom_origin_branch_id ?? ''),
      destinyTerminalId: destino,
      productId,
      declaredContent: product?.declared_content ?? null,
      pickupCode,
      receiver: {
        id: personId,
        dni,
        name: reniec?.name ?? null,
        lastName: reniec?.lastName ?? null,
        surName: reniec?.surName ?? null,
        phone: String(session.buyer_phone ?? buyer?.phone ?? ''),
      },
    })

    if (!armado.ok) {
      // Falta configuración, no falló nada: el pedido sigue su curso y Logística
      // hace la guía a mano. Se dice QUÉ falta, para que el siguiente pedido de
      // este producto ya salga solo.
      await cerrar(sessionId, 'SKIPPED', 'faltan datos para armar el envío')
      await aLogistica(sessionId,
        `📦 Guía automática no generada — falta: ${armado.faltan.join(', ')}. `
        + 'Registra la guía a mano cuando despaches (el envío del producto se completa en Productos → el producto → Envío).')
      return json({ skipped: 'faltan datos', faltan: armado.faltan })
    }

    // ─── Modo SIMULADO — el ensayo con un pedido real, sin gastar ────────────
    if (store?.shalom_auto_guide_enabled !== true) {
      console.log('[shalom-order] SIMULADO', sessionId, JSON.stringify(armado.body))
      await cerrar(sessionId, 'SIMULADO', 'interruptor de guía automática apagado en la marca')
      await aLogistica(sessionId,
        '🧪 Ensayo de guía automática: el envío se armó completo y NO se emitió '
        + '(la marca tiene apagada la guía automática). Registra la guía a mano cuando despaches.')
      return json({ simulado: true, body: armado.body })
    }

    // ─── La llamada que cuesta plata ─────────────────────────────────────────
    const post = () => llamar(`${SHALOM_API_BASE}/v1/orders`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(armado.body),
    })

    let res = await post()

    // Sin respuesta: puede haberse creado igual. La doc lo dice con todas sus
    // letras — antes de nada, preguntar si la guía ya existe.
    if (!res) return await reconciliar()

    // 409 = ya hay una persona con ese documento. La orden NO se creó, así que
    // reintentar es seguro: se busca su id y se manda ese en vez de los nombres.
    if (res.status === 409 && !personId) {
      const p = await llamar(`${SHALOM_API_BASE}/v1/persons/search?document=${dni}&type=DNI`, { headers: auth })
      const id = p?.ok ? Number((await leerJson(p) as { id?: unknown })?.id) || null : null
      if (id) {
        const receiver = armado.body.receiver as Record<string, unknown>
        armado.body.receiver = { id, document_type: receiver.document_type, document: receiver.document, phone: receiver.phone }
        res = await post()
        if (!res) return await reconciliar()
      }
    }

    if (res.status === 401) {
      await credencialesRechazadas()
      return json({ error: 'credenciales rechazadas' }, 502)
    }

    if (!res.ok) {
      // El texto crudo del proveedor va SOLO a los logs (misma regla que
      // pay360: nada de terceros frente a la gente del chat).
      const detalle = await res.text().catch(() => '')
      console.error('[shalom-order] rechazo del proveedor', sessionId, res.status, detalle.slice(0, 500))
      await cerrar(sessionId, 'FAILED', `el proveedor rechazó el envío (${res.status})`)
      await aLogistica(sessionId,
        '📦 Guía automática no generada — Shalom rechazó el pedido de envío. '
        + 'Regístrala a mano cuando despaches; el detalle quedó en los logs de Kross.')
      return json({ error: 'rechazado', status: res.status }, 502)
    }

    // De acá para abajo, LA GUÍA EXISTE. Cualquier problema es de lectura o de
    // escritura nuestra, nunca motivo para volver a emitir.
    return await guardar(parseOrderResponse(await leerJson(res)), pickupCode)

    /** Sin respuesta del proveedor: preguntar si la guía ya se creó. */
    async function reconciliar(): Promise<Response> {
      const r = await llamar(`${SHALOM_API_BASE}/v1/orders?page=1&per_page=20`, { headers: auth })
      const encontrada = r?.ok ? buscarOrdenPorDni(await leerJson(r), dni) : null
      if (encontrada) {
        console.log('[shalom-order] reconciliada tras timeout', sessionId, encontrada.numero)
        return await guardar(encontrada, pickupCode, encontrada.orderId)
      }
      await cerrar(sessionId, 'FAILED', 'el proveedor no respondió')
      await aLogistica(sessionId,
        '⚠️ Guía automática sin confirmar: Shalom no respondió y tampoco pudimos verificar si el envío '
        + 'llegó a crearse. ANTES de emitir otra, revísalo en pro.shalom.pe — puede existir. '
        + 'Si existe, registra esa guía acá con el botón de siempre.')
      return json({ error: 'sin respuesta' }, 502)
    }

    /** Escribe la guía en el pedido. La clave de retiro se guarda en la fila y
     *  NO viaja a ningún chat: en Kross se entrega contra el saldo pagado. */
    async function guardar(
      guia: ReturnType<typeof parseOrderResponse>,
      code: string,
      orderId: string | null = null,
    ): Promise<Response> {
      const extra = { shalom_pickup_code: code, shalom_order_id: orderId }

      if (!esRastreable(guia)) {
        console.error('[shalom-order] respuesta sin guía rastreable', sessionId)
        await cerrar(sessionId, 'CREATED', 'guía emitida, sin datos rastreables en la respuesta', extra)
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
        await cerrar(sessionId, 'CREATED', 'guía emitida con formato inesperado', extra)
        await aLogistica(sessionId,
          '⚠️ El envío se creó en Shalom pero su guía no tiene el formato esperado. '
          + 'Regístrala a mano desde el comprobante — NO generes otra.')
        return json({ created: true, formatoRaro: true })
      }

      // `yaSuscrito`: la orden se creó con `track: true`, así que el webhook ya
      // la está mirando — no se gasta otra request en suscribirla.
      const reg = await registrarGuia(session, g, { yaSuscrito: true })
      await cerrar(sessionId, 'CREATED', reg.ok ? null : 'guía emitida, no se pudo escribir en el pedido', extra)
      if (!reg.ok) {
        console.error('[shalom-order] no se pudo escribir la guía en el pedido', sessionId, reg.error)
        await aLogistica(sessionId, '⚠️ El envío se creó en Shalom pero no se pudo escribir en el pedido. Regístralo a mano — NO generes otro.')
        return json({ created: true, guardado: false }, 500)
      }

      await aLogistica(sessionId,
        `📦 Guía generada automáticamente en Shalom · ${g.ids}. El comprador ya la tiene en su chat. `
        + 'Su clave de retiro quedó guardada en el pedido y se le entrega cuando pague el saldo.')
      return json({ created: true, tracking: g.tracking })
    }
  }
})
