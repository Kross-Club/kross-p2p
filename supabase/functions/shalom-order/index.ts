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
// no se creó. De ahí las CINCO defensas, que son el diseño y no un adorno:
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
//   5. CONTINGENCIA. Shalom no tiene API oficial: las dos que usamos son de
//      terceros. Si el titular (Shalom PE) no responde, se emite por Shalom LAT
//      contra la MISMA cuenta Shalom Pro — y como es la misma cuenta, sus
//      "envíos pendientes" ven lo que el titular haya alcanzado a crear, así
//      que la contingencia mira ahí ANTES de emitir. Un proveedor caído deja de
//      ser una guía menos. Ver `_shared/shalom-lat-emisor.ts`.
//
// El plan B nunca se va: Logística siempre puede registrar la guía a mano en
// `TrackingBar` — el mismo camino de siempre, que ahora comparte código con
// este (`_shared/guia.ts`).

import { normalizarGuia, registrarGuia } from '../_shared/guia.ts'
import { chatMessage, supabase } from '../_shared/tracking.ts'
import { shalomApiKey, shalomLatApiKey } from '../_shared/shalom.ts'
import {
  buildOrderPayload, buscarOrdenPorDni, esRastreable, isShalomSize,
  nuevoPickupCode, parseOrderResponse, resolveProductId,
} from '../_shared/shalom-orders.ts'
import { buildLatRegisterPayload } from '../_shared/shalom-lat.ts'
import { emitirGuiaLat } from '../_shared/shalom-lat-emisor.ts'
import { anotar, anotarSinRespuesta } from '../_shared/api-eventos.ts'
import { refDelProveedor } from '../_shared/integraciones.ts'

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
  'product_price, advance_amount, payment_verification, saldo_verification, dispatch_type, agency_name, ' +
  'agency_branch_id, delivery_reference, tracking_numero, tracking_ose_id, shalom_order_status'

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

/** Una llamada al titular con timeout. Devuelve la respuesta o `null` si no
 *  hubo ninguna (timeout o red), que es un caso MUY distinto de un rechazo.
 *  Lo que no sirvió queda anotado en `api_events` con su referencia (§42): un
 *  proveedor al que hay que reclamarle se le reclama con datos. */
