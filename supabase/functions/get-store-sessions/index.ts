import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-store-id, x-seller-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const storeId = req.headers.get('x-store-id')
  const sellerId = req.headers.get('x-seller-id')
  const includeCancelled = req.headers.get('x-include-cancelled') === '1'
  if (!storeId) return new Response('Missing store id', { status: 400, headers: corsHeaders })

  // El bloque geográfico y de pago (dispatch_type … tracking_phase) alimenta el
  // mapa de pedidos en vivo: de dónde sale el paquete, a dónde va, cómo va el
  // dinero y qué reporta el courier. No agrega datos personales — el nombre y
  // el teléfono del comprador ya viajaban en esta misma respuesta.
  //
  // El DNI (`buyers.document_number`) se agrega DESPUÉS, en su propia consulta —
  // ver abajo—. Entra por una razón concreta: el buscador del panel. El DNI es
  // la identidad del comprador en Kross —un mismo número junta sus pedidos
  // aunque cambie de teléfono— y es lo que alguien dicta cuando reclama. Va a
  // la MISMA puerta que ya cruzaban su nombre y su teléfono, no a una nueva.
  // ⚠️ Orden de despliegue: `saldo_amount` y `saldo_verification` son del bloque
  // §31 del esquema. PostgREST rechaza el select ENTERO si una sola columna no
  // existe, así que subir esta función antes de correr el SQL deja el tablero en
  // blanco — el mismo golpe que el DNI. Primero el SQL, después la función.
  let query = supabase
    .from('order_sessions')
    .select(`
      id, order_id, store_id, token, buyer_id, buyer_name, buyer_phone,
      product_id, product_name, product_price, pack_name, status, stage, nota,
      dispatch_type, agency_name, agency_branch_id, delivery_reference,
      address, address_lat, address_lng,
      advance_amount, payment_verification, saldo_amount, saldo_verification,
      tracking_courier, tracking_numero, tracking_phase, tracking_phase_at, tracking_demora_at,
      shalom_order_status, shalom_order_reason,
      assigned_seller_id, involved_seller_ids, writer_seller_ids, seller_name, seller_role, created_at,
      answered_at,
      chat_messages ( id, sender_role, sender_name, type, body, visibility, mentions, created_at, read_at )
    `)
    .in('status', includeCancelled ? ['active', 'cancelado', 'anulado'] : ['active'])
    .order('created_at', { ascending: false })
    // 500 y no 80 (28-ago-2026). Con 80 el panel enseñaba una rebanada sin
    // decirlo: una tienda que despacha cien al día perdía de vista lo de
    // anteayer, y el filtro de "30 días" contaba sobre lo que había llegado, no
    // sobre lo que hay. Ese es el costo caro — el `limit` se aplica ANTES de
    // filtrar por estado, así que cortar bajo también decide QUÉ entra.
    //
    // 500 filas con su chat son unos cuantos cientos de kilobytes: caro para
    // pedirlo en cada pantalla, barato una vez cada carga. Cuando una marca lo
    // pase de largo, lo que toca no es subirlo otra vez — es paginar en el
    // servidor con un cursor por `created_at`.
    .limit(500)

  // A specific agent → every order they're involved in, regardless of the
  // store_id label (orders and sellers can carry different store ids).
  // The admin (no seller filter) → all active orders in their store.
  if (sellerId) {
    query = query.contains('involved_seller_ids', [sellerId])
  } else {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ─── Los cobros de cada pedido (bloque §36) ────────────────────────────────
  //
  // En UNA consulta para todo el lote y no un `select` anidado: son hasta 500
  // pedidos, y una consulta por pedido convertiría el tablero en 500 viajes.
  //
  // ⚠️ Si la tabla todavía no existe en este proyecto, esto NO tumba el tablero:
  // se sigue sin la lista y el panel cae en las columnas de siempre. Es la misma
  // regla que el resto de la mudanza — nadie se queda sin pedidos por una tabla
  // que falta.
  const filas = (data ?? []) as { id: string }[]
  if (filas.length > 0) {
    const { data: cobros } = await supabase.from('cobros')
      .select('id, session_id, tipo, monto, estado, matched_at, pay360_coupon_id, pay360_consumer_code, coupon_expires_at, concepto, created_by, created_at')
      .in('session_id', filas.map(f => f.id))
      .order('created_at', { ascending: true })
    if (cobros) {
      const porPedido = new Map<string, unknown[]>()
      for (const c of cobros as { session_id: string }[]) {
        const lista = porPedido.get(c.session_id) ?? []
        lista.push(c)
        porPedido.set(c.session_id, lista)
      }
      for (const f of filas as Record<string, unknown>[]) {
        // Solo si HAY filas. Poner `[]` haría que el panel leyera de la lista
        // y diera el pedido por no cobrado; sin nada, cae a las columnas.
        const suyos = porPedido.get(f.id as string)
        if (suyos?.length) f.cobros = suyos
      }
    }
  }

  // ─── El DNI de cada comprador ──────────────────────────────────────────────
  //
  // En una consulta aparte y no embebido (`buyers ( document_number )`), aunque
  // el embebido sería una línea: PostgREST lo resuelve por la CLAVE FORÁNEA, y
  // la de `order_sessions.buyer_id` se creó con
  // `ADD COLUMN IF NOT EXISTS ... REFERENCES` — que no hace nada si la columna
  // ya existía. O sea que no hay manera de saber desde acá si en producción
  // existe. Si no existiera, el embebido devolvería 400 y **el panel entero se
  // quedaría sin pedidos** por querer enseñar un DNI. Un `IN` sobre ochenta ids
  // no depende de ninguna constraint y cuesta una consulta.
  //
  // Un fallo acá NO tumba la respuesta: se devuelven los pedidos sin DNI y lo
  // único que se pierde es poder buscar por él.
  const filas = Array.isArray(data) ? data : []
  const ids = [...new Set(filas.map(f => f.buyer_id).filter(Boolean))]
  let docPorComprador: Record<string, string | null> = {}
  if (ids.length) {
    const { data: compradores } = await supabase
      .from('buyers').select('id, document_number').in('id', ids)
    docPorComprador = Object.fromEntries((compradores ?? []).map(b => [b.id, b.document_number ?? null]))
  }

  const conDoc = filas.map(f => ({
    ...f,
    buyers: f.buyer_id ? { document_number: docPorComprador[f.buyer_id] ?? null } : null,
  }))

  return new Response(JSON.stringify(conDoc), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
