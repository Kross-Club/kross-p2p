// ─── KROSS FORM · El pedido que entra desde la página de otro ────────────────
//
// Hermana de `web-order` y de `register-buyer`, y distinta de las dos en lo que
// la define: esta función la llama un `<script>` que corre en un dominio que no
// es nuestro. Ver `docs/18-KROSS-FORM.md`.
//
// Lo que NO hace, y es a propósito (§8 del doc): no asigna vendedor, no abre
// chat, no manda push ni mensaje de bienvenida, no emite boleta ni guía. El
// pedido llega al WhatsApp de la tienda y el vendedor coordina desde ahí. Todo
// eso se puede agregar después; meterlo ahora sería estrenar el embed con la
// mitad de la PWA colgando de él.
//
// Reglas que no se negocian:
//   · **El CORS es la puerta.** `Access-Control-Allow-Origin` devuelve el
//     origen EXACTO que preguntó, nunca `*`: por acá viajan el nombre, el
//     teléfono y el documento del comprador.
//   · **La `public_key` no autoriza.** Viaja en el HTML de la página del
//     comerciante, a la vista de cualquiera. Lo que autoriza es el `Origin`
//     contra `embed_keys.dominios_permitidos`.
//   · **El precio no viene del navegador. Ni el adelanto.** Esta función no
//     acepta un campo de precio: lo lee del producto, y el adelanto lo deriva
//     `adelantoDelPedido()` con la escalera de §5.a.
//   · **El producto tiene que ser de la tienda de la llave.** Sin ese filtro,
//     la llave de una marca podría cerrar un pedido del producto de otra.
//
// Deploy: supabase functions deploy embed-order --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
//   (lo llama el navegador de un comprador, sin sesión de Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { adelantoDelPedido, adelantoFromPacks, priceFromPacks } from '../_shared/advance.ts'
import { dominioPermitido, mensajeWhatsApp, urlWhatsApp } from '../_shared/kross-form.ts'
import { rielPara, type Proveedor } from '../_shared/comision.ts'
import { imagenDelPack } from '../_shared/packs.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Los cuatro destinos válidos. Lista blanca, no passthrough: este campo decide
 *  si el pedido cobra adelanto (§5.a) y de qué piscina de logística sale. */
const DISPATCH = ['MOTORIZADO_LIMA', 'MOTORIZADO_PROVINCIA', 'AGENCIA_PROVINCIA', 'AGENCIA_LIMA']

/** Cómo se lee cada destino en el mensaje de WhatsApp. */
const DESTINO_EN_PALABRAS: Record<string, string> = {
  MOTORIZADO_LIMA: 'Lima o Callao · a domicilio',
  AGENCIA_LIMA: 'Lima o Callao · recojo en agencia',
  MOTORIZADO_PROVINCIA: 'Provincia · a domicilio',
  AGENCIA_PROVINCIA: 'Provincia · recojo en agencia',
}

/**
 * Las cabeceras de CORS para este `Origin`.
 *
 * `Vary: Origin` no es decorativo: sin él, un intermediario puede servirle a
 * una tienda la respuesta cacheada de otra, con el `Allow-Origin` equivocado.
 */
const cors = (origen: string) => ({
  'Access-Control-Allow-Origin': origen || 'null',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '7200',
  'Vary': 'Origin',
})

const json = (body: unknown, status: number, origen: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origen), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Texto recortado a `max`, o null si viene vacío. */
const clamp = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

