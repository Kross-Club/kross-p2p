import { ExternalLink, FileText } from 'lucide-react'

// ─── "Tu boleta está lista" + su PDF ─────────────────────────────────────────
//
// El mensaje que sale solo cuando Nubefact emite la boleta del pedido pagado
// completo (§58). Misma familia que la constancia de pago y la guía: una
// tarjeta con su botón, no una píldora. El PDF vive en Nubefact —es el
// documento tributario, con su QR y su hash— y se abre en otra pestaña.
//
// Lo ven los DOS lados: el vendedor tiene además el estado en su columna, pero
// cuando el cliente escribe «no me llegó la boleta» la respuesta está ahí.

export default function TarjetaDeBoleta({ texto, pdfUrl, hora }: {
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
          <FileText size={11} /> Boleta electrónica
        </p>
        {texto && <p className="text-[12px] mt-1" style={{ color: 'var(--text)' }}>{texto}</p>}
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-black"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}>
            Ver mi boleta electrónica <ExternalLink size={13} />
          </a>
        )}
        {hora && <p className="text-[10px] text-gray-400 mt-1.5 text-center">{hora}</p>}
      </div>
    </div>
  )
}
