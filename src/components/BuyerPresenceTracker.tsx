import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PRESENCE_CHANNEL = 'presence:buyers'

function getBuyerId(): string | null {
  try {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) return null
    return JSON.parse(raw)?.buyer?.id ?? null
  } catch {
    return null
  }
}

// Broadcasts the buyer's presence while the app is actually visible/open, so the
// seller sees a real "En línea" indicator. Crucially, we UNTRACK when the app is
// hidden (backgrounded), closed, or navigated away — otherwise Supabase keeps the
// socket alive for a while and the buyer looks online after leaving.
export default function BuyerPresenceTracker() {
  useEffect(() => {
    const buyerId = getBuyerId()
    if (!buyerId) return

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: buyerId } },
    })

    let subscribed = false

    const goOnline = () => {
      if (subscribed) channel.track({ online_at: new Date().toISOString(), buyer_id: buyerId })
    }
    const goOffline = () => {
      if (subscribed) channel.untrack()
    }

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        subscribed = true
        if (document.visibilityState === 'visible') goOnline()
      }
    })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') goOnline()
      else goOffline()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', goOffline)
    window.addEventListener('beforeunload', goOffline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', goOffline)
      window.removeEventListener('beforeunload', goOffline)
      supabase.removeChannel(channel)
    }
  }, [])

  return null
}