async function llamar(op: string, sessionId: string, url: string, init: RequestInit): Promise<Response | null> {
  const ctx = { proveedor: 'SHALOM_PE' as const, op, sessionId }
  const inicio = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    // El cuerpo NO se consume acá: quien llama lo lee después. Solo se anota
    // qué status devolvió, que es lo que arma la línea de tiempo.
    if (!res.ok) {
      await anotar({
        ...ctx,
        outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO',
        httpStatus: res.status,
        providerRef: refDelProveedor(h => res.headers.get(h)),
        duracionMs: Date.now() - inicio,
      })
    }
    return res
  } catch (e) {
    await anotarSinRespuesta(ctx, e, Date.now() - inicio)
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

  // ─── Solo desde adentro ────────────────────────────────────────────────────
  // El gateway de Supabase acepta cualquier JWT del proyecto, y la anon key es
  // uno: sin esto, quien tenga esa llave —está en el bundle de la PWA, o sea
  // en el navegador de cualquiera— podría disparar la emisión de guías, que
  // CUESTAN PLATA. El candado por pedido limitaba el daño a una guía por
  // pedido, pero "una guía por pedido que alguien de afuera decide cuándo" no
  // es una defensa, es una factura con retraso. Esta función la llama
  // `pay360-webhook` con la service role key; nadie más tiene por qué.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer || bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return json({ error: 'no autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { session_id?: string; retry?: boolean }
  const sessionId = String(body.session_id ?? '')
  if (!sessionId) return json({ error: 'session_id requerido' }, 400)
  // Reintento a mano (vía `order-manage` · retry_shalom): SOLO reabre un
  // expediente FAILED. `CREATED`/`SIMULADO`/`SKIPPED` siguen cerrados — sobre
  // esos, volver a emitir es pagar dos guías o pisar una decisión.
  const reintento = body.retry === true

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
  const expediente = String(session.shalom_order_status ?? '')
  if (expediente && !(reintento && expediente === 'FAILED')) {
    return json({ skipped: `ya procesado (${expediente})` })
  }

  // ─── El candado ────────────────────────────────────────────────────────────
  // Gana una sola llamada. La condición se hace en la base, no acá: dos
  // invocaciones simultáneas no pueden pasar las dos. Un reintento reclama
  // DESDE `FAILED` (y solo desde ahí); la corrida normal, desde el vacío.
  const claim = supabase.from('order_sessions')
    .update({ shalom_order_status: 'PENDING', shalom_order_at: new Date().toISOString() })
    .eq('id', sessionId)
  const { data: claimed } = await (reintento
    ? claim.eq('shalom_order_status', 'FAILED')
    : claim.is('shalom_order_status', null))
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
        .select('shalom_pro_email, shalom_pro_password, shalom_pro_status, shalom_lat_instance_id')
        .eq('store_id', storeId).maybeSingle(),
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
    // La clave de retiro se elige ACÁ y no junto al payload: el mismo código
    // tiene que valer lo emita el titular o la contingencia. Si el titular
    // alcanzó a crear la guía antes de callarse, la clave impresa es esta.
    const pickupCode = nuevoPickupCode()

    /**
     * ─── La CONTINGENCIA: emitir por Shalom LAT ─────────────────────────────
     * Se llama SOLO cuando el titular no responde (red caída, 5xx, catálogo
     * mudo o llave sin configurar). Nunca cuando el titular RECHAZÓ el envío:
     * un 4xx es una respuesta —el payload está mal, o las credenciales—, y
     * repetirlo en el otro proveedor no lo arregla; solo gastaría plata.
     *
     * Devuelve `null` si la contingencia no está disponible (sin llave, sin
     * tamaño configurado): entonces manda el cierre original del titular, que
     * es el que sabe explicar lo que pasó.
     *
     * `reconciliar` es la decisión más delicada: cuando el titular pudo haber
     * creado la orden antes de callarse, LAT mira primero los envíos pendientes
     * de la MISMA cuenta y registra esa en vez de emitir otra. La búsqueda es
     * por DNI —lo único que los dos proveedores nombran igual—, así que un
     * comprador con otro envío pendiente en la cuenta puede confundirla: por eso
     * el aviso a Logística lo dice y pide verificar en pro.shalom.pe. Cuando el
     * titular ni llegó a llamar (sin llave, catálogo mudo) se pasa `false` y no
     * hay ninguna ambigüedad que resolver.
     */
    async function contingencia(
      motivo: string,
      reniecPrevio: { name: string; lastName: string; surName: string } | null,
      reconciliar: boolean,
    ): Promise<Response | null> {
      const keyLat = await shalomLatApiKey()
      if (!keyLat) return null
      // LAT cotiza por el TAMAÑO en texto (no por el id del catálogo, que es lo
      // que el titular no pudo darnos): sin tamaño no hay envío que armar.
      if (!size) return null

      const reniec = reniecPrevio ?? (/^\d{8}$/.test(dni) ? await nombreReniec(dni) : null)
      const datos = {
        apiKey: keyLat,
        storeId,
        storeName: store?.nombre ?? null,
        email,
        password,
        instanceId: secrets?.shalom_lat_instance_id ?? null,
        originTerminalId: String(product?.shalom_origin_branch_id ?? ''),
        destinyTerminalId: destino,
        size,
        dni,
        phone: String(session.buyer_phone ?? buyer?.phone ?? ''),
        reniec,
        pickupCode,
        reconciliarAntes: reconciliar,
      }

      // El interruptor manda igual: con la guía automática apagada no se emite
      // por NINGÚN proveedor. El payload va al log (con la instancia rotulada,
      // porque en el ensayo puede no existir todavía) y el ensayo al chat.
      if (store?.shalom_auto_guide_enabled !== true) {
        const ensayo = buildLatRegisterPayload({
          instanceId: datos.instanceId ?? 'ENSAYO',
          originTerminalId: datos.originTerminalId,
          destinyTerminalId: datos.destinyTerminalId,
          size,
          pickupCode,
          receiver: {
            dni, phone: datos.phone,
            name: reniec?.name ?? null, lastName: reniec?.lastName ?? null, surName: reniec?.surName ?? null,
          },
        })
        console.log('[shalom-order] SIMULADO por contingencia', sessionId, JSON.stringify(ensayo))
        await cerrar(sessionId, 'SIMULADO', `interruptor de guía automática apagado en la marca (${motivo})`,
          { shalom_order_provider: 'LAT' })
        await aLogistica(sessionId,
          '🧪 Ensayo de guía automática por la vía de contingencia: el proveedor de siempre no respondió, '
          + 'el envío se armó completo con el otro y NO se emitió (la marca tiene apagada la guía automática). '
          + 'Registra la guía a mano cuando despaches.')
        return json({ simulado: true, proveedor: 'LAT' })
      }

      console.warn('[shalom-order] va por contingencia LAT', sessionId, motivo)
      const r = await emitirGuiaLat(datos)

      if (r.ok) {
        const aviso = r.yaExistia
          ? '📦 Guía recuperada por la vía de contingencia: el proveedor de siempre no respondió y el envío YA existía '
            + 'en la cuenta Shalom Pro de la marca, así que se registró ese en vez de emitir otro. '
            + 'Verifica en pro.shalom.pe que la guía corresponda a este pedido.'
          : '📦 Guía generada por la vía de contingencia (el proveedor de siempre no respondió). '
            + 'El comprador ya la tiene en su chat.'
        return await guardar(r.guia, pickupCode, null, 'LAT', aviso)
      }

      if (r.clase === 'config' && r.motivo.includes('credenciales')) {
        await credencialesRechazadas()
        return json({ error: 'credenciales rechazadas' }, 502)
      }
      if (r.clase === 'config') {
        await cerrar(sessionId, 'SKIPPED', r.motivo, { shalom_order_provider: 'LAT' })
        await aLogistica(sessionId,
          `📦 Guía automática no generada — falta: ${(r.faltan ?? []).join(', ') || r.motivo}. `
          + 'Registra la guía a mano cuando despaches (el envío del producto se completa en Productos → el producto → Envío).')
        return json({ skipped: 'faltan datos', proveedor: 'LAT', faltan: r.faltan })
      }

      await cerrar(sessionId, 'FAILED', `${motivo}; ${r.motivo}`, { shalom_order_provider: 'LAT' })
      await aLogistica(sessionId, r.incierto
        ? '⚠️ Guía automática sin confirmar: ninguno de los dos proveedores de envío respondió y tampoco pudimos '
          + 'verificar si el envío llegó a crearse. ANTES de emitir otra, revísalo en pro.shalom.pe — puede existir. '
          + 'Si existe, regístrala acá con el botón de siempre.'
        : '📦 Guía automática no generada — ninguno de los dos proveedores de envío pudo emitirla. '
          + 'Regístrala a mano cuando despaches; el detalle quedó en los logs de Kross.')
      return json({ error: 'contingencia falló', proveedor: 'LAT' }, 502)
    }

    const key = await shalomApiKey()
    if (!key) {
      // El titular no está configurado: la contingencia no necesita su llave.
      console.error('[shalom-order] sin SHALOM_API_KEY', sessionId)
      const porLat = await contingencia('el titular no tiene llave configurada', null, false)
      if (porLat) return porLat
      await cerrar(sessionId, 'FAILED', 'sin llave de la API de envíos')
      await aLogistica(sessionId, '📦 Guía automática no generada — problema de configuración de Kross. Regístrala a mano y avisa al equipo.')
      return json({ error: 'sin api key' }, 500)
    }
    const auth = {
      'X-API-Key': key,
      'X-Shalom-Email': email,
      'X-Shalom-Password': password,
    }

    // ─── Lo que hay que resolver contra el proveedor ─────────────────────────
    // El producto (su id es POR CUENTA) y la persona (para no chocar con el 409
    // por documento ya registrado).
    //
    // SECUENCIAL, no en paralelo. La conexión con Shalom se reutiliza entre
    // endpoints —lo dice su doc— pero solo si YA existe: dos llamadas al mismo
    // tiempo con la sesión fría disparan dos logins simultáneos de ~90 s contra
    // la misma cuenta, y el proveedor no sirve a los dos. Pasó en producción: el
    // mismo pedido resolvió el catálogo en un intento y no en el siguiente.
    // La primera llamada paga el login; la segunda entra caliente.
    let productos = size ? await llamar('catalogo.leer', sessionId, `${SHALOM_API_BASE}/v1/products`, { headers: auth }) : null
    // Leer el catálogo no cuesta ni cambia nada, así que un tropiezo no puede
    // costar una guía: se reintenta una vez, ya con la sesión establecida.
    if (size && productos && !productos.ok && productos.status !== 401) {
      console.error('[shalom-order] catálogo falló, reintentando', sessionId, productos.status)
      productos = await llamar('catalogo.leer', sessionId, `${SHALOM_API_BASE}/v1/products`, { headers: auth })
    }
    if (size && !productos) {
      console.error('[shalom-order] catálogo sin respuesta, reintentando', sessionId)
      productos = await llamar('catalogo.leer', sessionId, `${SHALOM_API_BASE}/v1/products`, { headers: auth })
    }

    const persona = /^\d{8}$/.test(dni)
      ? await llamar('persona.buscar', sessionId, `${SHALOM_API_BASE}/v1/persons/search?document=${dni}&type=DNI`, { headers: auth })
      : null

    if (productos?.status === 401 || persona?.status === 401) {
      await credencialesRechazadas()
      return json({ error: 'credenciales rechazadas' }, 502)
    }

    const catalogo = productos?.ok ? await leerJson(productos) : null
    const productId = catalogo && size ? resolveProductId(catalogo, size) : null
    // El tamaño está configurado pero no se pudo resolver. Son dos problemas
    // distintos y se arreglan en lugares distintos: uno se espera, el otro se
    // corrige en el producto. Decirlos con la misma frase manda a Logística a
    // completar un campo que ya estaba lleno.
    if (size && !productId) {
      const sinRespuesta = !productos?.ok
      // Que el titular no conteste su catálogo es exactamente el caso que la
      // contingencia resuelve: LAT manda el tamaño como texto, sin catálogo.
      if (sinRespuesta) {
        const porLat = await contingencia('el catálogo del titular no respondió', null, false)
        if (porLat) return porLat
      }
      await cerrar(sessionId, 'SKIPPED', sinRespuesta
        ? 'el catálogo de Shalom no respondió'
        : `la cuenta Shalom Pro no ofrece el tamaño ${size}`)
      await aLogistica(sessionId, sinRespuesta
        ? '📦 Guía automática no generada — Shalom no respondió al pedirle su catálogo de paquetes. '
          + 'Es del proveedor, no del pedido: registra la guía a mano y el siguiente pedido lo reintenta solo.'
        : `📦 Guía automática no generada — la cuenta Shalom Pro de la marca no ofrece el tamaño "${size}". `
          + 'Elige otro en Productos → el producto → Envío, y registra esta guía a mano.')
      return json({ skipped: sinRespuesta ? 'el catálogo no respondió' : 'tamaño fuera del catálogo de la cuenta' })
    }
    // 404 = la persona no está registrada en la cuenta: hay que mandar sus
    // nombres. Cualquier otra cosa (500, timeout) se trata igual: sin id.
    const personId = persona?.ok
      ? Number((await leerJson(persona) as { id?: unknown })?.id) || null
      : null
    const reniec = personId ? null : (/^\d{8}$/.test(dni) ? await nombreReniec(dni) : null)

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
    const post = () => llamar('guia.emitir', sessionId, `${SHALOM_API_BASE}/v1/orders`, {
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
      const p = await llamar('persona.buscar', sessionId, `${SHALOM_API_BASE}/v1/persons/search?document=${dni}&type=DNI`, { headers: auth })
      const id = p?.ok ? Number((await leerJson(p) as { id?: unknown })?.id) || null : null
      if (id) {
        const receiver = armado.body.receiver as Record<string, unknown>
        armado.body.receiver = { id, document_type: receiver.document_type, document: receiver.document, phone: receiver.phone }
        res = await post()
        if (!res) return await reconciliar()
      }
    }

    // ─── Reintentos automáticos, solo donde reintentar tiene sentido ─────────
    // Un error DEL SERVIDOR (5xx) se reintenta solo, hasta 3 INTENTOS EN TOTAL
    // — pero nunca a ciegas: no hay clave de idempotencia, así que antes de
    // cada re-emisión se pregunta si la orden ya existe (la misma consulta de
    // `reconciliar`; un 500 no promete que no se creó). El backoff (2 s, 4 s)
    // le da aire al proveedor. Un rechazo 4xx NO se reintenta: repetir lo
    // inválido no lo vuelve válido — eso cierra en FAILED y el panel ofrece
    // corregir y reintentar a mano (`retry_shalom`).
    let intentos = 1
    while (!res.ok && res.status >= 500 && intentos < 3) {
      console.warn('[shalom-order] error del proveedor', sessionId, res.status, `intento ${intentos}`)
      const r = await llamar('guia.reconciliar', sessionId, `${SHALOM_API_BASE}/v1/orders?page=1&per_page=20`, { headers: auth })
      const encontrada = r?.ok ? buscarOrdenPorDni(await leerJson(r), dni) : null
      if (encontrada) {
        console.log('[shalom-order] la orden sí existía pese al error', sessionId, encontrada.numero)
        return await guardar(encontrada, pickupCode, encontrada.orderId)
      }
      await new Promise(listo => setTimeout(listo, 2000 * intentos))
      const otra = await post()
      if (!otra) return await reconciliar()
      res = otra
      intentos++
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
      // Solo el 5xx pasa a la contingencia: el titular se cayó, no rechazó. Un
      // 4xx es una respuesta —payload inválido— y repetirla en el otro
      // proveedor gastaría plata sin arreglar nada. Va con `reconciliar: true`
      // porque un 500 no promete que la orden no se haya creado.
      if (res.status >= 500) {
        const porLat = await contingencia(`el titular falló (${res.status}) tras ${intentos} intentos`, reniec, true)
        if (porLat) return porLat
      }
      await cerrar(sessionId, 'FAILED', res.status >= 500
        ? `el proveedor falló (${res.status}) tras ${intentos} intentos`
        : `el proveedor rechazó el envío (${res.status})`)
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
      const r = await llamar('guia.reconciliar', sessionId, `${SHALOM_API_BASE}/v1/orders?page=1&per_page=20`, { headers: auth })
      const encontrada = r?.ok ? buscarOrdenPorDni(await leerJson(r), dni) : null
      if (encontrada) {
        console.log('[shalom-order] reconciliada tras timeout', sessionId, encontrada.numero)
        return await guardar(encontrada, pickupCode, encontrada.orderId)
      }
      // El titular no contestó y su propia reconciliación tampoco: la
      // contingencia vuelve a preguntar por la MISMA cuenta (sus pendientes ven
      // lo que el titular haya creado) y, si de verdad no hay nada, emite.
      const porLat = await contingencia('el titular no respondió', reniec, true)
      if (porLat) return porLat
      await cerrar(sessionId, 'FAILED', 'el proveedor no respondió')
      await aLogistica(sessionId,
        '⚠️ Guía automática sin confirmar: Shalom no respondió y tampoco pudimos verificar si el envío '
        + 'llegó a crearse. ANTES de emitir otra, revísalo en pro.shalom.pe — puede existir. '
        + 'Si existe, registra esa guía acá con el botón de siempre.')
      return json({ error: 'sin respuesta' }, 502)
    }

    /**
     * La GUÍA FORMAL de Shalom, en PDF, para el botón del chat.
     *
     * `GET /v1/orders/{ose_id}/voucher` la devuelve como BINARIO —no hay URL
     * que guardar—, así que se descarga una vez y se sube a Storage
     * (`shalom-guias`, bucket público): el mensaje del chat lleva esa URL y el
     * comprador abre el documento de Shalom de verdad, no una hoja nuestra.
     * Si el voucher no está, se intenta el rótulo (`/label`), mismo contrato.
     *
     * Best-effort con timeout PROPIO (30 s, no los 145 s del login): un PDF que
     * no baja jamás retrasa ni tumba el registro de la guía — sin él, el botón
     * abre la hoja de guía de la app, que es el respaldo de siempre.
     */
    async function guardarPdfDeGuia(oseId: string | null, numero: string | null): Promise<string | null> {
      if (!oseId) return null
      try {
        for (const doc of ['voucher', 'label']) {
          const ctrl = new AbortController()
          const t = setTimeout(() => ctrl.abort(), 30_000)
          const r = await fetch(`${SHALOM_API_BASE}/v1/orders/${oseId}/${doc}`, { headers: auth, signal: ctrl.signal })
            .catch(() => null)
          clearTimeout(t)
          if (!r?.ok || !(r.headers.get('content-type') ?? '').includes('pdf')) {
            // Best-effort, pero anotado: un voucher que no baja es de las cosas
            // que solo se notan cuando el comprador dice "no me abre el botón".
            await anotar({
              proveedor: 'SHALOM_PE', op: `guia.${doc}`, sessionId,
              outcome: r ? (r.status >= 500 ? 'FALLO' : 'RECHAZO') : 'SIN_RESPUESTA',
              httpStatus: r?.status ?? null,
              detail: r ? `content-type ${r.headers.get('content-type') ?? '—'}` : 'sin respuesta',
            })
            continue
          }
          const bytes = new Uint8Array(await r.arrayBuffer())
          if (bytes.length === 0) continue
          const path = `${sessionId}/${numero ?? oseId}.pdf`
          const up = await supabase.storage.from('shalom-guias')
            .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
          if (up.error) {
            console.error('[shalom-order] no se pudo subir el PDF de la guía', up.error.message)
            return null
          }
          return supabase.storage.from('shalom-guias').getPublicUrl(path).data.publicUrl
        }
      } catch (e) {
        console.error('[shalom-order] PDF de la guía no descargado', String(e).slice(0, 200))
      }
      return null
    }

    /** Escribe la guía en el pedido. La clave de retiro se guarda en la fila y
     *  NO viaja a ningún chat: en Kross se entrega contra el saldo pagado. */
    async function guardar(
      guia: ReturnType<typeof parseOrderResponse>,
      code: string,
      orderId: string | null = null,
      /** Quién la emitió: el titular (Shalom PE) o la contingencia (Shalom LAT).
       *  Queda en el expediente porque es lo primero que se pregunta cuando una
       *  guía sale distinta a las demás. */
      proveedor: 'PE' | 'LAT' = 'PE',
      /** El aviso a Logística, si esta vía tiene el suyo. */
      aviso: string | null = null,
    ): Promise<Response> {
      const extra = { shalom_pickup_code: code, shalom_order_id: orderId, shalom_order_provider: proveedor }
      const emisor = proveedor === 'PE' ? 'Shalom' : 'Shalom (vía de contingencia)'

      if (!esRastreable(guia)) {
        console.error('[shalom-order] respuesta sin guía rastreable', sessionId)
        await cerrar(sessionId, 'CREATED', 'guía emitida, sin datos rastreables en la respuesta', extra)
        await aLogistica(sessionId,
          `⚠️ El envío se creó en ${emisor} pero la respuesta no trajo la guía. `
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
          `⚠️ El envío se creó en ${emisor} pero su guía no tiene el formato esperado. `
          + 'Regístrala a mano desde el comprobante — NO generes otra.')
        return json({ created: true, formatoRaro: true })
      }

      // `yaSuscrito`: la orden del titular se creó con `track: true`, así que su
      // webhook ya la está mirando — no se gasta otra request en suscribirla. La
      // de la contingencia NO nace suscrita: `registrarGuia` la suscribe como a
      // cualquier guía registrada a mano. Y el PDF de la guía viaja con el mensaje: es el botón "Ver mi guía de Shalom" — la
      // guía FORMAL de Shalom, descargada del voucher y guardada en Storage
      // (si la respuesta trajera una URL directa, esa gana: cero descargas).
      const pdfUrl = guia.pdfUrl ?? await guardarPdfDeGuia(guia.oseId, guia.numero)
      // La clave recién elegida viaja con la sesión: si el pedido ya quedó sin
      // saldo (pagó el total), `registrarGuia` la entrega junto con la guía —la
      // fila de la base todavía no la tiene, la escribe `cerrar` después.
      const reg = await registrarGuia({ ...session, shalom_pickup_code: code }, g, { yaSuscrito: proveedor === 'PE', pdfUrl })
      await cerrar(sessionId, 'CREATED', reg.ok ? null : 'guía emitida, no se pudo escribir en el pedido', extra)
      if (!reg.ok) {
        console.error('[shalom-order] no se pudo escribir la guía en el pedido', sessionId, reg.error)
        await aLogistica(sessionId, `⚠️ El envío se creó en ${emisor} pero no se pudo escribir en el pedido. Regístralo a mano — NO generes otro.`)
        return json({ created: true, guardado: false }, 500)
      }

      const cabecera = aviso
        ?? '📦 Guía generada automáticamente en Shalom. El comprador ya la tiene en su chat.'
      // Una guía emitida es plata gastada: se anota SIEMPRE, salga bien o mal, y
      // por eso este `OK` no es ruido como el de una consulta cualquiera.
      await anotar({
        proveedor: proveedor === 'PE' ? 'SHALOM_PE' : 'SHALOM_LAT',
        op: 'guia.emitir', outcome: 'OK', sessionId, storeId,
        detail: `guía ${g.ids}`,
      })
      await aLogistica(sessionId,
        `${cabecera} Guía: ${g.ids}. `
        + 'Su clave de retiro quedó guardada en el pedido y el chat se la entrega solo contra el saldo pagado.')
      return json({ created: true, proveedor, tracking: g.tracking })
    }
  }
})
