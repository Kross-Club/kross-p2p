import { createClient } from 'npm:@supabase/supabase-js@2'
import { WebhookReceiver, EgressClient, RoomServiceClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'npm:livekit-server-sdk@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const LK_URL = Deno.env.get('LIVEKIT_URL')!
const LK_KEY = Deno.env.get('LIVEKIT_API_KEY')!
const LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!

const receiver = new WebhookReceiver(LK_KEY, LK_SECRET)
const egress = new EgressClient(LK_URL, LK_KEY, LK_SECRET)
const rooms = new RoomServiceClient(LK_URL, LK_KEY, LK_SECRET)

// The webhook's room.numParticipants is unreliable (comes as 0), so ask the API.
async function participantCount(roomName: string): Promise<number> {
  try { return (await rooms.listParticipants(roomName)).length } catch { return 0 }
}

function s3Output(roomName: string): EncodedFileOutput | null {
  const endpoint = Deno.env.get('S3_ENDPOINT')
  const accessKey = Deno.env.get('S3_ACCESS_KEY')
  const secret = Deno.env.get('S3_SECRET')
  if (!endpoint || !accessKey || !secret) return null
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${roomName}/{time}.mp4`,
    output: { case: 's3', value: new S3Upload({
      accessKey, secret, region: Deno.env.get('S3_REGION') ?? 'us-east-1',
      endpoint, bucket: Deno.env.get('S3_BUCKET') ?? 'call-recordings', forcePathStyle: true,
    }) },
  })
}

async function activeEgress(roomName: string) {
  try { return (await egress.listEgress({ roomName, active: true })) ?? [] } catch { return [] }
}

// LiveKit webhooks. Records ONLY the connected call: starts when both parties are
// in the room, stops when one hangs up. Configure in LiveKit → Settings → Webhooks:
// https://<ref>.supabase.co/functions/v1/livekit-webhook
Deno.serve(async (req) => {
  const body = await req.text()
  const auth = req.headers.get('Authorization') ?? ''

  let event: any
  try {
    event = await receiver.receive(body, auth)
  } catch (e) {
    console.log('[livekit-webhook] SIGNATURE FAIL', String(e).slice(0, 200))
    return new Response('invalid signature', { status: 401 })
  }

  const room = event?.room
  const roomName: string = room?.name ?? ''
  console.log('[livekit-webhook] event=', event?.event, 'room=', roomName, 'participants=', room?.numParticipants)

  // ── Both parties connected → start recording (once) ──
  if (event?.event === 'participant_joined' && roomName && (await participantCount(roomName)) >= 2) {
    const existing = await activeEgress(roomName)
    console.log('[livekit-webhook] 2 participants — existing egress:', existing.length)
    if (existing.length === 0) {
      const out = s3Output(roomName)
      if (!out) {
        console.log('[livekit-webhook] no S3 config — cannot record')
      } else {
        try {
          const info = await egress.startRoomCompositeEgress(roomName, { file: out } as any, { audioOnly: true } as any)
          console.log('[livekit-webhook] egress STARTED', info.egressId)
          const sessionId = roomName.startsWith('order-') ? roomName.slice(6) : null
          let storeId: string | null = null, buyerName: string | null = null, sellerName: string | null = null
          if (sessionId) {
            const { data: s } = await supabase.from('order_sessions').select('store_id, buyer_name, seller_name').eq('id', sessionId).maybeSingle()
            storeId = s?.store_id ?? null; buyerName = s?.buyer_name ?? null; sellerName = s?.seller_name ?? null
          }
          await supabase.from('call_recordings').insert({
            store_id: storeId, session_id: sessionId, room_name: roomName, egress_id: info.egressId,
            caller_role: 'seller', caller_name: sellerName, buyer_name: buyerName, status: 'recording',
          })
        } catch (e) {
          console.log('[livekit-webhook] egress START FAILED:', String((e as any)?.message ?? e).slice(0, 400))
        }
      }
    }
  }

  // ── One party hung up (or room closed) → stop recording promptly ──
  if ((event?.event === 'participant_left' && (await participantCount(roomName)) <= 1) || event?.event === 'room_finished') {
    for (const e of await activeEgress(roomName)) {
      try { await egress.stopEgress(e.egressId) } catch { /* ignore */ }
    }
  }

  // ── Recording finished & uploaded → finalize the row ──
  if (event?.event === 'egress_ended' && event.egressInfo) {
    const info = event.egressInfo
    const fileRes = (info.fileResults && info.fileResults[0]) || null
    const filePath: string | null = fileRes?.filename ?? null
    const durNs = Number(fileRes?.duration ?? info.duration ?? 0)
    const durationSec = durNs > 100000 ? Math.round(durNs / 1e9) : Math.round(durNs)
    const { data: rec } = await supabase.from('call_recordings')
      .update({ file_path: filePath, duration_sec: durationSec, status: 'done' })
      .eq('egress_id', info.egressId)
      .select('id, session_id, duration_sec')
      .maybeSingle()

    // La llamada terminada entra al hilo del pedido como un evento más, con su
    // grabación enganchada (11-RELACIONES). El mensaje lo ven los dos lados
    // —igual que en WhatsApp, saber que hubo una llamada de 3:24 no es un
    // secreto—; el AUDIO no viaja acá, lo sirve `get-recordings`, que sigue
    // siendo solo para administradores.
    if (rec?.session_id) {
      const d = Number(rec.duration_sec ?? 0)
      const mmss = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`
      const { data: msg } = await supabase.from('chat_messages').insert({
        session_id: rec.session_id,
        sender_role: 'system',
        type: 'call_log',
        body: d > 0 ? `Llamada de voz · ${mmss}` : 'Llamada de voz',
        call_recording_id: rec.id,
      }).select().maybeSingle()
      if (msg) {
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            },
            body: JSON.stringify({ messages: [{ topic: `order:${rec.session_id}`, event: 'new_message', payload: msg }] }),
          })
        } catch { /* el mensaje ya está guardado; el chat lo verá al recargar */ }
      }
    }
  }

  return new Response('ok')
})
