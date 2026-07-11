import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Server-defined points — the client cannot invent its own.
const POINTS: Record<string, number> = {
  identity: 15,
  address_gps: 10,
  whatsapp: 10,
  share: 5,
}
const DAILY_POINTS = 2

function pointsFor(key: string): number {
  if (key.startsWith('daily:')) return DAILY_POINTS
  return POINTS[key] ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { action, buyer_id, action_key } = await req.json() as {
    action: 'get' | 'claim'
    buyer_id: string
    action_key?: string
  }

  if (!buyer_id) return new Response('Missing buyer_id', { status: 400, headers: corsHeaders })

  const readState = async () => {
    const { data: buyer } = await supabase
      .from('buyers')
      .select('score, puntos')
      .eq('id', buyer_id)
      .maybeSingle()
    const { data: acts } = await supabase
      .from('buyer_actions')
      .select('action_key')
      .eq('buyer_id', buyer_id)
    return {
      score: buyer?.score ?? 50,
      puntos: buyer?.puntos ?? 0,
      done: (acts ?? []).map(a => a.action_key),
    }
  }

  if (action === 'get') {
    return new Response(JSON.stringify(await readState()), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // claim
  if (!action_key) return new Response('Missing action_key', { status: 400, headers: corsHeaders })
  const pts = pointsFor(action_key)
  if (pts === 0) return new Response('Unknown action', { status: 400, headers: corsHeaders })

  const { error: insErr } = await supabase
    .from('buyer_actions')
    .insert({ buyer_id, action_key })

  if (insErr) {
    // Already claimed (unique violation) — return current state, no double points
    return new Response(JSON.stringify({ ...(await readState()), already: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: buyer } = await supabase
    .from('buyers')
    .select('score, puntos')
    .eq('id', buyer_id)
    .maybeSingle()

  const newScore = Math.min(100, (buyer?.score ?? 50) + pts)
  const newPuntos = (buyer?.puntos ?? 0) + pts
  await supabase.from('buyers').update({ score: newScore, puntos: newPuntos }).eq('id', buyer_id)

  return new Response(JSON.stringify({ ...(await readState()), awarded: pts }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
