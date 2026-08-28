// ─── SALES ENGINE · Curiosos (leads que dejaron DNI y WhatsApp) ──────────────
//
// La primera columna del tablero. Son los que llenaron lo suficiente del
// formulario como para ser recontactables —DNI (con eso se crea la cuenta) y
// WhatsApp (con eso se les escribe)— y no siguieron. Hasta hoy vivían en
// `checkout_drafts` sin que nadie los mirara: el checkout los escribía y ahí
// se quedaban.
//
// Por qué siguen fuera de `order_sessions` (ver el bloque 12 de
// setup-kross.sql): un lead que nunca compró contaminaría el CRM y el
// round-robin le asignaría un vendedor a cada uno. Se leen aparte y el tablero
// los pinta como lo que son — gente por llamar, no pedidos.
//
// Se sabe qué producto les interesó; NO necesariamente el distrito ni la
// agencia. Eso lo completa el área comercial a mano cuando los convierte.
//
// Deploy: supabase functions deploy get-store-drafts --project-ref ofdjghntvmrdfjhazfvz

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-store-id',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const storeId = req.headers.get('x-store-id')
  if (!storeId) return json({ error: 'Missing store id' }, 400)

  // Curioso = recontactable y todavía no comprado. Sin DNI o sin teléfono no
  // hay nada que hacer con la fila, así que no se trae: una columna llena de
  // filas sobre las que no se puede actuar enseña a ignorar la columna.
  const { data, error } = await supabase
    .from('checkout_drafts')
    .select('order_id, store_id, phone, buyer_name, document_number, product_id, pack_name, location_type, district, last_step, created_at, updated_at')
    .eq('store_id', storeId)
    .is('converted_at', null)
    .not('document_number', 'is', null)
    .neq('document_number', '')
    .order('updated_at', { ascending: false })
    .limit(80)

  if (error) return json({ error: error.message }, 500)

  return json(data ?? [])
})
