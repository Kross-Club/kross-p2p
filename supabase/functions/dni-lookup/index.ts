const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Resolves a Peruvian DNI to the person's full name via Decolecta (RENIEC).
// The API token lives in the DECOLECTA_TOKEN secret — never hardcode it.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { document_number } = await req.json() as { document_number?: string }
  const dni = (document_number ?? '').replace(/\D/g, '')
  if (dni.length !== 8) {
    return new Response(JSON.stringify({ nombre: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const token = Deno.env.get('DECOLECTA_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ nombre: null, error: 'no_token' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const r = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!r.ok) {
      return new Response(JSON.stringify({ nombre: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const data = await r.json()
    const nombre = data?.full_name
      || [data?.first_name, data?.first_last_name, data?.second_last_name].filter(Boolean).join(' ')
      || null
    return new Response(JSON.stringify({ nombre }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ nombre: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
