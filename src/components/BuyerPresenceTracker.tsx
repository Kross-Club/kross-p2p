import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

function getBuyerId(): string | null {
  try {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) return null
    return JSON.parse(raw)?.buyer?.id ?? null
  } catch {
    return null
  }
}

// Broadcasts the buyer's presence while the app is open (any section), so the
// seller can see a real "En línea" indicator. When the app is closed or
// backgrounded the realtime channel drops and presence clears automatically.
export default function BuyerPresenceTracker() {
  useEffect(() => {
    const buyerId = getBuyerId()
    if (!buyerId) return

    const channel = supabase.channel(`presence:buyer:${buyerId}`, {
      config: { presence: { key: buyerId } },
    })

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        channel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => { supabase.removeChannel(channel) }
  }, [])

  return null
}
