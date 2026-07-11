import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, MapPin, MessageCircle, Share2, Gift, Check, Star, Lock } from 'lucide-react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface ScoreState { score: number; puntos: number; done: string[] }

function todayKey() {
  const d = new Date()
  return `daily:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BENEFITS = [
  { min: 50, label: 'Contraentrega sin adelanto', icon: '📦' },
  { min: 75, label: 'Prioridad en el despacho', icon: '⚡' },
  { min: 90, label: 'Ofertas exclusivas y envíos gratis', icon: '🎁' },
]

export default function ScorePage() {
  const navigate = useNavigate()
  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [state, setState] = useState<ScoreState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [game, setGame] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('buyer_session')
    if (!raw) { navigate('/acceso', { replace: true }); return }
    const id = JSON.parse(raw)?.buyer?.id
    if (!id) { navigate('/acceso', { replace: true }); return }
    setBuyerId(id)
    fetch(`${BASE}/buyer-score`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', buyer_id: id }),
    }).then(r => r.json()).then(setState).catch(() => setState({ score: 50, puntos: 0, done: [] }))
  }, [navigate])

  const syncLocal = (s: ScoreState) => {
    try {
      const raw = localStorage.getItem('buyer_session')
      if (!raw) return
      const parsed = JSON.parse(raw)
      parsed.buyer.score = s.score
      parsed.buyer.puntos = s.puntos
      localStorage.setItem('buyer_session', JSON.stringify(parsed))
    } catch { /* ignore */ }
  }

  const claim = async (key: string) => {
    if (!buyerId) return
    setBusy(key)
    try {
      const res = await fetch(`${BASE}/buyer-score`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', buyer_id: buyerId, action_key: key }),
      })
      const s = await res.json() as ScoreState
      setState(s)
      syncLocal(s)
    } finally {
      setBusy(null)
    }
  }

  const verifyGps = () => {
    if (!('geolocation' in navigator)) { claim('address_gps'); return }
    setBusy('address_gps')
    navigator.geolocation.getCurrentPosition(
      () => claim('address_gps'),
      () => { setBusy(null); alert('Necesitamos tu ubicación para verificar la dirección.') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const share = async () => {
    const data = { title: 'Kross', text: '¡Compra sin adelanto y paga al recibir en Kross! 🛍️', url: window.location.origin }
    try {
      if (navigator.share) { await navigator.share(data); await claim('share') }
      else { await navigator.clipboard.writeText(data.url); alert('Enlace copiado ¡compártelo!'); await claim('share') }
    } catch { /* user cancelled */ }
  }

  if (!state) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFDF5' }}>
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" />
    </div>
  }

  const done = new Set(state.done)
  const dailyDone = done.has(todayKey())
  const scoreColor = state.score >= 80 ? '#4ADE80' : state.score >= 50 ? '#FFD400' : '#EF4444'

  const actions = [
    { key: 'identity', icon: ShieldCheck, title: 'Verifica tu identidad', desc: 'Confirma tu DNI', pts: 15, onClick: () => claim('identity') },
    { key: 'address_gps', icon: MapPin, title: 'Verifica tu dirección', desc: 'Con tu ubicación GPS', pts: 10, onClick: verifyGps },
    { key: 'whatsapp', icon: MessageCircle, title: 'Verifica tu WhatsApp', desc: 'Confirma tu número', pts: 10, onClick: () => claim('whatsapp') },
    { key: 'share', icon: Share2, title: 'Comparte con un amigo', desc: 'Invita y gana puntos', pts: 5, onClick: share },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#FFFDF5' }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-8 text-white" style={{ background: 'linear-gradient(135deg, #55C8F5 0%, #863bff 100%)' }}>
        <div className="max-w-[430px] mx-auto">
          <button onClick={() => navigate('/mis-pedidos')} className="w-9 h-9 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                  strokeDasharray={`${state.score} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-black text-2xl">{state.score}</span>
                <span className="text-[9px] text-white/70">/ 100</span>
              </div>
            </div>
            <div>
              <p className="font-black text-2xl leading-tight">Tu score Kross</p>
              <div className="flex items-center gap-1 mt-1">
                <Star size={13} fill="#FFD400" color="#FFD400" />
                <span className="text-sm text-white/90">{state.puntos} puntos</span>
              </div>
              <p className="text-xs text-white/70 mt-1">Sube tu score y desbloquea beneficios</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[430px] mx-auto px-4 py-5">
        {/* Benefits */}
        <h2 className="font-black text-lg mb-3" style={{ color: '#111' }}>Beneficios</h2>
        <div className="space-y-2 mb-6">
          {BENEFITS.map(b => {
            const unlocked = state.score >= b.min
            return (
              <div key={b.min} className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: unlocked ? '#F0FDF4' : '#fff', border: `1.5px solid ${unlocked ? '#86EFAC' : '#f0f0f0'}` }}>
                <span className="text-xl">{b.icon}</span>
                <p className="flex-1 text-sm font-bold" style={{ color: unlocked ? '#15803D' : '#888' }}>{b.label}</p>
                {unlocked ? <Check size={16} style={{ color: '#16A34A' }} /> : <span className="text-[10px] font-black text-gray-400 flex items-center gap-1"><Lock size={10} /> {b.min}</span>}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <h2 className="font-black text-lg mb-1" style={{ color: '#111' }}>Sube tu score</h2>
        <p className="text-xs text-gray-400 mb-3">Completa estas acciones para ganar puntos</p>
        <div className="space-y-2">
          {actions.map(a => {
            const isDone = done.has(a.key)
            return (
              <div key={a.key} className="flex items-center gap-3 p-3 rounded-2xl bg-white" style={{ border: '1.5px solid #f0f0f0' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isDone ? '#DCFCE7' : '#EEF9FF' }}>
                  <a.icon size={18} style={{ color: isDone ? '#16A34A' : '#55C8F5' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm" style={{ color: '#111' }}>{a.title}</p>
                  <p className="text-xs text-gray-400">{a.desc} · +{a.pts} pts</p>
                </div>
                {isDone ? (
                  <span className="flex items-center gap-1 text-xs font-black" style={{ color: '#16A34A' }}><Check size={14} /> Listo</span>
                ) : (
                  <button onClick={a.onClick} disabled={busy === a.key}
                    className="text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50"
                    style={{ background: '#55C8F5', color: '#fff' }}>
                    {busy === a.key ? '…' : 'Hacer'}
                  </button>
                )}
              </div>
            )
          })}

          {/* Daily challenge */}
          <div className="p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #FFF7ED, #FFFBEB)', border: '1.5px solid #FDE68A' }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FEF3C7' }}>
                <Gift size={18} style={{ color: '#D97706' }} />
              </div>
              <div className="flex-1">
                <p className="font-black text-sm" style={{ color: '#111' }}>Reto diario</p>
                <p className="text-xs text-gray-500">Adivina dónde está el premio · +2 pts</p>
              </div>
              {dailyDone && <span className="flex items-center gap-1 text-xs font-black" style={{ color: '#16A34A' }}><Check size={14} /> Hoy ✓</span>}
            </div>

            {!dailyDone && (
              game ? (
                <div className="flex gap-2 mt-3">
                  {[0, 1, 2].map(i => (
                    <button key={i}
                      onClick={() => { if (Math.floor(Math.random() * 3) === i) { claim(todayKey()) } else { alert('¡Casi! Vuelve a intentar 🎁') } setGame(false) }}
                      className="flex-1 h-16 rounded-2xl flex items-center justify-center text-2xl active:scale-95 transition-transform"
                      style={{ background: '#fff', border: '2px solid #FDE68A' }}>
                      🎁
                    </button>
                  ))}
                </div>
              ) : (
                <button onClick={() => setGame(true)}
                  className="w-full mt-3 py-2.5 rounded-xl font-black text-sm"
                  style={{ background: '#F59E0B', color: '#fff' }}>
                  Jugar ahora
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
