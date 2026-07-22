import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

// Guarda la suscripción Web Push del navegador. La clave privada VAPID vive en secrets;
// el envío real de push lo harás desde otra función (usa web-push con VAPID).
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const { subscription, lead_id } = await req.json() as { subscription: unknown; lead_id?: string }
  if (!subscription) return json({ error: 'missing_subscription' }, 400)
  const { error } = await supabase.from('push_subscriptions').insert({ subscription, lead_id: lead_id ?? null })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
})
