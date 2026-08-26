import { AgencyService } from './checkout/services/AgencyService'
import type { AgencyName } from './checkout/types'

// ─── Pedidos de ejemplo para enseñar el mapa ────────────────────────────────
//
// Existe para vender la idea: una tienda nueva abre "En vivo" y el país está
// vacío, porque todavía no despachó nada. Con esto se ve cómo se va a ver.
//
// Dos reglas para que esto no se convierta en una mentira:
//
//   1. Las sedes son REALES —se buscan en el listado de Shalom y Olva—, así
//      que las líneas caen donde caerían de verdad. Lo único inventado son los
//      pedidos.
//   2. Nunca se mezcla con lo real: la pantalla muestra o lo uno o lo otro, y
//      cuando muestra esto lo dice con un cartel encima.
//
// Nada de esto toca la base de datos.

export interface PedidoDemo {
  id: string
  token: string
  buyer_name: string | null
  product_id: string | null
  product_name: string | null
  product_price: number
  advance_amount: number
  payment_verification: string | null
  stage: string
  dispatch_type: string
  agency_name: string
  agency_branch_id: string
  tracking_courier: string
  tracking_phase: string | null
}

/** El guion: a dónde va cada caja, cómo va y quién la espera. */
const GUION = [
  { departamento: 'LA LIBERTAD', courier: 'SHALOM', cliente: 'Rosa Medina',    producto: 'Kit Hogar · Pack 2',      precio: 120, adelanto: 120, cruzado: true,  fase: 'EN_TRANSITO' },
  { departamento: 'AREQUIPA',    courier: 'SHALOM', cliente: 'Luis Ccahuana',  producto: 'Limpieza Demo · Pack 3',  precio: 160, adelanto: 80,  cruzado: true,  fase: 'EN_TRANSITO' },
  { departamento: 'CUSCO',       courier: 'OLVA',   cliente: 'Ana Quispe',     producto: 'Kit Hogar · Pack 1',      precio: 90,  adelanto: 45,  cruzado: true,  fase: 'EN_DESTINO' },
  { departamento: 'PIURA',       courier: 'SHALOM', cliente: 'Jorge Farfán',   producto: 'Limpieza Demo · Pack 2',  precio: 110, adelanto: 0,   cruzado: false, fase: 'EN_ORIGEN' },
  { departamento: 'LORETO',      courier: 'OLVA',   cliente: 'Marta Ríos',     producto: 'Kit Hogar · Pack 3',      precio: 180, adelanto: 180, cruzado: true,  fase: 'EN_TRANSITO' },
  { departamento: 'JUNIN',       courier: 'SHALOM', cliente: 'Pedro Chávez',   producto: 'Limpieza Demo · Pack 1',  precio: 70,  adelanto: 35,  cruzado: true,  fase: 'EN_TRANSITO' },
  { departamento: 'PUNO',        courier: 'OLVA',   cliente: 'Silvia Mamani',  producto: 'Kit Hogar · Pack 2',      precio: 120, adelanto: 60,  cruzado: true,  fase: 'EN_ORIGEN' },
  { departamento: 'LAMBAYEQUE',  courier: 'SHALOM', cliente: 'Diego Vílchez',  producto: 'Limpieza Demo · Pack 3',  precio: 150, adelanto: 0,   cruzado: false, fase: 'EN_ORIGEN' },
] as const

/** Cada demo sale de Lima, como sale casi todo el despacho del país. */
const ORIGEN = 'LIMA'

export interface EscenaDemo {
  pedidos: PedidoDemo[]
  /** El mismo mapa producto → sede de origen que arma Logística en Productos. */
  origenPorProducto: Record<string, string>
}

export async function escenaDemo(): Promise<EscenaDemo> {
  const pedidos: PedidoDemo[] = []
  const origenPorProducto: Record<string, string> = {}

  for (const [i, fila] of GUION.entries()) {
    const courier = fila.courier as AgencyName
    const [destino] = await AgencyService.byDepartment(courier, fila.departamento)
    const [origen] = await AgencyService.byDepartment(courier, ORIGEN)
    if (!destino || !origen) continue

    const productId = `demo-producto-${i}`
    origenPorProducto[productId] = origen.id

    pedidos.push({
      id: `demo-${i}`,
      token: `demo-${i}`,
      buyer_name: fila.cliente,
      product_id: productId,
      product_name: fila.producto,
      product_price: fila.precio,
      advance_amount: fila.adelanto,
      payment_verification: fila.cruzado ? 'MATCHED' : null,
      stage: 'en_camino',
      dispatch_type: 'AGENCIA_PROVINCIA',
      agency_name: courier,
      agency_branch_id: destino.id,
      tracking_courier: courier,
      tracking_phase: fila.fase,
    })
  }

  return { pedidos, origenPorProducto }
}
