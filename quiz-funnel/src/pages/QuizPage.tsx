import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { FUNCTIONS_BASE, ANON } from '../lib/supabase'
import { QUIZ } from '../lib/quiz-config'

type Answers = Record<string, string>

export default function QuizPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [text, setText] = useState('')
  const [aiReply, setAiReply] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [lead, setLead] = useState({ nombre: '', phone: '' })
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const s = QUIZ[step]
  const progress = Math.round(((step + 1) / QUIZ.length) * 100)

  const next = () => setStep(i => Math.min(i + 1, QUIZ.length - 1))

  const answer = (value: string) => {
    setAnswers(a => ({ ...a, [s.id]: value }))
    // El paso de IA se dispara al entrar en él
    const upcoming = QUIZ[step + 1]
    if (upcoming?.type === 'ai') runAi({ ...answers, [s.id]: value })
    next()
  }

  const runAi = async (allAnswers: Answers) => {
    setAiLoading(true); setAiReply(null)
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/ai-quiz`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: allAnswers }),
      })
      const d = await res.json().catch(() => ({}))
      setAiReply(d.reply ?? 'Tenemos una recomendación para ti. Déjanos tus datos y te la enviamos.')
    } catch {
      setAiReply('Tenemos una recomendación para ti. Déjanos tus datos y te la enviamos.')
    } finally { setAiLoading(false) }
  }

  const submitLead = async () => {
    if (!lead.phone.trim()) return
    setBusy(true)
    try {
      await fetch(`${FUNCTIONS_BASE}/quiz-submit`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, answers, ai_reply: aiReply }),
      })
      setDone(true)
    } finally { setBusy(false) }
  }

  if (done) return (
    <Shell progress={100}>
      <div className="text-center py-10">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">¡Listo, {lead.nombre || 'crack'}!</h1>
        <p className="text-gray-500">Te enviamos tu plan por WhatsApp. Revisa tu chat.</p>
      </div>
    </Shell>
  )

  return (
    <Shell progress={progress}>
      <h1 className="text-2xl font-black text-gray-900 mb-1">{s.title}</h1>
      {s.subtitle && <p className="text-gray-500 mb-6">{s.subtitle}</p>}

      {s.type === 'choice' && (
        <div className="space-y-3">
          {s.options?.map(o => (
            <button key={o.value} onClick={() => answer(o.value)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-gray-200 hover:border-[var(--brand)] text-left font-bold text-gray-800 transition-colors">
              {o.emoji && <span className="text-xl">{o.emoji}</span>}{o.label}
            </button>
          ))}
        </div>
      )}

      {s.type === 'text' && (
        <div className="space-y-4">
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={s.placeholder}
            rows={3} className="w-full bg-gray-100 rounded-2xl px-4 py-3 outline-none resize-none" />
          <Cta disabled={!text.trim()} onClick={() => answer(text)} />
        </div>
      )}

      {s.type === 'ai' && (
        <div className="min-h-[160px] flex flex-col justify-center">
          {aiLoading ? (
            <div className="flex items-center gap-3 text-gray-500"><Loader2 className="animate-spin" size={20} /> Analizando…</div>
          ) : (
            <>
              <div className="bg-[var(--brand)]/5 border border-[var(--brand)]/20 rounded-2xl p-4 text-gray-800 whitespace-pre-wrap">{aiReply}</div>
              <Cta className="mt-5" onClick={next} label="Recibir mi plan" />
            </>
          )}
        </div>
      )}

      {s.type === 'lead' && (
        <div className="space-y-3">
          <input value={lead.nombre} onChange={e => setLead(l => ({ ...l, nombre: e.target.value }))}
            placeholder="Tu nombre" className="w-full bg-gray-100 rounded-2xl px-4 py-3 outline-none" />
          <input value={lead.phone} onChange={e => setLead(l => ({ ...l, phone: e.target.value }))}
            inputMode="tel" placeholder="Tu WhatsApp (9 dígitos)" className="w-full bg-gray-100 rounded-2xl px-4 py-3 outline-none" />
          <Cta disabled={!lead.phone.trim() || busy} onClick={submitLead} label={busy ? 'Enviando…' : 'Enviar mi plan'} />
        </div>
      )}
    </Shell>
  )
}

function Shell({ children, progress }: { children: React.ReactNode; progress: number }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="h-1.5 bg-gray-100">
        <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--brand)' }} />
      </div>
      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  )
}

function Cta({ onClick, disabled, label = 'Continuar', className = '' }: { onClick: () => void; disabled?: boolean; label?: string; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-40 ${className}`}
      style={{ background: 'var(--brand)' }}>
      {label} <ArrowRight size={18} />
    </button>
  )
}
