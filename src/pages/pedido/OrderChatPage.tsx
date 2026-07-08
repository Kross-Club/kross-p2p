import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Send, Play, Pause, Mic, Phone, Package, CheckCircle2, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getSession, sendMessage, markRead } from '../../lib/order-api'
import type { OrderSession, OrderMessage } from '../../lib/order-api'

// ─── Tracker ─────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'nuevo',      label: 'Pedido',    emoji: '📋' },
  { key: 'confirmado', label: 'Confirmado',emoji: '📞' },
  { key: 'preparando', label: 'Preparando',emoji: '📦' },
  { key: 'en_camino',  label: 'En camino', emoji: '🚚' },
  { key: 'entregado',  label: 'Entregado', emoji: '✅' },
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
              style={{ height: `${h}px`, background: playing ? '#111' : '#11166' }} />
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
          {(msg.body || '').split('\n').map((line, i) => (
            <span key={i}>{line}{i < (msg.body || '').split('\n').length - 1 && <br />}</span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 mx-1">{time}</p>
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
    expired:   { title: 'Link vencido', body: 'Este link de seguimiento ya venció. Contáctanos por WhatsApp para obtener uno nuevo.' },
    error:     { title: 'Algo salió mal', body: 'No pudimos cargar tu pedido. Intenta de nuevo en unos minutos.' },
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
  const bottomRef = useRef<HTMLDivElement>(null)

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
        // Show push banner after 3s if permission not yet granted
        if (Notification.permission === 'default') {
          setTimeout(() => setShowPushBanner(true), 3000)
        }
      })
      .catch((e: Error) => setState(e.message === 'not_found' ? 'not_found' : 'error'))
  }, [token])

  // Realtime broadcast subscription
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel(`order:${session.id}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        setMessages(prev => [...prev, payload as OrderMessage])
      })
      .on('broadcast', { event: 'stage_update' }, ({ payload }) => {
        setSession(prev => prev ? { ...prev, stage: payload.stage } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !token || sending) return
    const body = input.trim()
    setInput('')
    setSending(true)
    // Optimistic update
    const optimistic: OrderMessage = {
      id: `opt-${Date.now()}`,
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
      await sendMessage(token, { type: 'text', body })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setInput(body)
    } finally {
      setSending(false)
    }
  }, [input, token, session, sending])

  const handlePushPermission = async () => {
    setShowPushBanner(false)
    const perm = await Notification.requestPermission()
    if (perm === 'granted' && token) {
      // TODO Phase 2: save push subscription via save-push-subscription Edge Function
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

      {/* ── Header azul con curva ── */}
      <div className="flex-shrink-0 px-4 pt-3 pb-5 text-white"
        style={{ background: '#55C8F5', borderRadius: '0 0 32px 32px' }}>
        <div className="flex items-center gap-3">
          {/* Logo Kross */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.25)' }}>
            <span className="text-white font-black text-base">K</span>
          </div>

          {/* Avatar Teddy */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/60">
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
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white"
              style={{ background: '#4ADE80' }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">Teddy · Kross</p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
              ¡Hola {firstName}! En línea ahora
            </p>
          </div>

          {/* Llamada — blanco, borde negro */}
          <button className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
            style={{ border: '2px solid #111' }}>
            <Phone size={16} style={{ color: '#111' }} />
          </button>
        </div>

        {/* Info pedido */}
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
              className="text-[10px] font-black text-white px-3 py-1.5 rounded-full"
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
        <div ref={bottomRef} />
      </div>

      {/* ── Nota llamada Kross (número fijo) ── */}
      <div className="flex-shrink-0 mx-4 mb-2 flex items-center gap-2 bg-white rounded-2xl px-3 py-2"
        style={{ border: '1px solid #E5E7EB' }}>
        <Phone size={12} style={{ color: '#55C8F5' }} />
        <p className="text-[10px] text-gray-500 flex-1">
          Solo te llamaremos desde <span className="font-black" style={{ color: '#55C8F5' }}>+51 1 XXX XXXX</span>
        </p>
        <CheckCircle2 size={12} style={{ color: '#55C8F5' }} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
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
    </div>
  )
}
