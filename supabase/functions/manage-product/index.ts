import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'save' | 'delete'
    admin_auth_id: string
    id?: string
    nombre?: string
    precio?: number
    images?: string[]
    packs?: { nombre: string; descripcion?: string; precio: number }[]
    active?: boolean
    store_id?: string   // super admin: target store when managing a brand they entered
  }

  const { data: admin } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!admin?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // A store admin manages their own store; the super admin may target any store.
  const targetStore = (admin.is_super_admin && body.store_id) ? body.store_id : admin.store_id

  if (body.action === 'delete') {
    if (!body.id) return new Response('Missing id', { status: 400, headers: corsHeaders })
    await supabase.from('products').delete().eq('id', body.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // save (create or update)
  const row = {
    store_id: targetStore,
    nombre: body.nombre ?? 'Producto',
    precio: body.precio ?? 0,
    images: body.images ?? [],
    packs: body.packs ?? [],
    active: body.active ?? true,
  }

  let result
  if (body.id) {
    const { data, error } = await supabase.from('products').update(row).eq('id', body.id).select('id').single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    result = data
  } else {
    const { data, error } = await supabase.from('products').insert(row).select('id').single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    result = data
  }

  return new Response(JSON.stringify({ ok: true, id: result?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
