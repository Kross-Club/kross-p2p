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

    const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
    const title = (s: string) => (s ?? '').trim().split(/\s+/).filter(Boolean).map(cap).join(' ')

    const primerNombre = ((data?.first_name ?? '') as string).trim().split(/\s+/)[0] || ''
    const primerApellido = ((data?.first_last_name ?? '') as string).trim().split(/\s+/)[0] || ''

    let nombre: string | null = null
    if (primerNombre || primerApellido) {
      nombre = title(`${primerNombre} ${primerApellido}`).trim() || null
    } else if (data?.full_name) {
      // Fallback: RENIEC full_name comes as "APELLIDOS NOMBRES"; take a couple of tokens
      nombre = title(String(data.full_name).split(/\s+/).slice(0, 2).join(' ')) || null
    }
    return new Response(JSON.stringify({ nombre }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ nombre: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
