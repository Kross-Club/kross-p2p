import { useEffect } from 'react'
import { escuchar } from '../lib/realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Broadcasts the seller's real connection while the app is open/visible, so the
// admin can see who is actually online (independent of their turno on/off).
//
// Este componente ABRE el topic `presence:sellers` —vive en `Layout`, así que
// monta antes que cualquier pantalla— y por eso es el que pone la clave de
// presencia. Equipo se engancha al mismo canal por `escuchar`: pedirlo con
// `supabase.channel` devolvía este canal ya suscrito, y atarle un manejador
// lanza. Ver lib/realtime.ts.
export default function SellerPresenceTracker({ authUserId }: { authUserId?: string | null }) {
  useEffect(() => {
    if (!authUserId) return
    // El canal se guarda aparte para que `goOnline`/`goOffline` puedan
    // declararse ANTES de abrirlo: `alSuscribir` los usa, y leerlos antes de su
    // definición dependería de que la respuesta del socket llegue después.
    let canal: RealtimeChannel | null = null
    let subscribed = false
    const goOnline = () => { if (subscribed) canal?.track({ online_at: new Date().toISOString() }) }
    const goOffline = () => { if (subscribed) canal?.untrack() }

    const s = escuchar('presence:sellers', {
      config: { presence: { key: authUserId } },
      alSuscribir: estado => {
        if (estado !== 'SUBSCRIBED') return
        subscribed = true
        if (document.visibilityState === 'visible') goOnline()
      },
    })
    canal = s.canal

    const onVis = () => (document.visibilityState === 'visible' ? goOnline() : goOffline())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', goOffline)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', goOffline)
      s.cerrar()
    }
  }, [authUserId])

  return null
}
