import { createClient } from 'npm:@supabase/supabase-js@2'
import { administraLaPlataforma } from '../_shared/alcance.ts'

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

// Admin imports their existing customer base into a store. Upserts by (store_id,
// document_number). Imported buyers are marked source='import' so we can invite &
// track activation separately.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    admin_auth_id: string
    store_id?: string
    rows: { nombre?: string; phone?: string; document_number?: string }[]
  }
  if (!body.admin_auth_id || !Array.isArray(body.rows)) return json({ error: 'bad_request' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })
  const storeId = (administraLaPlataforma(me) && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  let imported = 0, skipped = 0
  for (const raw of body.rows.slice(0, 5000)) {
    const dni = (raw.document_number ?? '').replace(/\D/g, '').slice(0, 12)
    let phone = (raw.phone ?? '').replace(/\D/g, '')
    if (phone.length === 9) phone = `51${phone}`
    const nombre = (raw.nombre ?? '').trim().slice(0, 80)
    if (!dni && !phone) { skipped++; continue }

    // Prefer DNI as the key (store-scoped). Fall back to phone.
    const row: Record<string, unknown> = { store_id: storeId, nombre: nombre || null, source: 'import' }
    if (dni) row.document_number = dni
    if (phone) row.phone = phone

    const { error } = dni
      ? await supabase.from('buyers').upsert(row, { onConflict: 'store_id,document_number', ignoreDuplicates: false })
      : await supabase.from('buyers').upsert(row, { onConflict: 'store_id,phone', ignoreDuplicates: false })
    if (error) skipped++; else imported++
  }

  return json({ imported, skipped })
})
