import { ChevronRight } from 'lucide-react'
import type { PreguntaRapida } from '../../lib/preguntas-rapidas'

// ─── Preguntas rápidas, con respuesta ────────────────────────────────────────
// Tres preguntas apiladas encima del campo, siempre a la vista mientras el
// pedido esté vivo — también después de escribir o de tocar una: son atajos,
// no un tutorial que se cumple una vez. Cada una entra al hilo como pregunta
// del comprador y se contesta al instante con lo que la app ya sabe del pedido
// (`lib/preguntas-rapidas.ts`). Antes eran fichas sueltas que se iban en cuanto
// escribía y que alguien tenía que contestar a mano (09-set-2026).

export default function QuickReplies({ preguntas, onPick }: {
  preguntas: PreguntaRapida[]
  onPick: (pregunta: PreguntaRapida) => void
}) {
  if (preguntas.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-2.5">
      {preguntas.map(q => (
        <button
          key={q.pregunta}
          type="button"
          onClick={() => onPick(q)}
          className="w-full h-10 px-3.5 rounded-xl bg-white flex items-center justify-between gap-2
            text-[13px] font-bold text-left text-gray-900 active:scale-[0.99] transition-transform
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ border: '1px solid #EAEAE5' }}
        >
          <span className="truncate">{q.pregunta}</span>
          <ChevronRight size={15} strokeWidth={2.5} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />
        </button>
      ))}
    </div>
  )
}
