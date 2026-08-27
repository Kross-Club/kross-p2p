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

const DAY = 86_400_000

// Retention campaign engine. Recomputes a segment (RESTOCK / WIN-BACK) and sends the
// chosen WhatsApp template to that segment, batched to protect the number's rating.
// A 7-day cooldown (last_campaign_at) stops the same customer being hit repeatedly.
// Template convention: {{1}} first name, {{2}} link to the store.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    admin_auth_id: string; store_id?: string
    segment: 'restock' | 'winback'
    template: string; language?: string; params?: number; limit?: number
    dry_run?: boolean
  }
  if (!body.admin_auth_id || !body.segment) return json({ error: 'missing_fields' }, 400)
  if (!body.dry_run && !body.template) return json({ error: 'missing_template' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const storeId = (me.is_super_admin && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  const { data: store } = await supabase
    .from('stores').select('wa_enabled, wa_phone_number_id, slug, restock_days, winback_days').eq('id', storeId).maybeSingle()
  const { restockDias: restockDays, winbackDias: winbackDays } = ventanasDe(store)

  // Compute the segment from delivered orders (same math as retention-metrics)
  const { data: orders } = await supabase
    .from('order_sessions')
    .select('buyer_id, created_at')
    .eq('store_id', storeId)
    .eq('stage', 'entregado')
    .not('buyer_id', 'is', null)

  // Mismo `segmentoDe` que cuenta el segmento en la pantalla de Reactivar y que
  // pinta el chip en la ficha del cliente. Si esta campaña le escribiera a un
  // conjunto distinto del que el vendedor vio antes de apretar el botón, el
  // número de la pantalla sería una mentira.
  const now = Date.now()
  const targetIds: string[] = []
  for (const [id, a] of agregarPorComprador(orders ?? [])) {
    if (segmentoDe(a.ultimo, now, restockDays, winbackDays) === body.segment) targetIds.push(id)
  }

  if (targetIds.length === 0) return json({ segment: body.segment, eligible: 0, sent: 0, failed: 0 })

  // Load those buyers, drop ones messaged within the cooldown window
  const cooldownAgo = new Date(now - 7 * DAY).toISOString()
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, nombre, phone, last_campaign_at')
    .in('id', targetIds)
    .not('phone', 'is', null)
  const eligible = (buyers ?? []).filter(b => !(b as any).last_campaign_at || (b as any).last_campaign_at < cooldownAgo)

  if (body.dry_run) return json({ segment: body.segment, eligible: eligible.length })

  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token || !store?.wa_enabled || !store?.wa_phone_number_id) return json({ error: 'wa_not_configured' }, 400)

  const limit = Math.max(1, Math.min(200, body.limit ?? 80))
  const list = eligible.slice(0, limit)
  const lang = body.language || Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'
  const link = store.slug ? `https://${store.slug}.krossclub.app/tienda` : `https://krossclub.app/tienda`

  let sent = 0, failed = 0
  async function sendOne(b: { id: string; nombre: string | null; phone: string | null }) {
    let num = (b.phone || '').replace(/\D/g, '')
    if (num.length === 9) num = `51${num}`
    if (!num) { failed++; return }
    const name = (b.nombre ?? 'Hola').split(' ')[0]
    const all = [name, link]
    const n = typeof body.params === 'number' ? Math.max(0, Math.min(2, body.params)) : 2
    const parameters = all.slice(0, n).map(t => ({ type: 'text', text: String(t).slice(0, 300) }))
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: num, type: 'template',
          template: { name: body.template, language: { code: lang }, components: parameters.length ? [{ type: 'body', parameters }] : [] },
        }),
      })
      if (res.ok) sent++; else failed++
    } catch { failed++ }
    await supabase.from('buyers').update({ last_campaign_at: new Date().toISOString() }).eq('id', b.id)
  }

  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(sendOne))
  }

  try {
    await supabase.from('notifications_log').insert({
      store_id: storeId, kind: `campaign_${body.segment}`, push_count: 0,
      whatsapp: sent > 0 ? 'sent' : 'failed', detail: `campaña ${body.segment} (${body.template}): ${sent} enviados, ${failed} fallidos`,
    })
  } catch { /* ignore */ }

  return json({ segment: body.segment, eligible: eligible.length, sent, failed, remaining: Math.max(0, eligible.length - list.length) })
})
