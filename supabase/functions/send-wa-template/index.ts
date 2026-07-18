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

// Manually send a chosen WhatsApp template to the buyer of an order. Convention:
// {{1}} = buyer name, {{2}} = product, {{3}} = order link (sends only as many as
// the template has). Called by the seller from the order.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { session_id, template, language, params, seller_name } = await req.json() as {
    session_id: string; template: string; language?: string; params?: number; seller_name?: string
  }
  if (!session_id || !template) return json({ error: 'missing_fields' }, 400)

  const { data: session } = await supabase
    .from('order_sessions')
    .select('store_id, buyer_id, buyer_name, buyer_phone, product_name, token')
    .eq('id', session_id).maybeSingle()
  if (!session) return json({ error: 'session_not_found' }, 404)

  const token = Deno.env.get('WHATSAPP_TOKEN')
  const { data: store } = await supabase
    .from('stores').select('wa_enabled, wa_phone_number_id, slug').eq('id', session.store_id).maybeSingle()
  if (!token || !store?.wa_enabled || !store?.wa_phone_number_id) return json({ error: 'wa_not_configured' }, 400)

  // Recipient phone
  let phone: string | null = null
  if (session.buyer_id) { const { data: b } = await supabase.from('buyers').select('phone').eq('id', session.buyer_id).maybeSingle(); phone = b?.phone ?? null }
  if (!phone) phone = session.buyer_phone ?? null
  let num = (phone || '').replace(/\D/g, '')
  if (num.length === 9) num = `51${num}`
  if (!num) return json({ error: 'no_phone' }, 400)

  const name = (session.buyer_name ?? 'Hola').split(' ')[0]
  const link = store.slug ? `https://${store.slug}.krossclub.app/p/${session.token}` : `https://krossclub.app/p/${session.token}`
  const all = [name, session.product_name ?? 'tu pedido', link]
  const n = typeof params === 'number' ? Math.max(0, Math.min(3, params)) : 3
  const parameters = all.slice(0, n).map(t => ({ type: 'text', text: String(t).slice(0, 300) }))
  const lang = language || Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'

  let result = 'failed', error: string | undefined
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: num, type: 'template',
        template: { name: template, language: { code: lang }, components: parameters.length ? [{ type: 'body', parameters }] : [] },
      }),
    })
    if (res.ok) result = 'sent'
    else error = (await res.text()).slice(0, 280)
  } catch (e) { error = String(e).slice(0, 200) }

  // Log + a seller-only note in the chat
  try {
    await supabase.from('notifications_log').insert({
      store_id: session.store_id, buyer_id: session.buyer_id, session_id,
      kind: 'manual_wa', push_count: 0, whatsapp: result, detail: error ?? `plantilla ${template}`,
    })
    if (result === 'sent') {
      await supabase.from('chat_messages').insert({
        session_id, sender_role: 'system', type: 'status_update', visibility: 'sellers',
        body: `📲 ${seller_name ? seller_name.split(' ')[0] + ' envió' : 'Se envió'} un WhatsApp al cliente (${template})`,
      })
    }
  } catch { /* ignore */ }

  return json({ ok: result === 'sent', result, error })
})
