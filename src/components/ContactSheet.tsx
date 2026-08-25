// ─── Ficha de contacto del comprador (vista de Ventas) ───────────────────────
// Se abre tocando el AVATAR en la cabecera del chat del pedido. El nombre abre
// el detalle del PEDIDO (productos, cancelar); el avatar abre a la PERSONA —
// son dos preguntas distintas y cada una tiene su puerta.
//
// Todo lo que se muestra llega por `buyer_contact` + `payment_trace`, que
// `get-session` SOLO adjunta cuando el que mira es vendedor: es PII, y para el
// comprador esos campos viajan null (misma regla que `payment_reason`).
//
// Sobre "el número con el que yapeó": no existe. Yape no revela el celular del
// pagador — ni a 360pay ni al comercio; lo que sí llega del pago es el rastro
// bancario (N° de operación + banco), y eso es lo que se muestra. El teléfono
// de la ficha es el WhatsApp del checkout, que es también el que registra a su
// cliente en 360pay.

import { useEffect, useState } from 'react'
import { BadgeCheck, Copy, Check, CreditCard, MapPin, MessageCircle, Phone, X } from 'lucide-react'
import type { OrderSession } from '../lib/order-api'

/** Fila copiable: en el celular del vendedor, teclear un DNI de memoria en otra
 *  app es donde nacen los errores de una cifra. */
function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`text-sm font-black text-gray-900 truncate ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true) } catch { /* visible igual */ }
        }}
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-500 flex-shrink-0"
      >
        {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export default function ContactSheet({ session, onClose }: {
  session: OrderSession
  onClose: () => void
}) {
  const c = session.buyer_contact
  const trace = session.payment_trace
  const [traceCopied, setTraceCopied] = useState(false)
  useEffect(() => {
    if (!traceCopied) return
    const t = setTimeout(() => setTraceCopied(false), 1500)
    return () => clearTimeout(t)
  }, [traceCopied])
  const name = c?.nombre || session.buyer_name || 'Comprador'
  const phone = c?.phone ?? null
  const paid = session.payment_verification === 'MATCHED'
  const advance = Number(session.advance_amount ?? 0)

  // El distrito vive DENTRO de `address` ("Aramango, Bagua, Amazonas"): el
  // primer tramo es el distrito, el resto ubica. No hay columna aparte.
  const address = session.address ?? null
  const district = address ? address.split(',')[0].trim() : null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Contacto de ${name}`}
        className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:max-w-sm sm:h-fit
          rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <X size={16} />
        </button>

        {/* Cabecera: quién es */}
        <div className="flex items-center gap-3 pr-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black"
            style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
            {name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-base font-black leading-tight text-gray-900">{name}</p>
            {paid && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-green-600">
                <BadgeCheck size={13} /> Adelanto de S/ {advance} verificado
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-100 px-4">
          {c?.document_number && (
            <CopyRow label={c.document_type || 'DNI'} value={c.document_number} />
          )}
          {phone && <CopyRow label="WhatsApp · celular del checkout" value={phone} />}
          {district && <CopyRow label="Distrito" value={district} mono={false} />}
        </div>

        {/* Dónde recibe */}
        {(address || session.agency_name) && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-gray-50 px-4 py-3">
            <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div className="min-w-0 text-xs text-gray-600">
              {session.agency_name && (
                <p className="font-bold text-gray-800">Recojo en agencia · {session.agency_name}</p>
              )}
              {address && <p className="mt-0.5">{address}</p>}
              {session.delivery_reference && (
                <p className="mt-0.5 text-gray-400">Ref. {session.delivery_reference}</p>
              )}
            </div>
          </div>
        )}

        {/* Con qué pagó. En pantalla, SOLO lo que se puede cotejar A OJO con el
            portal de 360pay: el pedido (su detalle lo trae en la descripción) y
            el código de pago (así LISTA los cupones). El id del cupón es un
            alfanumérico de API que el portal no muestra — no ayuda a cuadrar
            mirando, así que no se pinta; va únicamente dentro del texto que
            copia el botón, junto con la operación bancaria, porque ESO es lo
            que soporte de 360pay o el banco piden en un reclamo.
            El celular del pagador no existe en ningún sistema — Yape no lo
            revela — así que la identidad del pago es esta. */}
        {paid && (
          <div className="mt-3 rounded-2xl bg-green-50 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-bold text-green-800">
              <CreditCard size={14} className="flex-shrink-0 text-green-600" />
              Pagó con Yape (360pay)
            </p>
            <div className="mt-1.5 space-y-1 text-[11px] text-green-800">
              {session.order_id && (
                <p><span className="text-green-600">Pedido</span>{' '}
                  <span className="font-mono font-bold">{session.order_id}</span></p>
              )}
              {trace?.payment_code && (
                <p><span className="text-green-600">Código de pago</span>{' '}
                  <span className="font-mono font-bold">{trace.payment_code}</span></p>
              )}
            </div>
            {(trace?.operation_number || trace?.bank) && (
              <p className="mt-1 text-[10px] text-green-700/60">
                Op. bancaria {trace?.operation_number ?? '—'}{trace?.bank ? ` · ${trace.bank}` : ''}
              </p>
            )}
            {(trace?.payment_code || trace?.operation_number) && (
              <button
                type="button"
                onClick={async () => {
                  const lines = [
                    session.order_id ? `Pedido ${session.order_id}` : null,
                    trace?.payment_code ? `Código de pago ${trace.payment_code}` : null,
                    trace?.coupon_id ? `Cupón ${trace.coupon_id}` : null,
                    trace?.operation_number ? `Op. ${trace.operation_number}${trace?.bank ? ` · ${trace.bank}` : ''}` : null,
                  ].filter(Boolean).join('\n')
                  try { await navigator.clipboard.writeText(lines); setTraceCopied(true) } catch { /* visible igual */ }
                }}
                className="mt-2 flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1.5 text-[11px] font-bold text-green-700"
              >
                {traceCopied ? <Check size={12} /> : <Copy size={12} />}
                {traceCopied ? 'Copiado' : 'Copiar para soporte 360pay'}
              </button>
            )}
          </div>
        )}

        {/* Acciones: hablar con la persona */}
        {phone && (
          <div className="mt-4 flex gap-2">
            <a
              href={`https://wa.me/51${phone.slice(-9)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white"
              style={{ background: '#25D366' }}
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a
              href={`tel:+51${phone.slice(-9)}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-black text-white"
            >
              <Phone size={16} /> Llamar
            </a>
          </div>
        )}
      </div>
    </>
  )
}
