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

// Lists a brand's APPROVED WhatsApp templates (name, language, #body params) so
// the seller can pick one to send manually.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { store_id } = await req.json() as { store_id?: string }
  if (!store_id) return json({ templates: [] })

  const token = Deno.env.get('WHATSAPP_TOKEN')
  const { data: store } = await supabase
    .from('stores').select('wa_enabled, wa_business_account_id').eq('id', store_id).maybeSingle()
  if (!token || !store?.wa_enabled || !store?.wa_business_account_id) return json({ templates: [] })

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${store.wa_business_account_id}/message_templates?fields=name,language,status,components&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return json({ templates: [], error: (await res.text()).slice(0, 200) })
    const data = await res.json()
    const templates = (data.data ?? [])
      .filter((t: any) => t.status === 'APPROVED')
      .map((t: any) => {
        const body = (t.components ?? []).find((c: any) => c.type === 'BODY')
        const params = body?.text ? (body.text.match(/\{\{\d+\}\}/g) ?? []).length : 0
        return { name: t.name, language: t.language, params, preview: (body?.text ?? '').slice(0, 140) }
      })
    return json({ templates })
  } catch (e) {
    return json({ templates: [], error: String(e).slice(0, 200) })
  }
})
