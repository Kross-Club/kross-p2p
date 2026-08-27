import { useEffect, useState } from 'react'
import { CreditCard, Copy, Check } from 'lucide-react'
import type { OrderSession } from '../lib/order-api'

// ─── Con qué pagó: la identidad del pago ─────────────────────────────────────
//
// Va PEGADO al adelanto y no dentro de la ficha del cliente, porque no responde
// "¿quién es?" sino "¿esta plata entró de verdad?" — la pregunta que decide si
// se despacha. Antes vivía en el modal del avatar, a dos clics del número que
// explica.
//
// En pantalla, SOLO lo que se puede cotejar A OJO con el portal de 360pay: el
// pedido (su detalle va en la descripción) y el código de pago (así LISTA los
// cupones). El id del cupón es un alfanumérico de API que el portal no muestra
// —no ayuda a cuadrar mirando—, así que no se pinta: va únicamente dentro del
// texto que copia el botón, junto con la operación bancaria, porque ESO es lo
// que soporte de 360pay o el banco piden en un reclamo.
//
// Sobre "el número con el que yapeó": no existe. Yape no revela el celular del
// pagador —ni a 360pay ni al comercio—; lo que sí llega es el rastro bancario
// (N° de operación + banco), y eso es lo que se muestra.
export default function PagoTrace({ session }: { session: OrderSession }) {
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 1500)
    return () => clearTimeout(t)
  }, [copiado])

  const trace = session.payment_trace
  if (session.payment_verification !== 'MATCHED') return null

  const paraSoporte = [
    session.order_id ? `Pedido ${session.order_id}` : null,
    trace?.payment_code ? `Código de pago ${trace.payment_code}` : null,
    trace?.coupon_id ? `Cupón ${trace.coupon_id}` : null,
    trace?.operation_number ? `Op. ${trace.operation_number}${trace?.bank ? ` · ${trace.bank}` : ''}` : null,
  ].filter(Boolean).join('\n')

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-2.5"
      style={{ background: 'var(--ok-bg-soft)', border: '0.5px solid var(--ok-border)' }}>
      <p className="flex items-center gap-2 text-[11px] font-bold" style={{ color: 'var(--ok-fg)' }}>
        <CreditCard size={13} className="flex-shrink-0" />
        Pagó con Yape (360pay)
      </p>

      <div className="mt-1.5 space-y-0.5 text-[10px]" style={{ color: 'var(--ok-fg)' }}>
        {session.order_id && (
          <p><span className="opacity-60">Pedido</span> <span className="tabular font-bold">{session.order_id}</span></p>
        )}
        {trace?.payment_code && (
          <p><span className="opacity-60">Código de pago</span> <span className="tabular font-bold">{trace.payment_code}</span></p>
        )}
        {(trace?.operation_number || trace?.bank) && (
          <p className="opacity-60">
            Op. bancaria {trace?.operation_number ?? '—'}{trace?.bank ? ` · ${trace.bank}` : ''}
          </p>
        )}
      </div>

      {paraSoporte && (
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(paraSoporte); setCopiado(true) } catch { /* visible igual */ }
          }}
          className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
          style={{ border: '0.5px solid var(--ok-border)', color: 'var(--ok-fg)' }}
        >
          {copiado ? <Check size={11} /> : <Copy size={11} />}
          {copiado ? 'Copiado' : 'Copiar para soporte 360pay'}
        </button>
      )}
    </div>
  )
}
