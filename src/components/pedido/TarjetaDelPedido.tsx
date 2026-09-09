import { useState } from 'react'
import { ChevronRight, ExternalLink, KeyRound, Navigation, Package } from 'lucide-react'
import type { OrderSession } from '../../lib/order-api'
import type { Ticket } from '../../lib/checkout/ticket'
import { nombreAgencia } from '../../lib/checkout/ticket'
import { isPickupDispatch } from '../../lib/session'
import { soles, valorDelPedido } from '../../lib/order-money'
import { estadoDeLaTarjeta } from '../../lib/tarjeta-del-pedido'
import { mensajeDeGps, verificarDireccionPorGps } from '../../lib/gps'
import { BotonPagarSaldo } from '../PagarSaldo'
import { nombreDelPedido } from './useTicketDelPedido'

// ─── La tarjeta del pedido, en el chat del comprador ─────────────────────────
//
// Reemplaza (09-set-2026) a cinco bloques fijos: la fila «Ver pedido» de la
// cabecera, el tracker de etapas, la dirección, el envío con su segunda barra
// y el recuadro del saldo. Tres cosas y nada más:
//
//   1. QUÉ pedido es, con «Ver pedido» al lado —abre la hoja del ticket—.
//   2. EN QUÉ PASO va: una frase y una barra de tramos, los mismos `pasos` que
//      pinta «Así va tu pedido» en `/pedido/:token`.
//   3. UNA acción, la que toca ahora: verificar el GPS (a domicilio, sin
//      verificar), pagar el saldo, o la clave de recojo cuando ya no debe nada.
//      Nunca dos botones. Lo decide `lib/tarjeta-del-pedido.ts`, que se prueba.
//
// Lo que salió de acá no se perdió: la dirección de la agencia, el número y
// el código de la guía, la pre-guía y el DNI viven en «Ver pedido», y el hilo
// sigue trayendo la guía y el comprobante como tarjetas.

export default function TarjetaDelPedido({ pedido, ticket, onVerPedido, onPatch }: {
  pedido: OrderSession
  ticket: Ticket | null
  onVerPedido: () => void
  onPatch: (patch: Partial<OrderSession>) => void
}) {
  const esRecojo = isPickupDispatch(pedido.dispatch_type)
  const estado = estadoDeLaTarjeta(pedido, ticket?.pasos ?? [])
  const [ubicando, setUbicando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  const imagen = pedido.items?.[0]?.image ?? null
  const donde = esRecojo
    ? `Recojo en ${pedido.agency_name ? nombreAgencia(pedido.agency_name) : 'agencia'}`
    : 'Entrega a domicilio'
  const punto = estado.tono === 'cerrado' ? '#DC2626' : estado.tono === 'entregado' ? '#16A34A' : 'var(--brand)'

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
    <div className="mx-4 mt-3 bg-white rounded-2xl px-3.5 py-3 shadow-sm" style={{ border: '1.5px solid #F0F0F0' }}>
      {/* 1 · Qué pedido es */}
      <button type="button" onClick={onVerPedido} className="w-full flex items-center gap-2.5 text-left">
        <div className="w-9 h-9 rounded-[10px] overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: '#F3F4F6' }}>
          {imagen
            ? <img src={imagen} alt="" className="w-full h-full object-cover" />
            : <Package size={18} style={{ color: '#9CA3AF' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 truncate leading-tight">{nombreDelPedido(pedido)}</p>
          <p className="text-[11px] font-semibold text-gray-500 leading-snug mt-0.5">{soles(valorDelPedido(pedido))} · {donde}</p>
        </div>
        <span className="flex items-center gap-0.5 text-xs font-extrabold flex-shrink-0 h-11 pl-2" style={{ color: 'var(--brand)' }}>
          Ver pedido <ChevronRight size={16} strokeWidth={2.5} />
        </span>
      </button>

      <div className="h-px my-2.5" style={{ background: '#F3F4F6' }} />

      {/* 2 · En qué paso va */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: punto, boxShadow: estado.tono === 'activo' ? '0 0 0 4px color-mix(in srgb, var(--brand) 20%, transparent)' : undefined }} />
        <p className="text-[15px] font-black text-gray-900 leading-tight">{estado.titulo}</p>
      </div>
      {estado.detalle && (
        <p className="text-xs font-semibold text-gray-500 mt-1 leading-snug">{estado.detalle}</p>
      )}
      {estado.pasos && (
        <div className="flex gap-1 mt-2.5" aria-hidden>
          {estado.pasos.map((e, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full"
              style={{ background: e === 'hecho' ? '#16A34A' : e === 'actual' ? 'var(--brand)' : '#E5E7EB' }} />
          ))}
        </div>
      )}

      {/* 3 · La acción que toca ahora */}
      {estado.accion === 'gps' && (
        <>
          <button type="button" onClick={verificar} disabled={ubicando}
            className="mt-3 w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-black disabled:opacity-60"
            style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            <Navigation size={14} /> {ubicando ? `Ubicando… ${segundos}s` : 'Verificar mi dirección con GPS'}
          </button>
          <p className="text-[11px] font-semibold text-gray-500 mt-2 text-center leading-snug">
            {ubicando
              ? 'Buscando tu ubicación exacta… espera unos segundos sin cerrar.'
              : 'Tócalo desde tu casa: así el motorizado llega directo, sin llamarte.'}
          </p>
          {aviso && <p className="text-[11px] font-semibold mt-1.5 text-center leading-snug" style={{ color: '#B91C1C' }}>{aviso}</p>}
        </>
      )}

      {estado.accion === 'saldo' && (
        <div className="mt-3">
          <BotonPagarSaldo pedido={pedido} />
          {estado.notaDePago && (
            <p className="text-[11px] font-semibold text-gray-500 mt-2 text-center leading-snug">{estado.notaDePago}</p>
          )}
        </div>
      )}

      {estado.accion === 'clave' && pedido.shalom_pickup_code && (
        <div className="mt-3 flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: '#F7F7F5' }}>
          <KeyRound size={20} className="text-gray-900 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">Tu clave de recojo</p>
            <p className="text-2xl font-black text-gray-900 tabular-nums leading-tight" style={{ letterSpacing: '0.12em' }}>
              {pedido.shalom_pickup_code}
            </p>
          </div>
          {ticket?.guide && (
            <a href={ticket.guide.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-extrabold text-gray-900 h-11 flex-shrink-0">
              Ver mi guía <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
