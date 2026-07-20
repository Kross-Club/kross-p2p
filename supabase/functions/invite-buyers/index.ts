import { createClient } from 'npm:@supabase/supabase-js@2'

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

// Mass-invite: sends the chosen WhatsApp template to imported customers who haven't
// activated yet and weren't invited before. Batched (guardrail) to protect the
// number's quality rating and cost. Convention: {{1}} name, {{2}} reward, {{3}} link.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    admin_auth_id: string; store_id?: string
    template: string; language?: string; params?: number; limit?: number
  }
  if (!body.admin_auth_id || !body.template) return json({ error: 'missing_fields' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const storeId = (me.is_super_admin && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  const token = Deno.env.get('WHATSAPP_TOKEN')
  const { data: store } = await supabase
    .from('stores').select('wa_enabled, wa_phone_number_id, slug, welcome_points, welcome_msg').eq('id', storeId).maybeSingle()
  if (!token || !store?.wa_enabled || !store?.wa_phone_number_id) return json({ error: 'wa_not_configured' }, 400)

  const limit = Math.max(1, Math.min(200, body.limit ?? 80))
  const lang = body.language || Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'
  const link = store.slug ? `https://${store.slug}.krossclub.app/acceso` : `https://krossclub.app/acceso`
  const rewardTxt = store.welcome_msg || (store.welcome_points ? `${store.welcome_points} puntos de regalo` : 'una sorpresa')

  // Candidates: not activated, not invited, with a phone
  const { data: candidates } = await supabase
    .from('buyers')
    .select('id, nombre, phone')
    .eq('store_id', storeId)
    .is('activated_at', null)
    .is('invited_at', null)
    .not('phone', 'is', null)
    .limit(limit)

  const list = candidates ?? []
  let sent = 0, failed = 0

  async function sendOne(b: { id: string; nombre: string | null; phone: string | null }) {
    let num = (b.phone || '').replace(/\D/g, '')
    if (num.length === 9) num = `51${num}`
    if (!num) { failed++; return }
    const name = (b.nombre ?? 'Hola').split(' ')[0]
    const all = [name, rewardTxt, link]
    const n = typeof body.params === 'number' ? Math.max(0, Math.min(3, body.params)) : 3
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
    // Mark invited regardless (don't re-hit a bad number every run)
    await supabase.from('buyers').update({ invited_at: new Date().toISOString() }).eq('id', b.id)
  }

  // Send in small concurrent chunks to stay within the function's time budget
  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(sendOne))
  }

  // Log the batch
  try {
    await supabase.from('notifications_log').insert({
      store_id: storeId, kind: 'invite_batch', push_count: 0,
      whatsapp: sent > 0 ? 'sent' : 'failed', detail: `invitación ${body.template}: ${sent} enviados, ${failed} fallidos`,
    })
  } catch { /* ignore */ }

  // How many still pending after this batch
  const { count: remaining } = await supabase
    .from('buyers').select('id', { count: 'exact', head: true })
    .eq('store_id', storeId).is('activated_at', null).is('invited_at', null).not('phone', 'is', null)

  return json({ sent, failed, remaining: remaining ?? 0 })
})
