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

// Admin-only. Lists finished call recordings for a store and returns a short-lived
// signed URL for each (the bucket is private).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as { admin_auth_id: string; store_id?: string; session_id?: string }
  if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // A store admin sees only their store; super admin may target any (or the store
  // they entered).
  const targetStore = me.is_super_admin ? (body.store_id || me.store_id) : me.store_id

  let q = supabase.from('call_recordings')
    .select('id, session_id, caller_role, caller_name, buyer_name, file_path, duration_sec, created_at')
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(100)
  if (targetStore) q = q.eq('store_id', targetStore)
  if (body.session_id) q = q.eq('session_id', body.session_id)

  const { data, error } = await q
  if (error) return json({ error: error.message }, 400)

  const recordings = await Promise.all((data ?? []).map(async (r) => {
    let url: string | null = null
    if (r.file_path) {
      const { data: signed } = await supabase.storage.from('call-recordings').createSignedUrl(r.file_path, 3600)
      url = signed?.signedUrl ?? null
    }
    return { ...r, url }
  }))

  return json({ recordings })
})
