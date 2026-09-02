import { Package, ExternalLink } from 'lucide-react'
import { enlaceDeGuia } from '../lib/hoja-de-guia'

// ─── La guía del envío, en el hilo ───────────────────────────────────────────
//
// El mensaje que sale cuando el envío queda registrado. Es una tarjeta y no una
// píldora: el aviso del que el comprador depende para recoger su paquete no
// puede verse igual que "cambió la etapa".
//
// El botón abre EL MEJOR documento disponible, y esa es la regla en el demo y
// en la tienda real por igual: el PDF del courier si la API lo trajo
// (`media_url`), y si no —guía registrada a mano, guía del demo— la hoja de
// guía de la app (`/guia/<token>`), que se arma con los mismos datos que el
// panel enseña. Un botón que a veces existe y a veces no enseña un producto
// que se comporta distinto según por dónde entró la guía.
//
// La copy viene del servidor (`_shared/mensaje-de-guia.ts`) con saltos de
// línea entre sus partes — de ahí el `whitespace-pre-line`.

export default function TarjetaDeGuia({ texto, pdfUrl, token, courier, hora }: {
  texto: string | null
  /** El PDF del courier, cuando la guía la emitió la API. */
  pdfUrl?: string | null
  /** El token del pedido: es la llave de la hoja de guía de la app. */
  token?: string | null
  courier?: string | null
  hora?: string
}) {
  const href = pdfUrl ?? (token ? enlaceDeGuia(token) : null)
  const nombre = String(courier ?? '').toUpperCase() === 'OLVA' ? 'Olva' : 'Shalom'

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

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-black"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}
          >
            Ver mi guía de {nombre} <ExternalLink size={13} />
          </a>
        )}

        {hora && <p className="text-[10px] text-gray-400 mt-1.5 text-center">{hora}</p>}
      </div>
    </div>
  )
}
