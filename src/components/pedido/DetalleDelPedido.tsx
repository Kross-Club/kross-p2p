import { useState } from 'react'
import { ArrowLeft, Navigation, Package } from 'lucide-react'
import { useStore } from '../../lib/store-context'
import { textoSobre } from '../../lib/contraste'
import { COPY } from '../../lib/checkout/checkout.config'
import type { Ticket } from '../../lib/checkout/ticket'
import type { OrderSession } from '../../lib/order-api'
import { isPickupDispatch } from '../../lib/session'
import { stageVigente } from '../../lib/order-stages'
import { mensajeDeGps, verificarDireccionPorGps } from '../../lib/gps'
import { FirmaDeMarca, Recorrido, TicketDelPedido } from './PedidoConfirmado'
import CancelarPedido from './CancelarPedido'

// ─── «Ver pedido»: la hoja del ticket, desde el chat ─────────────────────────
//
// Es la página hermana `/pedido/:token` (ticket + «Así va tu pedido») abierta
// encima del chat, sin dos cosas que ahí sí tocan y acá no: la celebración de
// «¡Pedido confirmado!» —el comprador no acaba de pagar, vino a mirar— y el
// bloque de instalar la app, que el chat ya ofrece por su cuenta y que dentro
// de la app no existe. A cambio trae lo que el chat le pide al pedido entero:
// los productos cuando son varios, la ubicación a domicilio, y cancelar.
//
// Aquí viven la dirección de la agencia, el número y el código de la guía, la
// pre-guía y el DNI: lo que salió de la zona fija del chat cambió de sitio,
// no se perdió.

export default function DetalleDelPedido({ pedido, ticket, onClose, onPatch }: {
  pedido: OrderSession
  ticket: Ticket
  onClose: () => void
  onPatch: (patch: Partial<OrderSession>) => void
}) {
  const { store } = useStore()
  const marca = store.color_primary || '#55C8F5'
  const tinta = textoSobre(marca)
  const esRecojo = isPickupDispatch(pedido.dispatch_type)
  const items = pedido.items ?? []
  const etapa = stageVigente(pedido.stage)
  const puedeCancelar = pedido.status === 'active' && etapa !== 'entregado' && etapa !== 'no_entregado'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#fff' }} role="dialog" aria-modal="true" aria-label="Tu pedido">
      <div className="max-w-[430px] mx-auto min-h-full">
        {/* La marca encabeza, y el color llega hasta debajo del ticket. */}
        <div className="px-5 pt-4 pb-5" style={{ background: marca }}>
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={onClose} aria-label="Volver al chat"
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.25)' }}>
              <ArrowLeft size={18} style={{ color: tinta }} />
            </button>
            <div className="flex-1 flex justify-center pr-12">
              <FirmaDeMarca nombre={store.nombre} ancho={store.logo_wide_url} cuadrado={store.logo_url} tinta={tinta} />
            </div>
          </div>
          <TicketDelPedido ticket={ticket} orderCode={pedido.order_id} />
        </div>

        <div className="px-5">
          {items.length > 1 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-5 mb-2 px-1">Productos</p>
              <ul className="rounded-2xl divide-y divide-gray-100" style={{ border: '1px solid #EAEAE5' }}>
                {items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: '#F3F4F6' }}>
                      {it.image ? <img src={it.image} alt="" className="w-full h-full object-cover" /> : <Package size={16} style={{ color: '#9CA3AF' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">{it.nombre}</p>
                      <p className="text-[11px] text-gray-500">{it.pack_name || `${it.qty ?? 1} und`}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-800 flex-shrink-0 tabular-nums">S/ {it.precio}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-5 mb-2 px-1">{COPY.doneTimelineTitle}</p>
          <Recorrido pasos={ticket.pasos} />

          {!esRecojo && <Ubicacion pedido={pedido} onPatch={onPatch} />}

          {puedeCancelar && (
            <CancelarPedido sessionId={pedido.id} onCancelado={() => { onPatch({ status: 'cancelado' }); onClose() }} />
          )}
          <div className="pb-8" />
        </div>
      </div>
    </div>
  )
}

/** A domicilio: dónde llega, si está verificada, y el botón para verificarla
 *  o cambiarla. Es lo que hacía la barra de dirección del chat, ahora en la
 *  hoja del pedido; la tarjeta del chat solo la pide mientras falte. */
function Ubicacion({ pedido, onPatch }: { pedido: OrderSession; onPatch: (patch: Partial<OrderSession>) => void }) {
  const [ubicando, setUbicando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const verificada = !!pedido.address_verified
  const coords = typeof pedido.address_lat === 'number' && typeof pedido.address_lng === 'number'
    ? { lat: pedido.address_lat, lng: pedido.address_lng }
    : null

  const verificar = async () => {
    if (ubicando) return
    setUbicando(true); setAviso(null); setSegundos(10)
    const iv = setInterval(() => setSegundos(s => Math.max(0, s - 1)), 1000)
    try {
      const r = await verificarDireccionPorGps(pedido.id, pedido.address ?? null)
      if (r.ok) onPatch({ address: r.address, address_verified: r.address_verified, address_lat: r.address_lat, address_lng: r.address_lng })
      else setAviso(mensajeDeGps(r))
    } finally {
      clearInterval(iv); setUbicando(false); setSegundos(0)
    }
  }

  return (
    <div className="rounded-2xl px-4 py-3 mb-2" style={{ border: '1px solid #EAEAE5' }}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
        Ubicación para la entrega
        {verificada
          ? <span className="ml-1.5 normal-case tracking-normal" style={{ color: '#16A34A' }}>✓ Verificada</span>
          : <span className="ml-1.5 normal-case tracking-normal" style={{ color: '#B45309' }}>· Sin verificar</span>}
      </p>
      <p className="text-[15px] font-bold text-gray-900 leading-snug mt-0.5">{pedido.address || 'Aún sin dirección'}</p>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <button type="button" onClick={verificar} disabled={ubicando}
          className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-[13px] font-black disabled:opacity-60"
          style={verificada ? { background: '#F3F4F6', color: '#111' } : { background: 'var(--brand)', color: 'var(--on-brand)' }}>
          <Navigation size={13} /> {ubicando ? `Ubicando… ${segundos}s` : verificada ? 'Cambiar mi ubicación' : 'Verificar con GPS'}
        </button>
        {coords && (
          <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center px-3 h-10 rounded-xl text-[13px] font-black" style={{ background: '#F3F4F6', color: '#111' }}>
            Ver en Google Maps
          </a>
        )}
      </div>
      {aviso && <p className="text-xs font-semibold mt-2 leading-snug" style={{ color: '#B91C1C' }}>{aviso}</p>}
    </div>
  )
}