function randomToken() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24)
}

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? ''

  // El preflight NO es la puerta: el navegador lo manda sin cuerpo, así que
  // acá todavía no se sabe qué llave pregunta. Se contesta y la decisión de
  // verdad la toma el POST, que sí trae la llave.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origen) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origen)

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origen)
  }

  const publicKey = clamp(body.public_key, 64)
  if (!publicKey) return json({ error: 'public_key requerida' }, 400, origen)

  const { data: llave } = await supabase.from('embed_keys')
    .select('public_key, store_id, dominios_permitidos, whatsapp, activo')
    .eq('public_key', publicKey).maybeSingle()

  // Una llave que no existe y una apagada contestan IGUAL: quien prueba llaves
  // al azar no aprende de la respuesta cuáles existen.
  if (!llave?.activo) return json({ error: 'Formulario no disponible' }, 403, origen)

  // ─── La puerta ─────────────────────────────────────────────────────────────
  // El 403 sale CON las cabeceras de CORS del origen que preguntó, a propósito:
  // sin ellas el navegador esconde la respuesta y el comerciante ve un error
  // opaco al instalar el formulario. Lo que se le entrega es el mensaje de que
  // su dominio no está en la lista — nada sobre la tienda ni sus pedidos.
  if (!dominioPermitido(origen, llave.dominios_permitidos)) {
    console.warn('[embed-order] origen fuera de la allowlist', JSON.stringify({
      public_key: publicKey, origen,
    }))
    return json({ error: 'Este dominio no está autorizado para usar el formulario.' }, 403, origen)
  }

  const storeId = String(llave.store_id)

  // ─── Idempotencia ──────────────────────────────────────────────────────────
  // Igual que en `register-buyer`: un doble tap con 4G lenta manda dos veces, y
  // el uuid nace al abrir el formulario, así que los dos envíos traen el mismo.
  const checkoutId = clamp(body.checkout_id, 64)
  if (checkoutId) {
    const { data: previo } = await supabase.from('order_sessions')
      .select('id, order_id, token, advance_amount')
      .eq('checkout_id', checkoutId).maybeSingle()
    if (previo) {
      return json({
        order_id: previo.order_id, token: previo.token,
        adelanto: Number(previo.advance_amount ?? 0),
        idempotent: true,
      }, 200, origen)
    }
  }

  // ─── Lo que el comprador escribió ──────────────────────────────────────────
  const nombre = clamp(body.buyer_name, 120)
  const telefono = String(body.buyer_phone ?? '').replace(/\D/g, '').slice(0, 15)
  const documento = String(body.document_number ?? '').replace(/\D/g, '').slice(0, 12) || null
  const dispatchType = DISPATCH.includes(String(body.dispatch_type ?? '')) ? String(body.dispatch_type) : null
  const productId = clamp(body.product_id, 64)
  const packName = clamp(body.pack_name, 120)

  if (!nombre) return json({ error: 'Escribe tu nombre.' }, 400, origen)
  if (telefono.length < 9) return json({ error: 'Escribe un celular válido.' }, 400, origen)
  if (!dispatchType) return json({ error: 'Elige cómo quieres recibirlo.' }, 400, origen)
  if (!productId) return json({ error: 'product_id requerido' }, 400, origen)

  // ─── El producto, y que sea de ESTA tienda ─────────────────────────────────
  // El `.eq('store_id')` es la mitad del filtro que importa: sin él, la llave
  // de una marca cierra pedidos del producto de otra —con el precio de otra y
  // el dinero cayendo en la cuenta de otra—.
  const { data: prod } = await supabase.from('products')
    .select('id, nombre, precio, packs, images, active, permite_mitad, cobra_completo')
    .eq('id', productId).eq('store_id', storeId).maybeSingle()
  if (!prod?.active) return json({ error: 'Este producto ya no está disponible.' }, 400, origen)

  // ─── El precio: del producto, nunca del cuerpo ─────────────────────────────
  // Esta función no acepta un campo de precio. Con pack, el del pack; sin pack,
  // el del producto. Si el pack que mandan no existe, es un formulario
  // desalineado con el catálogo y se corta: cobrar un precio que nadie
  // configuró es peor que perder la venta.
  // El segundo argumento de `priceFromPacks` es el precio DECLARADO por el
  // navegador, y acá no hay ninguno: va `NaN` para que el camino de respaldo
  // —"vale si coincide con alguno de los packs"— no pueda emparejar nunca. El
  // único que resuelve es el del NOMBRE del pack.
  const precio = packName
    ? priceFromPacks(prod.packs, Number.NaN, packName)
    : (Number(prod.precio) > 0 ? Number(prod.precio) : null)
  if (precio === null) {
    console.warn('[embed-order] pack sin precio verificable', JSON.stringify({
      product_id: productId, pack: packName, store_id: storeId,
    }))
    return json({ error: 'Esa opción ya no está disponible. Recarga la página.' }, 400, origen)
  }

  // ─── El adelanto: la escalera de §5.a, entera en el servidor ───────────────
  const adelanto = adelantoDelPedido({
    precioPack: precio,
    adelantoPen: adelantoFromPacks(prod.packs, packName),
    dispatchType,
    cobraCompleto: prod.cobra_completo === true,
    permiteMitad: prod.permite_mitad === true,
  })

  // ─── El riel ───────────────────────────────────────────────────────────────
  // Misma regla que `register-buyer`: el servidor decide contra los rieles que
  // la tienda tiene encendidos, y nunca uno dormido.
  let paymentProvider: Proveedor | null = null
  if (adelanto > 0) {
    const { data: rieles } = await supabase.from('stores')
      .select('pay360_enabled, flow_enabled').eq('id', storeId).maybeSingle()
    const habilitados: Proveedor[] = [
      ...(rieles?.pay360_enabled ? ['360PAY' as const] : []),
      ...(rieles?.flow_enabled ? ['FLOW' as const] : []),
    ]
    // Solo FLOW. `pay360-coupon` re-deriva el adelanto con la línea vieja
    // —`advanceForServer(precio, advance_choice)`— y para un pedido del embed
    // eso da el precio entero: cobraría de más. Mientras 360pay no aprenda la
    // escalera de §5.a, un pedido que rutearía ahí entra contraentrega.
    const ruteado = rielPara(adelanto, habilitados)
    paymentProvider = ruteado === 'FLOW' ? 'FLOW' : null
    // Un adelanto que no tiene por dónde cobrarse no se promete: el pedido
    // entra contraentrega y el vendedor lo coordina por WhatsApp, que es
    // exactamente lo que este formulario hace con Lima.
    if (!paymentProvider) {
      console.warn('[embed-order] adelanto sin riel utilizable; entra contraentrega', JSON.stringify({
        store_id: storeId, adelanto, ruteado,
      }))
    }
  }
  const adelantoCobrable = paymentProvider ? adelanto : 0

  // ─── El comprador ──────────────────────────────────────────────────────────
  // Por teléfono, que es lo único que el formulario pide siempre. El documento
  // se escribe si vino; si choca con otra fila que ya lo tiene, se guarda el
  // comprador sin él en vez de tumbar la venta por un dato opcional.
  const perfil = { store_id: storeId, phone: telefono, nombre, ...(documento ? { document_number: documento } : {}) }
  let { data: buyer } = await supabase.from('buyers')
    .upsert(perfil, { onConflict: 'store_id,phone', ignoreDuplicates: false })
    .select('id').single()
  if (!buyer && documento) {
    const reintento = await supabase.from('buyers')
      .upsert({ store_id: storeId, phone: telefono, nombre }, { onConflict: 'store_id,phone', ignoreDuplicates: false })
      .select('id').single()
    buyer = reintento.data
  }
  if (!buyer) return json({ error: 'No pudimos registrar tu pedido. Reintenta.' }, 500, origen)

  const token = randomToken()
  const orderId = `ORD-${Date.now()}`
  const direccion = clamp(body.address, 300)

  const { data: pedido, error } = await supabase.from('order_sessions').insert({
    order_id: orderId,
    store_id: storeId,
    // La tienda del PRODUCTO, que acá es la misma: la config de cobro se
    // resuelve por esta columna y el invariante queda escrito en la fila.
    origin_store_id: storeId,
    token,
    embed_key: publicKey,
    buyer_id: buyer.id,
    buyer_name: nombre,
    buyer_phone: telefono,
    address: direccion,
    product_id: prod.id,
    product_name: prod.nombre,
    product_price: precio,
    pack_name: packName,
    items: [{
      product_id: prod.id, nombre: prod.nombre, precio, unit_price: precio, qty: 1,
      pack_name: packName, image: imagenDelPack(prod.packs, packName, prod.images),
    }],
    status: 'active',
    // Con adelanto arranca en `validando` —el comprador está por pagar—; sin
    // él no hay nada que validar y el pedido nace confirmado.
    stage: adelantoCobrable > 0 ? 'validando' : 'confirmado',
    payment_method: adelantoCobrable > 0 ? 'YAPE_PLIN' : 'CONTRAENTREGA',
    payment_provider: paymentProvider,
    closed_by: 'DIRECT_CHECKOUT',
    dispatch_type: dispatchType,
    delivery_reference: clamp(body.delivery_reference, 300),
    advance_amount: adelantoCobrable,
    // FULL o HALF no describen un monto por pack. Se guarda FULL —el default
    // del esquema desde §56— y el monto real vive en `advance_amount`, que es
    // de donde `flow-order` lo re-deriva.
    advance_choice: 'FULL',
    payment_verification: adelantoCobrable > 0 ? 'PENDING' : 'NOT_REQUIRED',
    ad_fbp: clamp(body.ad_fbp, 255),
    ad_fbc: clamp(body.ad_fbc, 255),
    ad_ttp: clamp(body.ad_ttp, 255),
    ad_ttclid: clamp(body.ad_ttclid, 255),
    ad_client_ua: req.headers.get('user-agent'),
    ad_client_ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    ad_source_url: clamp(body.ad_source_url, 500),
    checkout_id: checkoutId,
  }).select('id').single()

  if (error || !pedido) {
    console.error('[embed-order] no se pudo crear el pedido', error?.message)
    return json({ error: 'No pudimos registrar tu pedido. Reintenta.' }, 500, origen)
  }

  // ─── A dónde va el comprador ───────────────────────────────────────────────
  // Sin adelanto se va a WhatsApp ahora mismo. Con adelanto, primero paga: el
  // script llama a `flow-order` con este `token` y es `flow-return` quien lo
  // manda a WhatsApp con el pago ya confirmado (§7 del doc).
  const whatsapp = adelantoCobrable > 0 ? null : urlWhatsApp(llave.whatsapp, mensajeWhatsApp({
    orderId,
    producto: prod.nombre,
    pack: packName,
    nombre,
    telefono,
    destino: DESTINO_EN_PALABRAS[dispatchType] ?? dispatchType,
    direccion,
    total: precio,
    adelanto: 0,
  }))

  return json({
    order_id: orderId,
    token,
    adelanto: adelantoCobrable,
    whatsapp_url: whatsapp,
  }, 200, origen)
})
