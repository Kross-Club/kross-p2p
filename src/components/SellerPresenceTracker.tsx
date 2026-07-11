import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Broadcasts the seller's real connection while the app is open/visible, so the
// admin can see who is actually online (independent of their turno on/off).
export default function SellerPresenceTracker({ authUserId }: { authUserId?: string | null }) {
  useEffect(() => {
    if (!authUserId) return
    const channel = supabase.channel('presence:sellers', {
      config: { presence: { key: authUserId } },
    })
    let subscribed = false
    const goOnline = () => { if (subscribed) channel.track({ online_at: new Date().toISOString() }) }
    const goOffline = () => { if (subscribed) channel.untrack() }

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { subscribed = true; if (document.visibilityState === 'visible') goOnline() }
    })
    const onVis = () => (document.visibilityState === 'visible' ? goOnline() : goOffline())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', goOffline)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', goOffline)
      supabase.removeChannel(channel)
    }
  }, [authUserId])

  return null
}
