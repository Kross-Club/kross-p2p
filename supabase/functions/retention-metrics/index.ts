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

// Retention dashboard + segment sizing. Computes, for one store:
//  - repeat rate (buyers with ≥2 delivered orders / buyers with ≥1)
//  - revenue from existing customers + average LTV
//  - two actionable segments: RESTOCK (consumable running out) and WIN-BACK (churning)
// The segments drive the campaign launcher (run-campaign) — same math on both sides.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as { admin_auth_id: string; store_id?: string }
  if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const storeId = (me.is_super_admin && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  const { data: store } = await supabase
    .from('stores').select('restock_days, winback_days').eq('id', storeId).maybeSingle()
  const { restockDias: restockDays, winbackDias: winbackDays } = ventanasDe(store)

  // Base customer counts
  const cnt = async (build: (q: any) => any) => {
    const { count } = await build(supabase.from('buyers').select('id', { count: 'exact', head: true }).eq('store_id', storeId))
    return count ?? 0
  }
  const totalBuyers = await cnt((q: any) => q)
  const activated = await cnt((q: any) => q.not('activated_at', 'is', null))

  // Delivered orders drive every retention metric. product_price is the COD amount.
  const { data: orders } = await supabase
    .from('order_sessions')
    .select('buyer_id, product_price, created_at')
    .eq('store_id', storeId)
    .eq('stage', 'entregado')
    .not('buyer_id', 'is', null)

  // La agregación y los segmentos viven en `_shared/clientes.ts`: son la misma
  // definición que usan el listado de clientes y el disparo de campañas, y
  // tenerla copiada acá ya era una de tres.
  const perBuyer = agregarPorComprador(orders ?? [])
  let revenue = 0
  for (const a of perBuyer.values()) revenue += a.gastado

  const buyersWithOrder = perBuyer.size
  let repeatBuyers = 0, totalOrders = 0
  const now = Date.now()
  let restock = 0, winback = 0
  for (const a of perBuyer.values()) {
    totalOrders += a.pedidos
    if (a.pedidos >= 2) repeatBuyers += 1
    const seg = segmentoDe(a.ultimo, now, restockDays, winbackDays)
    if (seg === 'restock') restock += 1
    else if (seg === 'winback') winback += 1
  }

  const repeatRate = buyersWithOrder ? repeatBuyers / buyersWithOrder : 0
  const avgLTV = buyersWithOrder ? revenue / buyersWithOrder : 0
  const avgOrders = buyersWithOrder ? totalOrders / buyersWithOrder : 0

  return json({
    config: { restock_days: restockDays, winback_days: winbackDays },
    customers: { total: totalBuyers, activated, with_order: buyersWithOrder, repeat: repeatBuyers },
    revenue: { total: revenue, avg_ltv: avgLTV, avg_orders: avgOrders },
    repeat_rate: repeatRate,
    segments: { restock, winback },
  })
})
