import { Package, ExternalLink } from 'lucide-react'

// ─── La guía del envío, en el hilo ───────────────────────────────────────────
//
// El mensaje que sale cuando el envío queda registrado. Antes era una píldora
// de estado; ahora que trae su explicación de pre-guía y —cuando la emitió la
// API— el PDF de Shalom, es una tarjeta: el aviso del que el comprador va a
// depender para recoger su paquete no puede verse igual que "cambió la etapa".
//
// El botón solo existe si hay PDF (`media_url`). Una guía registrada a mano no
// lo trae, y un botón que abre una página vacía es peor que no ponerlo.
//
// La copy viene del servidor (`_shared/guia.ts` · `mensajeDeGuia`) con saltos
// de línea entre sus tres partes — de ahí el `whitespace-pre-line`.

export default function TarjetaDeGuia({ texto, pdfUrl, hora }: {
  texto: string | null
  pdfUrl?: string | null
  hora?: string
}) {
  return (
    <div className="flex justify-center mb-3">
      <div className="w-full max-w-[420px] rounded-2xl px-3.5 py-3"
        style={{ border: '0.5px solid var(--ok-border)', background: 'var(--ok-bg-soft)' }}>
        <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1"
          style={{ color: 'var(--ok-fg)' }}>
          <Package size={11} /> Tu guía de envío
        </p>
        {texto && (
          <p className="text-[12px] mt-1 whitespace-pre-line" style={{ color: 'var(--text)' }}>{texto}</p>
        )}

        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-black"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}
          >
            Ver mi guía de Shalom <ExternalLink size={13} />
          </a>
        )}

        {hora && <p className="text-[10px] text-gray-400 mt-1.5 text-center">{hora}</p>}
      </div>
    </div>
  )
}
