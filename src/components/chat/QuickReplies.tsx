import { Check } from 'lucide-react'
import { claveDePregunta } from '../../lib/preguntas-rapidas'
import type { PreguntaRapida } from '../../lib/preguntas-rapidas'

// ─── Preguntas rápidas, con respuesta ────────────────────────────────────────
// Cuatro preguntas en dos columnas encima del campo, siempre a la vista
// mientras el pedido esté vivo — también después de escribir o de tocar una:
// son atajos, no un tutorial que se cumple una vez. Cada una entra al hilo
// como pregunta del comprador y se contesta al instante con lo que la app ya
// sabe del pedido (`lib/preguntas-rapidas.ts`).
//
// Eran tres apiladas (la mañana del 09-set-2026): 132 px de alto. En dos
// columnas son 78 y esa pantalla vuelve al hilo. Sin flecha: en una celda de
// 160 px se comía tres letras, y una pregunta ya se lee como lo que es.
//
// El ancho de la celda está MEDIDO, no estimado: a 360 px —la pantalla angosta
// que todavía se usa— la caja del texto da 149 px y la pregunta más larga que
// existe («¿Cuánto saldo debo?», «Cambio o devolución») pide 146. De ahí que el
// relleno sea `px-1.5` y que la cuadrícula no lleve `px-1`: con `px-3` y ese
// `px-1` la caja bajaba a 135 y las dos se cortaban con puntos suspensivos. El
// texto va centrado, así que el relleno chico no se nota: lo que se ve es el
// aire que sobra dentro de la celda.
//
// La recién tocada se queda RESALTADA y apagada cinco minutos (`usadas`): dos
// toques seguidos meten dos veces lo mismo al hilo. Se enciende sola al vencer,
// o antes si el pedido avanzó y la respuesta ya es otra. No lleva `disabled`:
// el navegador la atenuaría y lo que se quiere es lo contrario, que se vea que
// esa ya se contestó.

export default function QuickReplies({ preguntas, usadas = {}, tintaDeMarca = '#fff', onPick }: {
  preguntas: PreguntaRapida[]
  /** Las que todavía esperan, por `claveDePregunta` → cuándo se tocaron. El
   *  hook `usePreguntasUsadas` ya quitó las vencidas: acá no se mira el reloj. */
  usadas?: Record<string, number>
  /** El color que se lee sobre la marca (`textoSobre`), para el check. */
  tintaDeMarca?: string
  onPick: (pregunta: PreguntaRapida) => void
}) {
  if (preguntas.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-1.5 pb-2">
      {preguntas.map((q, i) => {
        const usada = claveDePregunta(q) in usadas
        // Con número impar la última va de lado a lado: un hueco en la
        // cuadrícula parece un botón que falta.
        const sola = i === preguntas.length - 1 && preguntas.length % 2 === 1
        return (
          <button
            key={q.pregunta}
            type="button"
            onClick={() => { if (!usada) onPick(q) }}
            aria-disabled={usada}
            title={usada ? 'Ya te respondimos arriba' : undefined}
            className={`${sola ? 'col-span-2 ' : ''}relative h-9 px-1.5 rounded-xl flex items-center justify-center
              text-[12.5px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
              ${usada ? 'cursor-default' : 'text-gray-900 active:scale-[0.98]'}`}
            style={usada
              ? {
                  background: 'color-mix(in srgb, var(--brand) 14%, #fff)',
                  border: '1px solid color-mix(in srgb, var(--brand) 55%, #fff)',
                  color: '#3D444C',
                }
              : { background: '#fff', border: '1px solid #EAEAE5' }}
          >
            <span className="truncate">{q.pregunta}</span>
            {/* El check va en la esquina, no delante del texto: delante le
                comía tres letras a la pregunta en una celda de 160 px. */}
            {usada && (
              <span aria-hidden className="absolute -top-1.5 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: 'var(--brand)', color: tintaDeMarca }}>
                <Check size={10} strokeWidth={3.5} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
