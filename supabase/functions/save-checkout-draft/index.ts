// ─── SALES ENGINE · Lead parcial del checkout ────────────────────────────────
// Guarda el pedido a medio llenar apenas el WhatsApp es válido. Es lo que
// permite recuperar abandonos: sin esto, quien deja el formulario a la mitad se
// pierde sin dejar rastro.
//
// Por qué NO va a `order_sessions`: contaminaría el CRM con leads que nunca
// compraron y el round-robin le asignaría un vendedor a cada uno. Vive en su
// propia tabla y solo Ventas la mira cuando quiere recuperar abandonos.
//
// Deploy: supabase functions deploy save-checkout-draft --project-ref ofdjghntvmrdfjhazfvz

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** uuid v4 — el `order_id` que genera el checkout. Se valida para no aceptar basura. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const orderId = String(body.order_id ?? '')
  const storeId = String(body.store_id ?? '')
  const phoneDigits = String(body.whatsapp ?? '').replace(/\D/g, '')

  if (!UUID_RE.test(orderId)) return json({ error: 'order_id inválido' }, 400)
  if (!storeId) return json({ error: 'store_id requerido' }, 400)
  // El lead solo tiene sentido si se puede recontactar: 9 dígitos que empiezan en 9.
  if (phoneDigits.length !== 9 || !phoneDigits.startsWith('9')) {
    return json({ error: 'whatsapp inválido' }, 400)
  }

  const clamp = (v: unknown, max: number): string | null => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s ? s.slice(0, max) : null
  }

  // Upsert por order_id: el checkout llama esto varias veces mientras avanza y
  // cada llamada refresca el mismo borrador, no crea uno nuevo.
  const { error } = await supabase
    .from('checkout_drafts')
    .upsert({
      order_id: orderId,
      store_id: storeId,
      phone: `51${phoneDigits}`,
      buyer_name: clamp(body.receiver_name, 120),
      document_number: clamp(body.dni, 12),
      product_id: clamp(body.product_id, 64),
      pack_name: clamp(body.pack_name, 120),
      location_type: body.location_type === 'PROVINCIA' ? 'PROVINCIA' : body.location_type === 'LIMA' ? 'LIMA' : null,
      district: clamp(body.district, 120),
      last_step: Number(body.step) || 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id' })

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
})
