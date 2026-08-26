import { useEffect, useState } from 'react'
import { MapPin, Truck } from 'lucide-react'
import { AgencyService } from '../lib/checkout/services/AgencyService'
import { isPickupDispatch, pickupBranchIdOf } from '../lib/session'
import { pasosDelPedido, courierDelPedido } from '../lib/order-tracking'
import type { PedidoRastreable } from '../lib/order-tracking'
import type { AgencyName, NearbyBranch } from '../lib/checkout/types'

// ─── Dónde está el pedido, en el mapa y en su línea de vida ──────────────────
//
// El destino se dibuja sobre coordenadas REALES: la sede de recojo (Shalom y
// Olva traen lat/lng de sus 911 locales) o el punto de entrega del comprador.
// Alrededor se pintan las sedes vecinas, que dan la escala de la zona sin
// pedirle nada a un proveedor de mapas: no hay tiles, ni llave, ni request que
// pueda caerse — el dato ya vive en el repo.
//
// La animación del punto activo no es decoración: es lo único de la tarjeta que
// dice "esto está pasando ahora". Por eso late solo el punto del pedido, y en
// lima (§4.2: el lima significa dinero que entró o entrega en curso).

interface Punto { lat: number; lng: number }

export interface PedidoEnMapa extends PedidoRastreable {
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
}

const VECINAS = 7
const LIENZO_ANCHO = 160
const LIENZO_ALTO = 100

/** Los couriers guardan sus sedes A GRITOS ("REP. DE PANAMA"). Acá se leen. */
function comoNombre(texto: string): string {
  return texto.toLowerCase().replace(/\b[a-záéíóúñ]/g, c => c.toUpperCase())
}

