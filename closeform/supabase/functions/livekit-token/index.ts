import { AccessToken } from 'npm:livekit-server-sdk@2'
import { corsHeaders, json } from '../_shared/cors.ts'

// Emite un token de acceso a una sala de LiveKit (voz WebRTC). Reutiliza tu misma
// cuenta LiveKit: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { room, identity, name } = await req.json() as { room: string; identity: string; name?: string }
  if (!room || !identity) return json({ error: 'missing_fields' }, 400)

  const key = Deno.env.get('LIVEKIT_API_KEY')
  const secret = Deno.env.get('LIVEKIT_API_SECRET')
  const url = Deno.env.get('LIVEKIT_URL')
  if (!key || !secret || !url) return json({ error: 'livekit_not_configured' }, 400)

  const at = new AccessToken(key, secret, { identity, name: name ?? identity })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })
  const jwt = await at.toJwt()

  return json({ token: jwt, url })
})
