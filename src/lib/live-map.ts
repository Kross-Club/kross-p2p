import { esEnvioPorAgencia } from './order-tracking'

// ─── El mapa de pedidos en vivo ──────────────────────────────────────────────
// Reglas de lo que se ve moverse por el país. Puro y testeable: la pantalla
// solo dibuja lo que estas funciones deciden.

export interface PedidoEnVivo {
  stage?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  tracking_courier?: string | null
  tracking_phase?: string | null
  advance_amount?: number | string | null
  product_price?: number | string | null
  payment_verification?: string | null
}

/**
 * Cómo va el dinero de este pedido. Es lo que pinta la cajita:
 *
 *   completo  → el comprador ya pagó todo por adelantado
 *   parcial   → adelanto verificado, el saldo se cobra al entregar (el caso
 *               típico del contraentrega peruano)
 *   pendiente → todavía no entró nada verificado
 *
 * "Verificado" es `payment_verification === 'MATCHED'`: un adelanto declarado
 * que 360pay todavía no cruzó no es plata que entró, y pintarlo de lima sería
 * mentirle al vendedor sobre su propia caja.
 */
export function estadoDePago(p: PedidoEnVivo): 'completo' | 'parcial' | 'pendiente' {
  const cruzado = String(p.payment_verification ?? '').toUpperCase() === 'MATCHED'
  const adelanto = Number(p.advance_amount ?? 0)
  if (!cruzado || adelanto <= 0) return 'pendiente'
  const total = Number(p.product_price ?? 0)
  return total > 0 && adelanto >= total ? 'completo' : 'parcial'
}

/**
 * Dónde está el paquete sobre la línea que une las dos sedes: 0 en la de
 * origen, 1 en la de destino. Los dos relojes cuentan (el del equipo y el del
 * courier) y gana el que va más adelante, igual que en la línea de vida.
 *
 * No son posiciones GPS —los couriers no dan la ubicación del camión—, son las
 * tres paradas que sí reportan: salió, va en camino, llegó.
 */
export function avanceDelPaquete(p: PedidoEnVivo): number {
  const fase = String(p.tracking_phase ?? '').toUpperCase()
  const stage = String(p.stage ?? '').toLowerCase()

  if (fase === 'ENTREGADO' || stage === 'entregado') return 1
  if (fase === 'EN_DESTINO') return 0.9
  if (fase === 'EN_TRANSITO') return 0.5
  if (fase === 'EN_ORIGEN') return 0.1
  // Sin reporte del courier: el reloj interno. Despachado ya salió de la sede.
  if (stage === 'en_camino') return 0.5
  return 0.1
}

/** Un pedido entra al mapa cuando hay algo que mirar moverse. */
export function vaEnElMapa(p: PedidoEnVivo): boolean {
  const stage = String(p.stage ?? '').toLowerCase()
  return stage !== 'no_entregado' && esEnvioPorAgencia(p.dispatch_type)
}

export interface Caja { minLng: number; maxLng: number; minLat: number; maxLat: number }

/**
 * Proyección plana del país sobre el lienzo. A escala nacional hay que
 * corregir la longitud por el coseno de la latitud o el Perú sale gordo.
 */
export function proyector(caja: Caja, ancho: number, alto: number) {
  const latMedia = (caja.minLat + caja.maxLat) / 2
  const kx = Math.cos((latMedia * Math.PI) / 180)
  const escala = Math.min(
    ancho / ((caja.maxLng - caja.minLng) * kx),
    alto / (caja.maxLat - caja.minLat),
  )
  return {
    x: (lng: number) => (lng - caja.minLng) * kx * escala,
    y: (lat: number) => (caja.maxLat - lat) * escala,
    escala,
  }
}
