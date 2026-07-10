import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { startRingtone } from '../lib/ringtone'
import { sendCallReject, listenCallCancel } from '../lib/call-signal'

interface IncomingCall {
  session_id: string
  token: string
  seller_name: string | null
  seller_role: string | null
  seller_avatar: string | null
  product_name: string | null
}

function getBuyerId(): string | null {
  try {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) return null
    return JSON.parse(raw)?.buyer?.id ?? null
  } catch {
    return null
  }
}

// Rings the buyer for an incoming call ANYWHERE in the app (not just the chat).
export default function BuyerCallListener() {
  const navigate = useNavigate()
  const [call, setCall] = useState<IncomingCall | null>(null)
  const [buyerId, setBuyerId] = useState<string | null>(getBuyerId())
  const stopRingRef = useRef<(() => void) | null>(null)

  // Keep buyerId in sync if they log in/out during the session
  useEffect(() => {
    const h = () => setBuyerId(getBuyerId())
    window.addEventListener('storage', h)
    window.addEventListener('buyer-session-changed', h)
    return () => {
      window.removeEventListener('storage', h)
      window.removeEventListener('buyer-session-changed', h)
    }
  }, [])

  useEffect(() => {
    if (!buyerId) return
    const ch = supabase
      .channel(`buyer:${buyerId}:calls`)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        const c = payload as IncomingCall
        // If already inside that order's chat, its own overlay handles it.
        if (window.location.pathname === `/p/${c.token}`) return
        setCall(c)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [buyerId])

  // Ring + listen for the seller cancelling before we answer
  useEffect(() => {
    if (!call) return
    stopRingRef.current = startRingtone()
    const off = listenCallCancel(call.session_id, () => dismiss())
    return () => { stopRingRef.current?.(); stopRingRef.current = null; off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.session_id])

  const dismiss = () => { stopRingRef.current?.(); stopRingRef.current = null; setCall(null) }

  const answer = () => {
    const token = call?.token
    dismiss()
    if (token) navigate(`/p/${token}?call=1`)
  }

  const reject = () => {
    if (call) sendCallReject(call.session_id)
    dismiss()
  }

  if (!call) return null

  const title = call.seller_name
    ? `${call.seller_name.split(' ')[0]}${call.seller_role ? ` · ${call.seller_role}` : ''}`
    : 'Kross'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center" style={{ background: '#111' }}>
        <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center mx-auto mb-4 text-3xl animate-bounce border-4"
          style={{ background: '#FFD400', borderColor: '#FFD400' }}>
          {call.seller_avatar
            ? <img src={call.seller_avatar} alt={title} className="w-full h-full object-cover" />
            : '📞'}
        </div>
        <p className="text-white font-black text-xl mb-1">{title}</p>
        <p className="text-sm mb-8 font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Llamada entrante…
        </p>
        <div className="flex items-center justify-center gap-10">
          <div className="flex flex-col items-center gap-2">
            <button onClick={reject} className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#EF4444' }}>
              <PhoneOff size={26} className="text-white" />
            </button>
            <p className="text-xs text-gray-400">Rechazar</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={answer} className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse" style={{ background: '#4ADE80' }}>
              <Phone size={26} className="text-white" />
            </button>
            <p className="text-xs text-gray-400">Contestar</p>
          </div>
        </div>
      </div>
    </div>
  )
}
