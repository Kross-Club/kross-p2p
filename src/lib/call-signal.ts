import { supabase } from './supabase'

// Signaling while the call is still ringing — LiveKit only detects hangups
// once both parties joined the room, so reject/cancel must travel by broadcast.
//
// Topics are direction-specific so one client never subscribes twice to the
// same topic:
//   call-reject:{id} — callee sends when rejecting; the CALLER listens.
//   call-cancel:{id} — caller sends when hanging up early; the CALLEE listens.

function sendOnce(topic: string, event: string, sessionId: string) {
  const ch = supabase.channel(topic)
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      ch.send({ type: 'broadcast', event, payload: { session_id: sessionId } })
        .finally(() => { setTimeout(() => supabase.removeChannel(ch), 500) })
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      supabase.removeChannel(ch)
    }
  })
}

function listen(topic: string, event: string, cb: () => void) {
  const ch = supabase.channel(topic).on('broadcast', { event }, cb).subscribe()
  return () => { supabase.removeChannel(ch) }
}

export const sendCallReject = (sessionId: string) =>
  sendOnce(`call-reject:${sessionId}`, 'call_rejected', sessionId)

export const listenCallReject = (sessionId: string, cb: () => void) =>
  listen(`call-reject:${sessionId}`, 'call_rejected', cb)

export const sendCallCancel = (sessionId: string) =>
  sendOnce(`call-cancel:${sessionId}`, 'call_cancelled', sessionId)

export const listenCallCancel = (sessionId: string, cb: () => void) =>
  listen(`call-cancel:${sessionId}`, 'call_cancelled', cb)
