import { createClient } from 'npm:@supabase/supabase-js@2'
import { WebhookReceiver } from 'npm:livekit-server-sdk@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const receiver = new WebhookReceiver(
  Deno.env.get('LIVEKIT_API_KEY')!,
  Deno.env.get('LIVEKIT_API_SECRET')!
)

// Receives LiveKit webhooks. On 'egress_ended' it finalizes the matching
// call_recordings row (file path + duration). Configure the URL in LiveKit:
// Settings → Webhooks → https://<ref>.supabase.co/functions/v1/livekit-webhook
Deno.serve(async (req) => {
  const body = await req.text()
  const auth = req.headers.get('Authorization') ?? ''

  let event: any
  try {
    event = await receiver.receive(body, auth)
  } catch {
    return new Response('invalid signature', { status: 401 })
  }

  if (event?.event === 'egress_ended' && event.egressInfo) {
    const info = event.egressInfo
    const roomName: string = info.roomName ?? ''
    const fileRes = (info.fileResults && info.fileResults[0]) || null
    const filePath: string | null = fileRes?.filename ?? null
    const durNs = Number(fileRes?.duration ?? info.duration ?? 0)
    const durationSec = durNs > 100000 ? Math.round(durNs / 1e9) : Math.round(durNs) // ns → s (or already s)

    // Finalize the latest pending recording for this room…
    const { data: rec } = await supabase
      .from('call_recordings')
      .select('id')
      .eq('room_name', roomName)
      .eq('status', 'recording')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (rec) {
      await supabase.from('call_recordings').update({
        egress_id: info.egressId, file_path: filePath, duration_sec: durationSec, status: 'done',
      }).eq('id', rec.id)
    } else {
      // …or create one (e.g. a call started outside seller-call-token)
      const sessionId = roomName.startsWith('order-') ? roomName.slice(6) : null
      let storeId: string | null = null
      let buyerName: string | null = null
      if (sessionId) {
        const { data: s } = await supabase.from('order_sessions').select('store_id, buyer_name').eq('id', sessionId).maybeSingle()
        storeId = s?.store_id ?? null
        buyerName = s?.buyer_name ?? null
      }
      await supabase.from('call_recordings').insert({
        store_id: storeId, session_id: sessionId, room_name: roomName, egress_id: info.egressId,
        buyer_name: buyerName, file_path: filePath, duration_sec: durationSec, status: 'done',
      })
    }
  }

  return new Response('ok')
})
