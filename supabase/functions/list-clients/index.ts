import { createClient } from 'npm:@supabase/supabase-js@2'
import { agregarPorComprador, segmentoDe, ventanasDe } from '../_shared/clientes.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// ─── Los CLIENTES de una tienda ──────────────────────────────────────────────
//
// El panel podía ver el contacto de un comprador dentro de un pedido, pero no a
// la PERSONA: ninguna pantalla respondía "¿este señor ya me compró antes?", que
// es lo que decide si se le despacha sin adelanto (11-RELACIONES).
//
// Sin `buyer_id` devuelve la lista; con él, la ficha de uno con sus pedidos.
//
// SOLO ADMIN: `buyers` guarda DNI y teléfono, y la tabla tiene RLS justamente
// para que nadie la lea desde el cliente. Misma puerta que `get-recordings`.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as {
    admin_auth_id?: string; store_id?: string; buyer_id?: string
  }
  if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id')
    .eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // Un admin de tienda solo ve la suya; el super admin puede apuntar a la que
  // entró. Nunca se confía en el `store_id` del body para un admin normal.
  const storeId = (me.is_super_admin && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  const { data: store } = await supabase
    .from('stores').select('restock_days, winback_days').eq('id', storeId).maybeSingle()
  const { restockDias, winbackDias } = ventanasDe(store)
  const ahora = Date.now()

  const CAMPOS = 'id, nombre, document_type, document_number, phone, puntos, score, source, activated_at, created_at'

  // ── La ficha de UNA persona: sus datos y TODOS sus pedidos ──
  if (body.buyer_id) {
    const { data: cliente } = await supabase
      .from('buyers').select(CAMPOS).eq('id', body.buyer_id).eq('store_id', storeId).maybeSingle()
    if (!cliente) return json({ error: 'not_found' }, 404)

    // Acá van TODOS los pedidos, no solo los entregados: la ficha es el
    // historial de la relación, y un pedido cancelado o no entregado es
    // justamente lo que explica por qué este cliente merece otra mirada.
    const { data: pedidos } = await supabase
      .from('order_sessions')
      .select('id, token, product_name, pack_name, product_price, stage, status, created_at, tracking_phase')
      .eq('buyer_id', body.buyer_id)
      .order('created_at', { ascending: false })
      .limit(50)

    const entregados = (pedidos ?? []).filter(p => p.stage === 'entregado')
    const resumen = agregarPorComprador(entregados.map(p => ({
      buyer_id: body.buyer_id, product_price: p.product_price, created_at: p.created_at,
    }))).get(body.buyer_id) ?? { pedidos: 0, gastado: 0, ultimo: 0 }

    return json({
      cliente: {
        ...cliente,
        ...resumen,
        ultimo: resumen.ultimo ? new Date(resumen.ultimo).toISOString() : null,
        segmento: segmentoDe(resumen.ultimo, ahora, restockDias, winbackDias),
      },
      pedidos: pedidos ?? [],
    })
  }

  // ── La lista ──
  const { data: clientes } = await supabase
    .from('buyers').select(CAMPOS)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(500)

  // Solo entregados: el LTV es lo que de verdad se cobró (ver _shared/clientes).
  const { data: entregados } = await supabase
    .from('order_sessions')
    .select('buyer_id, product_price, created_at')
    .eq('store_id', storeId)
    .eq('stage', 'entregado')
    .not('buyer_id', 'is', null)

  const porComprador = agregarPorComprador(entregados ?? [])

  return json({
    clientes: (clientes ?? []).map(c => {
      const a = porComprador.get(c.id) ?? { pedidos: 0, gastado: 0, ultimo: 0 }
      return {
        ...c,
        pedidos: a.pedidos,
        gastado: a.gastado,
        ultimo: a.ultimo ? new Date(a.ultimo).toISOString() : null,
        segmento: segmentoDe(a.ultimo, ahora, restockDias, winbackDias),
      }
    }),
    config: { restock_days: restockDias, winback_days: winbackDias },
  })
})
