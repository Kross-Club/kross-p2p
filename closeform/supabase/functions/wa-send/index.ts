import { corsHeaders, json } from '../_shared/cors.ts'

// Envío de plantilla de WhatsApp (Cloud API). Reutiliza el MISMO WHATSAPP_TOKEN y
// WA_PHONE_NUMBER_ID que ya tienes. Convención: params en orden → {{1}}, {{2}}, …
// Pensado como "fallback": lo llamas cuando otro canal (push/web) no alcanzó al usuario.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    to: string                 // teléfono destino
    template: string           // nombre de plantilla aprobada
    language?: string
    params?: string[]          // valores para {{1}}, {{2}}, …
  }
  if (!body.to || !body.template) return json({ error: 'missing_fields' }, 400)

  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')
  if (!token || !phoneId) return json({ error: 'wa_not_configured' }, 400)

  let num = (body.to || '').replace(/\D/g, '')
  if (num.length === 9) num = `51${num}`   // Perú por defecto; ajusta si aplica

  const lang = body.language || Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'
  const parameters = (body.params ?? []).map(t => ({ type: 'text', text: String(t).slice(0, 300) }))

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: num, type: 'template',
      template: { name: body.template, language: { code: lang }, components: parameters.length ? [{ type: 'body', parameters }] : [] },
    }),
  })
  const out = await res.json().catch(() => ({}))
  return json({ ok: res.ok, meta: out }, res.ok ? 200 : 400)
})
