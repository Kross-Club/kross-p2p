import { Check, ExternalLink } from 'lucide-react'
import { enlaceDeComprobante } from '../lib/comprobante'

// ─── "Gracias por tu pago" + su constancia ───────────────────────────────────
//
// El mensaje que sale solo cuando un cobro cruza. Antes era una píldora gris
// centrada como cualquier otro aviso de estado, y ese es el problema: el aviso
// más importante del hilo —entró la plata— se veía igual que "cambió la etapa".
//
// El botón abre la constancia en otra pestaña, no dentro del chat. Es a
// propósito: el comprador la va a enseñar, reenviar o guardar como PDF, y para
// eso tiene que ser una página con su propia dirección, no una pantalla de la
// app de la que hay que salir para volver a escribir.
//
// Lo ven los DOS lados. El vendedor no necesita la constancia para trabajar
// —tiene la columna de cobros—, pero sí necesita ver lo mismo que su cliente:
// cuando el otro escribe "el comprobante dice otra cosa", la respuesta tiene que
// estar en la misma pantalla donde se lo pregunta.

export default function TarjetaDeComprobante({ texto, cobroId, hora }: {
  /** El cuerpo del mensaje: el mismo que llegó por push y por WhatsApp. */
  texto: string | null
  cobroId: string
  hora?: string
}) {
  return (
    <div className="flex justify-center mb-3">
      <div className="max-w-[85%] rounded-2xl px-3.5 py-3"
        style={{ border: '0.5px solid var(--ok-border)', background: 'var(--ok-bg-soft)' }}>
        <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1"
          style={{ color: 'var(--ok-fg)' }}>
          <Check size={11} /> Pago recibido
        </p>
        {texto && <p className="text-[12px] mt-1" style={{ color: 'var(--text)' }}>{texto}</p>}

        {/* `rel="noopener"` porque abre en otra pestaña: sin eso la página nueva
            recibe una referencia a esta y puede navegarla. */}
        <a
          href={enlaceDeComprobante(cobroId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-black"
          style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}
        >
          Ver mi comprobante <ExternalLink size={13} />
        </a>

        {hora && <p className="text-[10px] text-gray-400 mt-1.5 text-center">{hora}</p>}
      </div>
    </div>
  )
}
