import { WebhookReceiver, EgressClient, RoomServiceClient } from 'npm:livekit-server-sdk@2'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

// Grabación de llamadas controlada por webhook (control de costo: graba solo la
// duración conectada). Inicia el Egress cuando entra el 2º participante y lo detiene
// al colgar. IMPORTANTE: desplegar con  --no-verify-jwt  (el gateway de Supabase si no
// rechaza el JWT que firma LiveKit).
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const KEY = Deno.env.get('LIVEKIT_API_KEY')!
const SECRET = Deno.env.get('LIVEKIT_API_SECRET')!
const HOST = (Deno.env.get('LIVEKIT_URL') ?? '').replace('wss://', 'https://')
const BUCKET = Deno.env.get('LIVEKIT_S3_BUCKET') ?? 'call-recordings'

const receiver = new WebhookReceiver(KEY, SECRET)
const egressClient = new EgressClient(HOST, KEY, SECRET)
const roomService = new RoomServiceClient(HOST, KEY, SECRET)

async function participantCount(room: string): Promise<number> {
  try { return (await roomService.listParticipants(room)).length } catch { return 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const bodyText = await req.text()
  let event
  try { event = await receiver.receive(bodyText, req.headers.get('Authorization')!) } catch { return new Response('bad sig', { status: 401 }) }

  const room = event.room?.name ?? ''
  if (!room) return json({ ok: true })

  if (event.event === 'participant_joined') {
    if (await participantCount(room) >= 2) {
      const { data: active } = await supabase.from('call_recordings').select('id').eq('room', room).eq('status', 'recording').maybeSingle()
      if (!active) {
        const filepath = `${room}/${Date.now()}.ogg`
        const info = await egressClient.startRoomCompositeEgress(room, { file: { filepath } }, { audioOnly: true })
        await supabase.from('call_recordings').insert({ room, egress_id: info.egressId, status: 'recording', file_path: `${BUCKET}/${filepath}` })
      }
    }
  } else if (event.event === 'participant_left' || event.event === 'room_finished') {
    if (await participantCount(room) <= 1) {
      const { data: rec } = await supabase.from('call_recordings').select('egress_id').eq('room', room).eq('status', 'recording').maybeSingle()
      if (rec?.egress_id) { try { await egressClient.stopEgress(rec.egress_id) } catch { /* already stopped */ } }
    }
  } else if (event.event === 'egress_ended') {
    const id = event.egressInfo?.egressId
    if (id) await supabase.from('call_recordings').update({ status: 'done' }).eq('egress_id', id)
  }

  return json({ ok: true })
})