export default function OrderTrackingMap({ order }: { order: PedidoEnMapa }) {
  const [destino, setDestino] = useState<Punto | null>(
    order.address_lat != null && order.address_lng != null
      ? { lat: order.address_lat, lng: order.address_lng }
      : null,
  )
  const [vecinas, setVecinas] = useState<NearbyBranch[]>([])
  const [sede, setSede] = useState<string | null>(null)

  const porAgencia = isPickupDispatch(order.dispatch_type)
  const courier = courierDelPedido(order)
  const branchId = pickupBranchIdOf(order)
  const destinoLat = destino?.lat
  const destinoLng = destino?.lng
  const pasos = pasosDelPedido(order)
  const activo = pasos.find(p => p.estado === 'activo')

  // La sede de recojo manda sobre la dirección: en provincia el paquete va a la
  // agencia, no a la puerta.
  useEffect(() => {
    let vivo = true
    if (!porAgencia || !courier || !branchId) return
    AgencyService.getBranch(courier as AgencyName, branchId).then(b => {
      if (!vivo || !b || b.lat == null || b.lng == null) return
      setDestino({ lat: b.lat, lng: b.lng })
      setSede(b.name)
    })
    return () => { vivo = false }
  }, [branchId, porAgencia, courier])

  // Las sedes de alrededor: la red del courier en esa zona.
  useEffect(() => {
    let vivo = true
    if (destinoLat == null || destinoLng == null) return
    AgencyService.getNearestPoints({ lat: destinoLat, lng: destinoLng }, VECINAS + 1).then(p => {
      if (vivo) setVecinas(p.filter(b => b.distanceKm > 0.05).slice(0, VECINAS))
    })
    return () => { vivo = false }
  }, [destinoLat, destinoLng])

  if (!destino) return null

  // Proyección plana alrededor del destino. A esta escala —decenas de km— la
  // diferencia con Mercator es invisible; lo único que sí importa es que un
  // grado de longitud mide menos que uno de latitud (`kx`), o el mapa sale
  // achatado. El lienzo es 16:10 como la caja, así que nada queda recortado.
  const puntos = [destino, ...vecinas]
  const lats = puntos.map(p => p.lat)
  const lngs = puntos.map(p => p.lng)
  const centro = {
    lat: (Math.max(...lats) + Math.min(...lats)) / 2,
    lng: (Math.max(...lngs) + Math.min(...lngs)) / 2,
  }
  const kx = Math.cos((centro.lat * Math.PI) / 180)
  const altoGrados = (Math.max(...lats) - Math.min(...lats)) || 0.02
  const anchoGrados = ((Math.max(...lngs) - Math.min(...lngs)) * kx) || 0.02
  const MARGEN = 1.35
  const escala = Math.min(LIENZO_ALTO / (altoGrados * MARGEN), LIENZO_ANCHO / (anchoGrados * MARGEN))
  const x = (p: Punto) => LIENZO_ANCHO / 2 + (p.lng - centro.lng) * kx * escala
  const y = (p: Punto) => LIENZO_ALTO / 2 - (p.lat - centro.lat) * escala

  const entregado = activo?.key === 'entregado'
  const fallido = activo?.key === 'no_entregado'

  return (
    <div className="mx-4 mt-2 rounded-2xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
      <div className="relative" style={{ background: 'var(--k-ink, #0F1115)', aspectRatio: '16 / 10' }}>
        <svg viewBox={`0 0 ${LIENZO_ANCHO} ${LIENZO_ALTO}`} preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full">
          {/* La grilla del sistema, no calles: no hay callejero local que dibujar */}
          <defs>
            <pattern id="k-mapa-grilla" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
              <path d="M12.5 0 L0 0 0 12.5" fill="none" stroke="var(--border)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width={LIENZO_ANCHO} height={LIENZO_ALTO} fill="url(#k-mapa-grilla)" />

          {/* Sedes vecinas: la red del courier alrededor (§6.2) */}
          {vecinas.map(b => (
            <circle key={`${b.agency}:${b.id}`} cx={x(b)} cy={y(b)} r="1.1" fill="var(--k-structural, #3D444C)" />
          ))}

          {/* El pedido. Late mientras esté en movimiento; quieto cuando cerró. */}
          <g className={entregado || fallido ? undefined : 'k-latido'}>
            <circle cx={x(destino)} cy={y(destino)} r="7"
              fill={fallido ? 'var(--danger-fg)' : 'var(--k-lime, #D4FF4F)'} opacity="0.16" />
            <circle cx={x(destino)} cy={y(destino)} r="2.2"
              fill={fallido ? 'var(--danger-fg)' : 'var(--k-lime, #D4FF4F)'} />
          </g>
        </svg>

        <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
              {porAgencia ? `Recojo · ${courier ? courier[0] + courier.slice(1).toLowerCase() : 'agencia'}` : 'Entrega a domicilio'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>
              {sede ? comoNombre(sede) : order.address ? order.address.split(',')[0].trim() : 'Destino'}
            </p>
          </div>
          {vecinas.length > 0 && (
            <p className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
              {vecinas.length} sedes cerca
            </p>
          )}
        </div>
      </div>

      {/* La línea de vida, con los pasos que le tocan a este pedido */}
      <div className="px-3 py-3" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          {porAgencia ? <Truck size={13} style={{ color: 'var(--text-muted)' }} />
            : <MapPin size={13} style={{ color: 'var(--text-muted)' }} />}
          <p className="text-xs" style={{ color: 'var(--text)', fontWeight: 500 }}>{activo?.label ?? 'Pedido'}</p>
        </div>

        {/* Una barra por paso. Sin etiquetas: con ocho pasos en 400 px se
            truncan todas y no se lee ninguna — el paso activo ya está
            titulado arriba, y el resto está en el tooltip. */}
        <div className="flex items-center gap-1">
          {pasos.map(p => (
            <div key={p.key} className="flex-1 h-1 rounded-full" title={p.label} style={{
              background: p.estado === 'pendiente' ? 'var(--surface-3)'
                : p.key === 'no_entregado' ? 'var(--danger-fg)'
                : 'var(--k-lime, #D4FF4F)',
              opacity: p.estado === 'hecho' ? 0.55 : 1,
            }} />
          ))}
        </div>

        <p className="text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>
          Paso {pasos.findIndex(p => p.estado === 'activo') + 1} de {pasos.length}
        </p>
      </div>
    </div>
  )
}
