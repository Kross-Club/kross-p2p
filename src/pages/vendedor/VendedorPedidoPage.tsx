import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Phone, PhoneOff, Mic, MicOff, Package, ArrowLeft, CheckCircle2, Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useKrossStore } from '../../store'
import IncomingCallOverlay from '../../components/IncomingCallOverlay'
import type { OrderSession, OrderMessage } from '../../lib/order-api'
import type { RealtimeChannel } from '@supabase/supabase-js'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const STAGES = ['nuevo','confirmado','preparando','en_camino','entregado']

// ─── Seller-initiated call modal ──────────────────────────────────────────────
type CallState = 'connecting' | 'connected' | 'ended' | 'error'

function SellerCallModal({
  sessionId,
  channelRef,
  onClose,
}: {
  sessionId: string
  channelRef: React.RefObject<RealtimeChannel | null>
  onClose: () => void
}) {
  const [callState, setCallState] = useState<CallState>('connecting')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const roomRef = useRef<InstanceType<typeof import('livekit-client')['Room']> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioEls = useRef<HTMLAudioElement[]>([])
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    async function connect() {
      try {
        const res = await fetch(`${BASE}/seller-call-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        if (!res.ok) throw new Error('token_failed')
        const { livekit_url, livekit_token } = await res.json() as { livekit_url: string; livekit_token: string }

        const { Room, RoomEvent, createLocalTracks, Track } = await import('livekit-client')
        const room = new Room()
        roomRef.current = room

        room.on(RoomEvent.Disconnected, () => { if (!cancelled) setCallState('ended') })

        // End call when remote party hangs up
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!cancelled && room.remoteParticipants.size === 0) {
            if (timerRef.current) clearInterval(timerRef.current)
            setCallState('ended')
            setTimeout(onClose, 1500)
          }
        })

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach()
            el.autoplay = true
            el.setAttribute('playsinline', '')
            document.body.appendChild(el)
            el.play().catch(() => {})
            audioEls.current.push(el)
          }
        })

        await room.connect(livekit_url, livekit_token)
        const tracks = await createLocalTracks({ audio: true, video: false })
        for (const track of tracks) await room.localParticipant.publishTrack(track)

        if (!cancelled) {
          // Wake lock: keep screen on during call
          if ('wakeLock' in navigator) {
            (navigator as any).wakeLock.request('screen')
              .then((wl: any) => { wakeLockRef.current = wl })
              .catch(() => {})
          }
          // MediaSession: keep audio alive in background
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: 'En llamada · Kross',
              artist: 'Cliente',
            })
            navigator.mediaSession.playbackState = 'playing'
          }
          setCallState('connected')
          timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
          // Notify buyer that seller is calling
          channelRef.current?.send({
            type: 'broadcast',
            event: 'seller_call_request',
            payload: { session_id: sessionId },
          })
        }
      } catch {
        if (!cancelled) setCallState('error')
      }
    }
    connect()
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      wakeLockRef.current?.release(); wakeLockRef.current = null
      audioEls.current.forEach(el => { el.srcObject = null; el.remove() })
      audioEls.current = []
      roomRef.current?.disconnect()
    }
  }, [sessionId])

  const toggleMute = () => {
    const lp = roomRef.current?.localParticipant
    if (!lp) return
    lp.audioTrackPublications.forEach(pub => {
      if (pub.track) muted ? pub.track.unmute() : pub.track.mute()
    })
    setMuted(!muted)
  }

  const hangUp = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    wakeLockRef.current?.release(); wakeLockRef.current = null
    audioEls.current.forEach(el => { el.srcObject = null; el.remove() })
    audioEls.current = []
    roomRef.current?.disconnect()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    setCallState('ended')
    setTimeout(onClose, 1200)
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center" style={{ background: '#111' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
          style={{ background: callState === 'connected' ? '#4ADE80' : callState === 'error' ? '#EF4444' : '#FFD400' }}>
          📞
        </div>
        <p className="text-white font-black text-xl mb-1">Llamada al cliente</p>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {callState === 'connecting' && 'Esperando que conteste…'}
          {callState === 'connected' && `En llamada · ${fmt(elapsed)}`}
          {callState === 'ended' && 'Llamada finalizada'}
          {callState === 'error' && 'No se pudo conectar'}
        </p>

        {callState === 'connected' && (
          <div className="flex items-center justify-center gap-1 mb-8">
            {[10,18,26,18,10,26,14,22,10,18].map((h, i) => (
              <div key={i} className="w-1 rounded-full animate-pulse"
                style={{ height: `${h}px`, background: '#4ADE80', animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}
        {callState !== 'connected' && <div className="mb-8" />}

        {(callState === 'connecting' || callState === 'connected') && (
          <div className="flex items-center justify-center gap-6">
            <button onClick={toggleMute}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }}>
              {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={hangUp}
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: '#EF4444' }}>
              <PhoneOff size={26} className="text-white" />
            </button>
          </div>
        )}

        {(callState === 'ended' || callState === 'error') && (
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl font-black text-sm"
            style={{ background: '#FFD400', color: '#111' }}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Stage selector ───────────────────────────────────────────────────────────
function StageSelector({ current, sessionId, channelRef, onUpdate }: {
  current: string
  sessionId: string
  channelRef: React.RefObject<RealtimeChannel | null>
  onUpdate: (s: string) => void
}) {
  const stageLabel: Record<string, string> = {
    nuevo: 'Nuevo', confirmado: 'Confirmado', preparando: 'Preparando', en_camino: 'En camino', entregado: 'Entregado'
  }

  const advance = async () => {
    const idx = STAGES.indexOf(current)
    if (idx >= STAGES.length - 1) return
    const next = STAGES[idx + 1]
    const { error } = await supabase.from('order_sessions').update({ stage: next }).eq('id', sessionId)
    if (!error) {
      onUpdate(next)
      channelRef.current?.send({
        type: 'broadcast', event: 'stage_update', payload: { stage: next }
      })
    }
  }

  const idx = STAGES.indexOf(current)
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100">
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Estado:</span>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#55C8F5', color: 'white' }}>
        {stageLabel[current] || current}
      </span>
      {idx < STAGES.length - 1 && (
        <button onClick={advance}
          className="ml-auto text-[10px] font-black px-3 py-1 rounded-full"
          style={{ background: '#FFD400', color: '#111' }}>
          → {stageLabel[STAGES[idx + 1]]}
        </button>
      )}
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: OrderMessage }) {
  const isSeller = msg.sender_role === 'seller'
  const time = new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  if (msg.type === 'status_update') {
    return (
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1 shadow-sm" style={{ border: '1px solid #55C8F5' }}>
          <Package size={11} style={{ color: '#55C8F5' }} />
          <p className="text-[11px] font-semibold" style={{ color: '#55C8F5' }}>{msg.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isSeller ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] flex flex-col ${isSeller ? 'items-end' : 'items-start'}`}>
        {!isSeller && <p className="text-[9px] text-gray-400 mb-0.5 ml-1">{msg.sender_name || 'Cliente'}</p>}
        <div className="px-4 py-2.5 rounded-2xl text-sm"
          style={isSeller
            ? { background: '#FFD400', color: '#111', fontWeight: 600, borderRadius: '18px 18px 4px 18px' }
            : { background: '#55C8F5', color: 'white', borderRadius: '18px 18px 18px 4px' }
          }>
          {(msg.body || '').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 mx-1">{time}</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function VendedorPedidoPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { currentUser } = useKrossStore()

  const [session, setSession] = useState<OrderSession | null>(null)
  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [buyerTyping, setBuyerTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load session by token
  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetch(`${BASE}/get-session`, {
      headers: { Authorization: `Bearer ${ANON}`, 'x-kross-token': token },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ session: s, messages: m }: { session: OrderSession; messages: OrderMessage[] }) => {
        setSession(s)
        setMessages(m)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  // Realtime
  useEffect(() => {
    if (!session) return
    const ch = supabase.channel(`order:${session.id}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const msg = payload as OrderMessage
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev.filter(m => !(m.id.startsWith('opt-') && m.sender_role === msg.sender_role)), msg]
        })
      })
      .on('broadcast', { event: 'stage_update' }, ({ payload }) => {
        setSession(prev => prev ? { ...prev, stage: payload.stage as OrderSession['stage'] } : prev)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.role === 'buyer') {
          setBuyerTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setBuyerTyping(false), 3000)
        }
      })
      .subscribe()
    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [session?.id])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, buyerTyping])

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !session) return
    if (sendTypingTimerRef.current) return
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { role: 'seller' } })
    sendTypingTimerRef.current = setTimeout(() => { sendTypingTimerRef.current = null }, 2000)
  }, [session])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !session || sending) return
    const body = input.trim()
    setInput('')
    setSending(true)
    const optimisticId = `opt-${Date.now()}`
    const optimistic: OrderMessage = {
      id: optimisticId,
      session_id: session.id,
      sender_role: 'seller',
      sender_name: currentUser.nombre,
      type: 'text',
      body,
      media_url: null,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages(prev => [...prev, optimistic])
    try {
      const res = await fetch(`${BASE}/seller-send-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          seller_name: currentUser.nombre,
          body,
          type: 'text',
        }),
      })
      if (!res.ok) throw new Error('send_failed')
      const saved: OrderMessage = await res.json()
      // Replace optimistic with real message; seller-send-message already broadcasts to buyer
      setMessages(prev => prev.map(m => m.id === optimisticId ? saved : m))
      // Also broadcast so this seller view deduplicates cleanly
      channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: saved })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setInput(body)
    } finally {
      setSending(false)
    }
  }, [input, session, sending, currentUser.nombre])

  if (loading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center" style={{ background: '#FFFDF5' }}>
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col h-screen items-center justify-center px-8 text-center" style={{ background: '#FFFDF5' }}>
        <Package size={40} className="text-gray-300 mb-4" />
        <p className="font-black text-gray-800">Sesión no encontrada</p>
        <button onClick={() => navigate('/vendedor/chats')} className="mt-4 text-sm text-[#55C8F5] font-semibold">
          Volver a chats
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto" style={{ background: '#FFFDF5' }}>

      {/* IncomingCallOverlay — disabled when seller already has a call open */}
      <IncomingCallOverlay storeId={currentUser.tiendaId} disabled={showCall} />

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-4 text-white"
        style={{ background: '#111', borderRadius: '0 0 24px 24px' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/vendedor/chats')}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <ArrowLeft size={18} className="text-white" />
          </button>

          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg font-black"
            style={{ background: '#FFD400', color: '#111' }}>
            {(session.buyer_name || 'C')[0]}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">{session.buyer_name || 'Comprador'}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {session.product_name} · {session.pack_name || `S/${session.product_price}`}
            </p>
          </div>

          <button
            onClick={() => channelRef.current?.send({ type: 'broadcast', event: 'request_push_permission', payload: {} })}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            title="Invitar al cliente a activar notificaciones">
            <Bell size={16} className="text-white" />
          </button>
          <button onClick={() => setShowCall(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#4ADE80' }}>
            <Phone size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* Stage selector */}
      <StageSelector
        current={session.stage}
        sessionId={session.id}
        channelRef={channelRef}
        onUpdate={stage => setSession(s => s ? { ...s, stage: stage as OrderSession['stage'] } : s)}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <CheckCircle2 size={40} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Sin mensajes aún</p>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

        {/* Typing indicator */}
        {buyerTyping && (
          <div className="flex justify-start mb-3">
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl"
              style={{ background: '#55C8F5', borderRadius: '18px 18px 18px 4px' }}>
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'white', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); broadcastTyping() }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Escribe al cliente…"
            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none placeholder-gray-400"
            style={{ background: '#F0F0F0' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm disabled:opacity-40"
            style={{ background: '#111' }}>
            <Send size={16} />
          </button>
        </div>
      </div>

      {showCall && session && (
        <SellerCallModal
          sessionId={session.id}
          channelRef={channelRef}
          onClose={() => setShowCall(false)}
        />
      )}
    </div>
  )
}
