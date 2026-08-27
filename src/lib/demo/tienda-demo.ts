import { AgencyService } from '../checkout/services/AgencyService'
import { agregarPorComprador, segmentoDe } from '../../../supabase/functions/_shared/clientes.ts'
import type { StoreOrder } from '../store-orders'
import type { Cliente } from '../store-clients'

// ─── Una tienda de ejemplo que sí vende ──────────────────────────────────────
//
// Reproduce una marca que despacha ~1.000 pedidos al día entre tres productos
// (S/150, S/120 y S/180), con meses de historial detrás: clientes que repiten,
// otros que se están yendo, y una ventana viva de pedidos en todas las etapas.
//
// Tres reglas para que esto no se vuelva una mentira:
//
//  1. **Las sedes son reales.** Los destinos se buscan en el listado de Shalom y
//     Olva, así que las líneas del mapa caen donde caerían de verdad. Lo único
//     inventado son los pedidos.
//  2. **Nunca se mezcla con lo real.** El panel muestra o lo uno o lo otro, y
//     mientras muestra esto lo dice con una barra fija arriba.
//  3. **Es determinista.** Mismo generador, mismos datos: sin `Math.random()`,
//     con una semilla fija. Si cada pintada inventara números distintos, un
//     total cambiaría solo al cambiar de modo y nadie podría fiarse de nada.
//
// Nada de esto toca la base de datos.

/** Cuántos pedidos al día representa esta tienda. Sale en la barra del panel. */
export const PEDIDOS_POR_DIA = 1000

/**
 * La ventana VIVA: lo que el panel muestra de verdad.
 *
 * En producción `get-store-sessions` corta en 80, así que un demo que trajera
 * miles enseñaría una pantalla que la tienda real nunca va a ver. Se generan
 * algunos más que el corte para que el tablero tenga fondo en cada columna.
 */
const VENTANA = 120

/**
 * El HISTORIAL, para que los clientes tengan pasado.
 *
 * Solo pedidos entregados y solo con los campos que necesita el agregado
 * (comprador, precio, fecha): son los que dan LTV, recompra y segmentos. Traer
 * seis meses de pedidos completos costaría megabytes para pintar un promedio.
 */
const HISTORIAL = 2200
const DIAS_HISTORIAL = 180
const DIA = 86_400_000

// ─── Azar reproducible ───────────────────────────────────────────────────────
// mulberry32: pequeño, rápido y determinista. La semilla es fija a propósito.
function azar(semilla: number) {
  let a = semilla
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const elige = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const entre = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1))

// ─── El catálogo ─────────────────────────────────────────────────────────────
export interface ProductoDemo {
  id: string
  nombre: string
  precio: number
  activo: boolean
  images: string[]
  packs: { nombre: string; precio: number }[]
  vendidos: number
}

const CATALOGO: { id: string; nombre: string; precio: number }[] = [
  { id: 'demo-prod-1', nombre: 'Faja Reductora Premium', precio: 150 },
  { id: 'demo-prod-2', nombre: 'Set de Ollas Antiadherentes', precio: 120 },
  { id: 'demo-prod-3', nombre: 'Colchón Inflable Doble', precio: 180 },
]

const NOMBRES = [
  'Rosa Medina', 'Luis Ccahuana', 'Ana Quispe', 'Jorge Farfán', 'Marta Ríos',
  'Pedro Chávez', 'Silvia Mamani', 'Diego Vílchez', 'Carmen Huamán', 'Raúl Espinoza',
  'Nélida Palomino', 'Óscar Tapia', 'Gladys Ayala', 'Wilder Chuquimango', 'Betty Rojas',
  'Iván Cárdenas', 'Milagros Sáenz', 'Hugo Paredes', 'Lucía Ventura', 'Édgar Ticona',
  'Yeny Cabrera', 'Marco Zegarra', 'Pilar Ordóñez', 'Fredy Anccasi', 'Rocío Bardales',
]
const APELLIDOS = ['Torres', 'Flores', 'Gutiérrez', 'Sánchez', 'Ramos', 'Castillo', 'Núñez', 'Vargas']

/** De dónde sale y a dónde va. Casi todo el despacho del país sale de Lima. */
const ORIGEN = 'LIMA'
const DESTINOS = [
  { departamento: 'LA LIBERTAD', courier: 'SHALOM' },
  { departamento: 'AREQUIPA', courier: 'SHALOM' },
  { departamento: 'CUSCO', courier: 'OLVA' },
  { departamento: 'PIURA', courier: 'SHALOM' },
  { departamento: 'LORETO', courier: 'OLVA' },
  { departamento: 'JUNIN', courier: 'SHALOM' },
  { departamento: 'PUNO', courier: 'OLVA' },
  { departamento: 'LAMBAYEQUE', courier: 'SHALOM' },
  { departamento: 'ANCASH', courier: 'SHALOM' },
  { departamento: 'ICA', courier: 'OLVA' },
] as const

