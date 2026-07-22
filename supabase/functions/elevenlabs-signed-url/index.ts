// SALES ENGINE · Signed URL para el Voice Closer (ElevenLabs Conversational AI).
// Mantiene ELEVENLABS_API_KEY en el backend: el frontend nunca la ve. Devuelve una
// signed URL efímera para que el widget de voz se conecte al agente.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { agent_id } = await req.json().catch(() => ({})) as { agent_id?: string }
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
  const agentId = agent_id || Deno.env.get('ELEVENLABS_AGENT_ID')
  if (!apiKey || !agentId) return json({ signed_url: null, error: 'not_configured' }, 200)

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': apiKey } },
    )
    if (!r.ok) return json({ signed_url: null, error: `elevenlabs_${r.status}` }, 200)
    const data = await r.json()
    return json({ signed_url: data?.signed_url ?? null })
  } catch (e) {
    return json({ signed_url: null, error: String(e) }, 200)
  }
})
