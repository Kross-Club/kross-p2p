import { corsHeaders, json } from '../_shared/cors.ts'

// Turno de IA del quiz: recibe las respuestas y devuelve una recomendación
// personalizada de alta conversión. Provider-agnostic vía la API de Anthropic
// (cámbialo por tu proveedor si prefieres). Secrets: AI_API_KEY, AI_MODEL.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { answers } = await req.json() as { answers: Record<string, string> }
  const apiKey = Deno.env.get('AI_API_KEY')
  const model = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5'

  // Sin API key configurada → respuesta neutra para no romper el embudo.
  if (!apiKey) return json({ reply: 'Según tus respuestas, tenemos una recomendación ideal para ti. Déjanos tus datos y te enviamos tu plan.' })

  const summary = Object.entries(answers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
  const prompt = `Eres un asesor experto y persuasivo. Con estas respuestas de un quiz, escribe una recomendación breve (máx 3 frases), cálida y orientada a la acción, que enganche al usuario a dejar sus datos para recibir su plan. No inventes datos médicos.\n\nRespuestas:\n${summary}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await res.json().catch(() => ({}))
    const reply = d?.content?.[0]?.text ?? 'Tenemos una recomendación para ti. Déjanos tus datos y te la enviamos.'
    return json({ reply })
  } catch {
    return json({ reply: 'Tenemos una recomendación para ti. Déjanos tus datos y te la enviamos.' })
  }
})