/** La ventana viva, repartida como se reparte de verdad: se acumula al final
 *  de la cadena, no al principio. Un tablero con todo en "Pedido" no se parece
 *  a ninguna operación real. */
const REPARTO: { stage: string; fase: string | null; peso: number }[] = [
  { stage: 'nuevo', fase: null, peso: 8 },
  { stage: 'validando', fase: null, peso: 10 },
  { stage: 'confirmado', fase: null, peso: 12 },
  { stage: 'preparando', fase: null, peso: 14 },
  { stage: 'en_camino', fase: null, peso: 8 },            // guía emitida, sin reporte
  { stage: 'en_camino', fase: 'EN_ORIGEN', peso: 10 },
  { stage: 'en_camino', fase: 'EN_TRANSITO', peso: 16 },
  { stage: 'en_camino', fase: 'EN_DESTINO', peso: 12 },
  { stage: 'entregado', fase: 'ENTREGADO', peso: 8 },
  { stage: 'no_entregado', fase: null, peso: 2 },
]

export interface MiembroDemo {
  id: string
  auth_user_id: string
  nombre: string
  role_label: string
  is_admin: boolean
  available: boolean
  avatar_url: string | null
}

const EQUIPO: MiembroDemo[] = [
  { nombre: 'Andrea Quiroz', role_label: 'Admin', is_admin: true, available: true },
  { nombre: 'Kevin Salas', role_label: 'Ventas', is_admin: false, available: true },
  { nombre: 'Milagros Pinto', role_label: 'Ventas', is_admin: false, available: true },
  { nombre: 'Renzo Aguilar', role_label: 'Despacho', is_admin: false, available: true },
  { nombre: 'Yajaira Cruz', role_label: 'Soporte', is_admin: false, available: false },
  { nombre: 'Christian Loayza', role_label: 'Motorizado', is_admin: false, available: true },
].map((m, i) => ({
  ...m,
  id: `demo-seller-${i}`,
  auth_user_id: `demo-auth-${i}`,
  avatar_url: null,
}))

export interface TiendaDemo {
  pedidos: StoreOrder[]
  clientes: Cliente[]
  productos: ProductoDemo[]
  equipo: MiembroDemo[]
  /** Producto → sede de origen, igual que lo arma Logística en Productos. */
  origenPorProducto: Record<string, string>
}

let cache: Promise<TiendaDemo> | null = null

/** La tienda de ejemplo. Se arma una vez por sesión y se reutiliza: así los
 *  números no bailan al cambiar de pantalla. */
export function tiendaDemo(): Promise<TiendaDemo> {
  if (!cache) cache = construir()
  return cache
}

