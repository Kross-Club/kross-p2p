import { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import { Room, RoomEvent, LocalParticipant, createLocalTracks } from 'livekit-client'
import { supabase } from '../lib/supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface IncomingCall {
  session_id: string
  room_name: string
  buyer_name: string | null
  product_name: string | null
}

type CallPhase = 'ringing' | 'connecting' | 'connected' | 'ended'

export default function IncomingCallOverlay({ storeId }: { storeId?: string }) {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null)
  const [phase, setPhase] = useState<CallPhase>('ringing')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const roomRef = useRef<Room | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen for incoming calls on store-specific channel
  useEffect(() => {
    const channelName = storeId ? `seller:${storeId}:calls` : 'seller:calls'
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        setIncoming(payload as IncomingCall)
        setPhase('ringing')
        setElapsed(0)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [storeId])

  const answer = async () => {
    if (!incoming) return
    setPhase('connecting')
    try {
      const res = await fetch(`${BASE}/seller-call-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: incoming.session_id }),
      })
      const { livekit_url, livekit_token } = await res.json() as { livekit_url: string; livekit_token: string }

      const room = new Room()
      roomRef.current = room
      room.on(RoomEvent.Disconnected, () => setPhase('ended'))

      await room.connect(livekit_url, livekit_token)
      const tracks = await createLocalTracks({ audio: true, video: false })
      for (const track of tracks) await room.localParticipant.publishTrack(track)

      setPhase('connected')
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch {
      setPhase('ended')
    }
  }

  const hangUp = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    roomRef.current?.disconnect()
    setPhase('ended')
    setTimeout(() => setIncoming(null), 1200)
  }

  const reject = () => {
    roomRef.current?.disconnect()
    setIncoming(null)
  }

  const toggleMute = () => {
    const lp: LocalParticipant | undefined = roomRef.current?.localParticipant
    if (!lp) return
    lp.audioTrackPublications.forEach(pub => {
      if (pub.track) muted ? pub.track.unmute() : pub.track.mute()
    })
    setMuted(!muted)
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  if (!incoming) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center"
        style={{ background: '#111' }}>

        {/* Bear avatar */}
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 mx-auto mb-4"
          style={{ borderColor: phase === 'connected' ? '#4ADE80' : phase === 'ringing' ? '#FFD400' : '#55C8F5' }}>
          <svg viewBox="0 0 64 64" width="96" height="96" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="32" fill="#FFF9E0"/>
            <ellipse cx="32" cy="48" rx="14" ry="11" fill="#D4A05A"/>
            <circle cx="32" cy="28" r="16" fill="#E8B86D"/>
            <circle cx="17" cy="16" r="6" fill="#D4A05A"/>
            <circle cx="47" cy="16" r="6" fill="#D4A05A"/>
            <circle cx="17" cy="16" r="3.5" fill="#F5C98A"/>
            <circle cx="47" cy="16" r="3.5" fill="#F5C98A"/>
            <ellipse cx="32" cy="31" rx="10" ry="8" fill="#F5C98A"/>
            <circle cx="26" cy="26" r="2.5" fill="#1A1A1A"/>
            <circle cx="38" cy="26" r="2.5" fill="#1A1A1A"/>
            <circle cx="26.8" cy="25.2" r="0.9" fill="white"/>
            <circle cx="38.8" cy="25.2" r="0.9" fill="white"/>
            <ellipse cx="32" cy="31" rx="2.5" ry="1.8" fill="#1A1A1A"/>
            <path d="M28.5 33.5 Q32 36.5 35.5 33.5" stroke="#1A1A1A" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        <p className="text-white font-black text-xl mb-0.5">
          {incoming.buyer_name || 'Comprador'}
        </p>
        <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {incoming.product_name || 'Pedido Kross'}
        </p>
        <p className="text-sm mb-6 font-semibold" style={{ color: phase === 'connected' ? '#4ADE80' : 'rgba(255,255,255,0.55)' }}>
          {phase === 'ringing'    && '📞 Llamada entrante…'}
          {phase === 'connecting' && 'Conectando…'}
          {phase === 'connected'  && `En llamada · ${fmt(elapsed)}`}
          {phase === 'ended'      && 'Llamada finalizada'}
        </p>

        {phase === 'connected' && (
          <div className="flex items-center justify-center gap-1 mb-8">
            {[10,18,26,18,10,26,14,22,10,18].map((h, i) => (
              <div key={i} className="w-1 rounded-full animate-pulse"
                style={{ height: `${h}px`, background: '#4ADE80', animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}
        {phase !== 'connected' && <div className="mb-8" />}

        {/* Ringing: answer / reject */}
        {phase === 'ringing' && (
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button onClick={reject}
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: '#EF4444' }}>
                <PhoneOff size={26} className="text-white" />
              </button>
              <p className="text-xs text-gray-400">Rechazar</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onClick={answer}
                className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                style={{ background: '#4ADE80' }}>
                <Phone size={26} className="text-white" />
              </button>
              <p className="text-xs text-gray-400">Contestar</p>
            </div>
          </div>
        )}

        {/* Connecting */}
        {phase === 'connecting' && (
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {/* Connected: mute / hang up */}
        {phase === 'connected' && (
          <div className="flex items-center justify-center gap-6">
            <button onClick={toggleMute}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }}>
              {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={hangUp}
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: '#EF4444' }}>
              <PhoneOff size={26} className="text-white" />
            </button>
          </div>
        )}

        {/* Ended */}
        {phase === 'ended' && (
          <button onClick={() => setIncoming(null)}
            className="w-full py-3 rounded-2xl font-black text-sm"
            style={{ background: '#FFD400', color: '#111' }}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}
