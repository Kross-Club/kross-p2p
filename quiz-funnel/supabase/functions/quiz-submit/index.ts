import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

// Cierra el quiz: guarda el lead + sus respuestas y (opcional) le manda el plan por
// WhatsApp como fallback inmediato. Convención de plantilla: {{1}} nombre.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    nombre?: string; phone: string; answers: Record<string, string>; ai_reply?: string
  }
  if (!body.phone?.trim()) return json({ error: 'missing_phone' }, 400)

  const { data: lead, error } = await supabase.from('leads').insert({
    nombre: body.nombre ?? null,
    phone: body.phone.trim(),
    answers: body.answers ?? {},
    ai_reply: body.ai_reply ?? null,
  }).select('id').single()
  if (error) return json({ error: error.message }, 400)

  // Fallback WhatsApp: manda la plantilla de bienvenida/plan si está configurada.
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')
  const template = Deno.env.get('WA_WELCOME_TEMPLATE')  // nombre de tu plantilla aprobada
  if (token && phoneId && template) {
    let num = body.phone.replace(/\D/g, ''); if (num.length === 9) num = `51${num}`
    const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'
    const name = (body.nombre ?? 'Hola').split(' ')[0]
    try {
      await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: num, type: 'template',
          template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: name }] }] },
        }),
      })
    } catch { /* no bloquea el cierre del quiz */ }
  }

  return json({ ok: true, lead_id: lead.id })
})