async function construir(): Promise<TiendaDemo> {
  const r = azar(20260827)
  const ahora = Date.now()

  // ── Las sedes reales de cada destino ──
  const sedes = await Promise.all(DESTINOS.map(async d => {
    const [destino] = await AgencyService.byDepartment(d.courier, d.departamento)
    const [origen] = await AgencyService.byDepartment(d.courier, ORIGEN)
    return destino && origen ? { ...d, destinoId: destino.id, origenId: origen.id } : null
  }))
  const rutas = sedes.filter((x): x is NonNullable<typeof x> => !!x)

  const origenPorProducto: Record<string, string> = {}
  const rutaShalom = rutas.find(x => x.courier === 'SHALOM')
  for (const p of CATALOGO) if (rutaShalom) origenPorProducto[p.id] = rutaShalom.origenId

  // ── Las personas ──
  // Una parte compra una vez y otra repite: sin esa mezcla no hay tasa de
  // recompra que mirar, que es medio Loyalty.
  const TOTAL_CLIENTES = 640
  const personas = Array.from({ length: TOTAL_CLIENTES }, (_, i) => ({
    id: `demo-cli-${i}`,
    nombre: `${elige(r, NOMBRES).split(' ')[0]} ${elige(r, APELLIDOS)}`,
    document_number: String(entre(r, 10000000, 79999999)),
    phone: `9${entre(r, 10000000, 99999999)}`,
  }))

  // ── El historial: solo entregados, solo lo que pesa el agregado ──
  const historial: { buyer_id: string; product_price: number; created_at: string }[] = []
  for (let i = 0; i < HISTORIAL; i++) {
    // Sesgo hacia los primeros clientes: unos pocos concentran las recompras,
    // que es como se comporta una base real.
    const idx = Math.floor(Math.pow(r(), 1.7) * TOTAL_CLIENTES)
    const prod = elige(r, CATALOGO)
    historial.push({
      buyer_id: personas[Math.min(idx, TOTAL_CLIENTES - 1)].id,
      product_price: prod.precio,
      created_at: new Date(ahora - entre(r, 1, DIAS_HISTORIAL) * DIA).toISOString(),
    })
  }

  const porComprador = agregarPorComprador(historial)
  const clientes: Cliente[] = personas.map((p, i) => {
    const a = porComprador.get(p.id) ?? { pedidos: 0, gastado: 0, ultimo: 0 }
    return {
      id: p.id,
      nombre: p.nombre,
      document_type: 'DNI',
      document_number: p.document_number,
      phone: p.phone,
      puntos: Math.round(a.gastado / 10),
      score: entre(r, 40, 95),
      source: i % 7 === 0 ? 'import' : 'order',
      activated_at: i % 3 === 0 ? new Date(ahora - entre(r, 1, 90) * DIA).toISOString() : null,
      created_at: new Date(ahora - entre(r, 1, DIAS_HISTORIAL) * DIA).toISOString(),
      pedidos: a.pedidos,
      gastado: a.gastado,
      ultimo: a.ultimo ? new Date(a.ultimo).toISOString() : null,
      segmento: segmentoDe(a.ultimo, ahora, 30, 60),
    }
  })

  // ── La ventana viva de pedidos ──
  const bolsa: typeof REPARTO = []
  for (const t of REPARTO) for (let i = 0; i < t.peso; i++) bolsa.push(t)

  const pedidos: StoreOrder[] = Array.from({ length: VENTANA }, (_, i) => {
    const t = elige(r, bolsa)
    const prod = elige(r, CATALOGO)
    const ruta = elige(r, rutas)
    const persona = personas[entre(r, 0, TOTAL_CLIENTES - 1)]
    const conGuia = t.stage === 'en_camino' || t.stage === 'entregado'
    // Mitad y mitad es el reparto típico del adelanto; algunos pagan todo.
    const adelanto = r() < 0.25 ? prod.precio : Math.round(prod.precio / 2)
    const cruzado = r() < 0.8
    const miembro = elige(r, EQUIPO)
    const faseAt = t.fase ? new Date(ahora - entre(r, 0, 6) * DIA).toISOString() : null

    return {
      id: `demo-ped-${i}`,
      token: `demo-${i}`,
      store_id: 'demo',
      buyer_id: persona.id,
      buyer_name: persona.nombre,
      buyer_phone: persona.phone,
      product_id: prod.id,
      product_name: prod.nombre,
      product_price: prod.precio,
      pack_name: elige(r, ['Pack 1', 'Pack 2', 'Pack 3']),
      status: r() < 0.04 ? 'cancelado' : 'active',
      stage: t.stage,
      nota: r() < 0.12 ? elige(r, ['no_contesta', 'recuperado']) : null,
      dispatch_type: r() < 0.35 ? 'AGENCIA_LIMA' : 'AGENCIA_PROVINCIA',
      agency_name: ruta.courier,
      agency_branch_id: ruta.destinoId,
      advance_amount: adelanto,
      payment_verification: cruzado ? 'MATCHED' : 'PENDING',
      tracking_courier: conGuia ? ruta.courier : null,
      tracking_numero: conGuia ? String(entre(r, 100000, 999999)) : null,
      tracking_phase: t.fase,
      tracking_phase_at: faseAt,
      // La demora es rara y por eso importa: un tablero donde todo está en rojo
      // no enseña a mirar el rojo.
      tracking_demora_at: t.fase === 'EN_TRANSITO' && r() < 0.08
        ? new Date(ahora - entre(r, 1, 3) * DIA).toISOString() : null,
      assigned_seller_id: miembro.auth_user_id,
      seller_name: miembro.nombre,
      seller_role: miembro.role_label,
      created_at: new Date(ahora - entre(r, 0, 9) * DIA - entre(r, 0, 23) * 3_600_000).toISOString(),
      chat_messages: [],
    }
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  // ── El catálogo, con lo vendido de cada uno ──
  const vendidosPorProducto = new Map<string, number>()
  for (const h of historial) vendidosPorProducto.set(
    String(h.product_price),
    (vendidosPorProducto.get(String(h.product_price)) ?? 0) + 1,
  )
  const productos: ProductoDemo[] = CATALOGO.map(p => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    activo: true,
    images: [],
    packs: [
      { nombre: 'Pack 1', precio: p.precio },
      { nombre: 'Pack 2', precio: Math.round(p.precio * 1.7) },
      { nombre: 'Pack 3', precio: Math.round(p.precio * 2.3) },
    ],
    vendidos: vendidosPorProducto.get(String(p.precio)) ?? 0,
  }))

  return { pedidos, clientes, productos, equipo: EQUIPO, origenPorProducto }
}
