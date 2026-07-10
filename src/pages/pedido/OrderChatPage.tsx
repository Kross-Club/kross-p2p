import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Send, Play, Pause, Mic, Phone, PhoneOff, Package, CheckCircle2, Truck, MicOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getSession, sendMessage, markRead } from '../../lib/order-api'
import { subscribePush } from '../../lib/push'
import { startRingtone } from '../../lib/ringtone'
import { sendCallReject, sendCallCancel, listenCallReject, listenCallCancel } from '../../lib/call-signal'
import InstallBanner from '../../components/InstallBanner'
import type { OrderSession, OrderMessage } from '../../lib/order-api'
import type { RealtimeChannel } from '@supabase/supabase-js'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Tracker ─────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'nuevo',      label: 'Pedido',     emoji: '📋' },
  { key: 'confirmado', label: 'Confirmado', emoji: '📞' },
  { key: 'preparando', label: 'Preparando', emoji: '📦' },
  { key: 'en_camino',  label: 'En camino',  emoji: '🚚' },
  { key: 'entregado',  label: 'Entregado',  emoji: '✅' },
]
const STAGE_ORDER = ['nuevo','confirmado','preparando','en_camino','entregado']

function OrderTracker({ stage }: { stage: string }) {
  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(stage))
  return (
    <div className="mx-4 mt-3 mb-1 bg-white rounded-2xl px-4 py-3 shadow-sm" style={{ border: '1.5px solid #F0F0F0' }}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-2.5" style={{ color: '#55C8F5' }}>
        Estado de tu pedido
      </p>
      <div className="flex items-center">
        {STAGES.map((s, i) => {
          const done = STAGE_ORDER.indexOf(s.key) <= currentIdx
          const isCurrent = STAGE_ORDER.indexOf(s.key) === currentIdx
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={isCurrent
                    ? { background: '#FFD400', border: '2.5px solid #111', fontSize: 15 }
                    : done
                    ? { background: '#55C8F5', fontSize: 14 }
                    : { background: '#F3F4F6', fontSize: 14 }
                  }
                >
                  {s.emoji}
                </div>
                <p className="text-[8px] font-bold text-center leading-tight w-12"
                  style={{ color: isCurrent ? '#111' : done ? '#55C8F5' : '#9CA3AF' }}>
                  {s.label}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex-1 h-0.5 mx-1 mb-4 rounded-full"
                  style={{ background: STAGE_ORDER.indexOf(STAGES[i+1].key) <= currentIdx ? '#55C8F5' : '#E5E7EB' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Audio bubble ─────────────────────────────────────────────────────────────
function AudioBubble({ durationLabel }: { durationLabel?: string }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px]" style={{ background: '#FFD400' }}>
      <button onClick={() => setPlaying(!playing)}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: '#111', color: '#FFD400' }}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className="flex items-end gap-0.5 h-6">
          {[4,9,14,7,16,11,6,18,8,5,13,9,12,16,7,11,4,13,9,6,15,10].map((h, i) => (
            <div key={i} className="w-0.5 rounded-full"
              style={{ height: `${h}px`, background: '#111' }} />
          ))}
        </div>
        <p className="text-[11px] mt-1 font-bold" style={{ color: '#111' }}>{durationLabel || '0:42'}</p>
      </div>
      <Mic size={14} style={{ color: '#111' }} />
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: OrderMessage }) {
  const isBuyer = msg.sender_role === 'buyer'
  const time = new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  if (msg.type === 'audio') {
    return (
      <div className={`flex ${isBuyer ? 'justify-end' : 'justify-start'} mb-3`}>
        <div>
          <AudioBubble />
          <p className="text-[10px] text-gray-400 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

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

  if (msg.type === 'call_log') {
    return (
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1">
          <Phone size={11} className="text-gray-400" />
          <p className="text-[11px] text-gray-400">{msg.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isBuyer ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] flex flex-col ${isBuyer ? 'items-end' : 'items-start'}`}>
        <div className="px-4 py-2.5 rounded-2xl text-sm"
          style={isBuyer
            ? { background: '#55C8F5', color: 'white', borderRadius: '18px 18px 4px 18px' }
            : { background: '#FFD400', color: '#111', fontWeight: 600, borderRadius: '18px 18px 18px 4px' }
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

// ─── Call modal (buyer initiates or answers seller call) ──────────────────────
type CallState = 'connecting' | 'connected' | 'ended' | 'error'

function CallModal({ token, sessionId, buyerName, sellerName, sellerRole, onClose }: { token: string; sessionId: string; buyerName: string; sellerName?: string | null; sellerRole?: string | null; onClose: () => void }) {
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
        const res = await fetch(`${BASE}/create-call-token`, {
          headers: { Authorization: `Bearer ${ANON}`, 'x-kross-token': token },
        })
        if (!res.ok) throw new Error('token_failed')
        const { livekit_url, livekit_token } = await res.json() as { livekit_url: string; livekit_token: string }

        const { Room, RoomEvent, createLocalTracks, Track } = await import('livekit-client')

        const room = new Room()
        roomRef.current = room

        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setCallState('ended')
        })

        // End call when remote party hangs up
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!cancelled && room.remoteParticipants.size === 0) {
            if (timerRef.current) clearInterval(timerRef.current)
            setCallState('ended')
            setTimeout(onClose, 1500)
          }
        })

        // Only mark "connected" when the other party actually joins
        room.on(RoomEvent.ParticipantConnected, () => {
          if (!cancelled) {
            setCallState('connected')
            if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
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
          if ('wakeLock' in navigator) {
            (navigator as any).wakeLock.request('screen')
              .then((wl: any) => { wakeLockRef.current = wl })
              .catch(() => {})
          }
          // MediaSession: keep audio alive in background
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: 'En llamada · Kross',
              artist: 'Teddy · Kross',
            })
            navigator.mediaSession.playbackState = 'playing'
          }
          // Answering a seller call: they're already in the room → connected.
          // Buyer-initiated call: wait for the seller to answer.
          if (room.remoteParticipants.size > 0) {
            setCallState('connected')
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
          }
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
  }, [token])

  const toggleMute = () => {
    const lp = roomRef.current?.localParticipant
    if (!lp) return
    lp.audioTrackPublications.forEach(pub => {
      if (pub.track) muted ? pub.track.unmute() : pub.track.mute()
    })
    setMuted(!muted)
  }

  const endCall = (notifyRemote: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current)
    wakeLockRef.current?.release(); wakeLockRef.current = null
    audioEls.current.forEach(el => { el.srcObject = null; el.remove() })
    audioEls.current = []
    // If the other side never joined the room, tell them to stop ringing
    if (notifyRemote && (roomRef.current?.remoteParticipants.size ?? 0) === 0) {
      sendCallCancel(sessionId)
    }
    roomRef.current?.disconnect()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    setCallState('ended')
    setTimeout(onClose, 1200)
  }

  const hangUp = () => endCall(true)

  // The callee rejected while we were still waiting — end on this side too
  useEffect(() => listenCallReject(sessionId, () => endCall(false)), [sessionId])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={e => e.target === e.currentTarget && callState === 'ended' && onClose()}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center"
        style={{ background: '#111' }}>

        <div className="w-24 h-24 rounded-full overflow-hidden border-4 mx-auto mb-4"
          style={{ borderColor: callState === 'connected' ? '#4ADE80' : callState === 'error' ? '#EF4444' : '#FFD400' }}>
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

        <p className="text-white font-black text-xl mb-1">
          {sellerName ? `${sellerName.split(' ')[0]}${sellerRole ? ` · ${sellerRole}` : ''}` : 'Kross'}
        </p>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {callState === 'connecting' && 'Llamando…'}
          {callState === 'connected' && `En llamada · ${fmt(elapsed)}`}
          {callState === 'ended' && 'Llamada finalizada'}
          {callState === 'error' && 'No se pudo conectar'}
        </p>

        {callState === 'connected' && (
          <div className="flex items-center justify-center gap-1 mb-8">
            {[12,20,28,20,12,28,16,24,12,20].map((h, i) => (
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

        <p className="text-[10px] mt-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Hola {buyerName}, solo Kross puede llamarte desde este número
        </p>
      </div>
    </div>
  )
}

// ─── Incoming call from seller ────────────────────────────────────────────────
function BuyerIncomingCall({ sessionId, onAnswer, onReject, sellerName, sellerRole }: { sessionId: string; onAnswer: () => void; onReject: () => void; sellerName?: string | null; sellerRole?: string | null }) {
  useEffect(() => {
    const stop = startRingtone()
    return stop
  }, [])

  // The seller hung up before we answered — stop ringing
  useEffect(() => listenCallCancel(sessionId, onReject), [sessionId])

  const reject = () => {
    sendCallReject(sessionId)
    onReject()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center" style={{ background: '#111' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl animate-bounce"
          style={{ background: '#FFD400' }}>📞</div>
        <p className="text-white font-black text-xl mb-1">
          {sellerName ? `${sellerName.split(' ')[0]}${sellerRole ? ` · ${sellerRole}` : ''}` : 'Kross'}
        </p>
        <p className="text-sm mb-8 font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Llamada entrante…
        </p>
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
            <button onClick={onAnswer}
              className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
              style={{ background: '#4ADE80' }}>
              <Phone size={26} className="text-white" />
            </button>
            <p className="text-xs text-gray-400">Contestar</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="flex flex-col h-screen" style={{ background: '#55C8F5' }}>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Package size={32} className="text-white/60" />
          </div>
          <p className="font-black text-lg">Cargando tu pedido…</p>
          <p className="text-white/70 text-sm mt-1">Un momento</p>
        </div>
      </div>
    </div>
  )
}

// ─── Error states ─────────────────────────────────────────────────────────────
function ErrorPage({ type }: { type: 'not_found' | 'expired' | 'error' }) {
  const msgs = {
    not_found: { title: 'Pedido no encontrado', body: 'El link que usaste no es válido. Revisa el mensaje que te enviamos por WhatsApp.' },
    expired:   { title: 'Link vencido',         body: 'Este link de seguimiento ya venció. Contáctanos por WhatsApp para obtener uno nuevo.' },
    error:     { title: 'Algo salió mal',        body: 'No pudimos cargar tu pedido. Intenta de nuevo en unos minutos.' },
  }
  const { title, body } = msgs[type]
  return (
    <div className="flex flex-col h-screen items-center justify-center px-8 text-center" style={{ background: '#FFFDF5' }}>
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: '#FFD400' }}>
        <Package size={36} style={{ color: '#111' }} />
      </div>
      <p className="font-black text-xl text-gray-900 mb-2">{title}</p>
      <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrderChatPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<'loading' | 'not_found' | 'expired' | 'error' | 'ok'>('loading')
  const [session, setSession] = useState<OrderSession | null>(null)
  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showPushBanner, setShowPushBanner] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [sellerCalling, setSellerCalling] = useState(false)
  const [sellerTyping, setSellerTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load session
  useEffect(() => {
    if (!token) { setState('not_found'); return }
    getSession(token)
      .then(({ session: s, messages: m }) => {
        if (s.status === 'expired') { setState('expired'); return }
        setSession(s)
        setMessages(m)
        setState('ok')
        markRead(token).catch(() => {})
        // If already granted, subscribe silently; else show banner after delay
        if (Notification.permission === 'granted') {
          subscribePush({ sessionId: s.id, role: 'buyer' }).catch(() => {})
        } else if (Notification.permission === 'default') {
          setTimeout(() => setShowPushBanner(true), 3000)
        }
      })
      .catch((e: Error) => setState(e.message === 'not_found' ? 'not_found' : 'error'))
  }, [token])

  // Realtime broadcast subscription
  useEffect(() => {
    if (!session) return
    const ch = supabase
      .channel(`order:${session.id}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const msg = payload as OrderMessage
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          // Replace optimistic message from same role if exists
          return [...prev.filter(m => !(m.id.startsWith('opt-') && m.sender_role === msg.sender_role)), msg]
        })
      })
      .on('broadcast', { event: 'stage_update' }, ({ payload }) => {
        setSession(prev => prev ? { ...prev, stage: payload.stage } : prev)
      })
      .on('broadcast', { event: 'assignment_update' }, ({ payload }) => {
        setSession(prev => prev ? {
          ...prev,
          seller_name: payload.seller_name ?? prev.seller_name,
          seller_role: payload.seller_role ?? prev.seller_role,
          seller_avatar: payload.seller_avatar ?? prev.seller_avatar,
        } : prev)
      })
      .on('broadcast', { event: 'seller_call_request' }, () => {
        setSellerCalling(true)
      })
      .on('broadcast', { event: 'request_push_permission' }, () => {
        if (Notification.permission !== 'granted') {
          setShowPushBanner(true)
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.role === 'seller') {
          setSellerTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setSellerTyping(false), 3000)
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
  }, [messages.length, sellerTyping])

  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !session) return
    if (sendTypingTimerRef.current) return // debounce — only send once per 2s
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { role: 'buyer' } })
    sendTypingTimerRef.current = setTimeout(() => { sendTypingTimerRef.current = null }, 2000)
  }, [session])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !token || sending) return
    const body = input.trim()
    setInput('')
    setSending(true)
    const optimisticId = `opt-${Date.now()}`
    const optimistic: OrderMessage = {
      id: optimisticId,
      session_id: session!.id,
      sender_role: 'buyer',
      sender_name: session?.buyer_name ?? null,
      type: 'text',
      body,
      media_url: null,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages(prev => [...prev, optimistic])
    try {
      const saved = await sendMessage(token, { type: 'text', body })
      // Replace optimistic with real message and broadcast to seller
      setMessages(prev => prev.map(m => m.id === optimisticId ? saved : m))
      channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: saved })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setInput(body)
    } finally {
      setSending(false)
    }
  }, [input, token, session, sending])

  const handlePushPermission = async () => {
    setShowPushBanner(false)
    if (session) {
      await subscribePush({ sessionId: session.id, role: 'buyer' })
    }
  }

  if (state === 'loading') return <Skeleton />
  if (state === 'not_found') return <ErrorPage type="not_found" />
  if (state === 'expired') return <ErrorPage type="expired" />
  if (state === 'error') return <ErrorPage type="error" />
  if (!session) return null

  const firstName = session.buyer_name?.split(' ')[0] ?? 'Cliente'

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto" style={{ background: '#FFFDF5' }}>
      <InstallBanner />

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-3 pb-5 text-white"
        style={{ background: '#55C8F5', borderRadius: '0 0 32px 32px' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.25)' }}>
            <span className="text-white font-black text-base">K</span>
          </div>

          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/60">
              {session?.seller_avatar ? (
                <img src={session.seller_avatar} alt={session.seller_name ?? 'Vendedor'}
                  className="w-full h-full object-cover" />
              ) : (
              <svg viewBox="0 0 64 64" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
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
                <ellipse cx="32" cy="13" rx="13" ry="4" fill="#55C8F5"/>
                <rect x="19" y="9" width="26" height="8" rx="4" fill="#55C8F5"/>
                <rect x="23" y="6" width="18" height="7" rx="3.5" fill="#2BB5EE"/>
                <circle cx="32" cy="6" r="2.5" fill="#FFD400"/>
              </svg>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white"
              style={{ background: '#4ADE80' }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">
              {session?.seller_name
                ? `${session.seller_name.split(' ')[0]}${session.seller_role ? ` · ${session.seller_role}` : ' · Kross'}`
                : 'Kross'}
            </p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
              ¡Hola {firstName}! En línea ahora
            </p>
          </div>

          <button
            onClick={() => setShowCall(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
            style={{ border: '2px solid #111' }}>
            <Phone size={16} style={{ color: '#111' }} />
          </button>
        </div>

        <div className="mt-3 rounded-2xl px-3 py-2 flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.2)' }}>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {session.pack_name || 'Tu pedido'}
            </p>
            <p className="text-sm font-black text-white truncate max-w-[200px]">
              {session.product_name || 'Producto Kross'}
            </p>
          </div>
          <p className="font-black text-lg text-white flex-shrink-0 ml-2">
            {session.product_price ? `S/${session.product_price}` : ''}
          </p>
        </div>
      </div>

      {/* ── Tracker ── */}
      <div className="flex-shrink-0">
        <OrderTracker stage={session.stage} />
      </div>

      {/* ── Push banner ── */}
      {showPushBanner && (
        <div className="flex-shrink-0 mx-4 mt-2 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: '#FFFBE6', border: '1.5px solid #FFD400' }}>
          <span className="text-xl flex-shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-gray-900">¿Te avisamos cuando el motorizado esté en camino?</p>
            <p className="text-[10px] text-gray-500">Notificación cuando salga tu pedido</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setShowPushBanner(false)}
              className="text-[10px] text-gray-400 font-semibold">No</button>
            <button onClick={handlePushPermission}
              className="text-[10px] font-black px-3 py-1.5 rounded-full"
              style={{ background: '#FFD400', color: '#111' }}>
              Sí
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Truck size={40} style={{ color: '#55C8F5' }} className="mb-3 opacity-40" />
            <p className="text-sm text-gray-400">Tu pedido está en camino.<br/>Pronto recibirás novedades aquí.</p>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

        {/* Typing indicator */}
        {sellerTyping && (
          <div className="flex justify-start mb-3">
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl"
              style={{ background: '#FFD400', borderRadius: '18px 18px 18px 4px' }}>
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#111', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Nota llamada Kross ── */}
      <div className="flex-shrink-0 mx-4 mb-2 flex items-center gap-2 bg-white rounded-2xl px-3 py-2"
        style={{ border: '1px solid #E5E7EB' }}>
        <Phone size={12} style={{ color: '#55C8F5' }} />
        <p className="text-[10px] text-gray-500 flex-1">
          Toca el ícono 📞 arriba para llamar a Teddy directamente
        </p>
        <CheckCircle2 size={12} style={{ color: '#55C8F5' }} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); broadcastTyping() }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Escribe tu mensaje…"
            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none placeholder-gray-400"
            style={{ background: '#F0F0F0' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm disabled:opacity-40"
            style={{ background: '#55C8F5' }}>
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* ── Call modals ── */}
      {sellerCalling && !showCall && (
        <BuyerIncomingCall
          sessionId={session.id}
          onAnswer={() => { setSellerCalling(false); setShowCall(true) }}
          onReject={() => setSellerCalling(false)}
          sellerName={session?.seller_name}
          sellerRole={session?.seller_role}
        />
      )}

      {showCall && token && (
        <CallModal
          token={token}
          sessionId={session.id}
          buyerName={firstName}
          sellerName={session?.seller_name}
          sellerRole={session?.seller_role}
          onClose={() => setShowCall(false)}
        />
      )}
    </div>
  )
}
