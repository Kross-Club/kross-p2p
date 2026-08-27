import type { StoreOrder } from './store-orders'

// ─── El filtro de Pedidos ────────────────────────────────────────────────────
//
// Vive en la pantalla contenedora y no en cada modo, por la misma razón que la
// lectura (`useStoreOrders`): Lista, Tablero, En vivo y Resumen son la MISMA
// lista mirada distinto (docs/11-RELACIONES.md). Un filtro por modo haría que
// el tablero de "esta semana" y el resumen de "todo" convivan en pantalla sin
// que nada avise que están contando cosas distintas.
//
// Se filtra por FECHA DE CREACIÓN —cuándo entró el pedido— y no por la fecha de
// la etapa: "los pedidos de ayer" es una cohorte que no cambia de tamaño cuando
// el courier mueve uno. Medir contra la etapa haría que el mismo rango diera
// otro número cada vez que se sincroniza el tracking.

const DIA = 86_400_000

export type RangoKey = 'hoy' | '7d' | '30d' | 'todo' | 'rango'

/** Los atajos del calendario. `dias` se cuenta INCLUYENDO hoy: "7 días" es la
 *  semana que uno mira, no siete días que terminan ayer. */
export const RANGOS: { key: RangoKey; label: string; dias: number | null }[] = [
  { key: 'hoy', label: 'Hoy', dias: 1 },
  { key: '7d', label: '7 días', dias: 7 },
  { key: '30d', label: '30 días', dias: 30 },
  { key: 'todo', label: 'Todo', dias: null },
]

export interface Filtro {
  rango: RangoKey
  /** `YYYY-MM-DD`, tal como los escribe un `<input type="date">`. Solo cuentan
   *  cuando `rango === 'rango'`. */
  desde: string
  hasta: string
  /** `assigned_seller_id`. Vacío = todos. */
  vendedor: string
  /** `product_name`. Vacío = todos. */
  producto: string
}

export const FILTRO_VACIO: Filtro = { rango: 'todo', desde: '', hasta: '', vendedor: '', producto: '' }

/**
 * La ventana de tiempo que pide el filtro, en milisegundos.
 *
 * `desde` incluye, `hasta` excluye: así los rangos pegados no se pisan ni dejan
 * un hueco de un milisegundo a medianoche.
 */
export function ventanaDe(f: Filtro, ahora: number): { desde: number | null; hasta: number | null } {
  if (f.rango === 'rango') {
    const d = delDia(f.desde)
    const h = delDia(f.hasta)
    // El día que el vendedor escribe en "hasta" es un día que quiere ver
    // completo, no uno que termina a las 00:00.
    return { desde: d, hasta: h === null ? null : h + DIA }
  }
  const dias = RANGOS.find(r => r.key === f.rango)?.dias ?? null
  if (dias === null) return { desde: null, hasta: null }
  return { desde: medianoche(ahora) - (dias - 1) * DIA, hasta: null }
}

/**
 * ¿Este pedido pasa el filtro?
 *
 * Un pedido sin fecha legible **se queda**. Es la misma regla que ordena el
 * tablero: en una pantalla de trabajo, "no aparece" y "no existe" se leen
 * igual, y esconder un pedido por un `created_at` roto es perder plata sin
 * dejar rastro. Que salga en un rango donde quizá no va es un error visible;
 * que desaparezca, no.
 */
export function pasaFiltro(p: StoreOrder, f: Filtro, ahora: number): boolean {
  if (f.vendedor && (p.assigned_seller_id ?? '') !== f.vendedor) return false
  if (f.producto && (p.product_name ?? '') !== f.producto) return false

  const { desde, hasta } = ventanaDe(f, ahora)
  if (desde === null && hasta === null) return true

  const t = p.created_at ? Date.parse(p.created_at) : NaN
  if (Number.isNaN(t)) return true
  if (desde !== null && t < desde) return false
  if (hasta !== null && t >= hasta) return false
  return true
}

export function aplicarFiltro(pedidos: StoreOrder[], f: Filtro, ahora: number): StoreOrder[] {
  return cuantosFiltros(f) === 0 ? pedidos : pedidos.filter(p => pasaFiltro(p, f, ahora))
}

/** Cuántas condiciones están puestas. Es el número del globito: un filtro
 *  encendido que no se ve es la forma más rápida de creer que la tienda dejó
 *  de vender. */
export function cuantosFiltros(f: Filtro): number {
  const fecha = f.rango === 'rango' ? (f.desde || f.hasta ? 1 : 0) : f.rango === 'todo' ? 0 : 1
  return fecha + (f.vendedor ? 1 : 0) + (f.producto ? 1 : 0)
}

/** Cómo se lee el rango puesto, para decirlo sin abrir el panel. */
export function resumenDelRango(f: Filtro): string {
  if (f.rango === 'rango') {
    if (f.desde && f.hasta) return `${f.desde} → ${f.hasta}`
    if (f.desde) return `Desde ${f.desde}`
    if (f.hasta) return `Hasta ${f.hasta}`
    return 'Fechas'
  }
  return RANGOS.find(r => r.key === f.rango)?.label ?? 'Todo'
}

/**
 * Las opciones que tienen sentido ofrecer: las que existen en esta lista.
 *
 * Se sacan de los pedidos y no de las tablas `team`/`products` a propósito —
 * un desplegable con veinte productos donde diecinueve no tienen pedidos hace
 * que el vendedor filtre a una pantalla vacía y crea que algo se rompió.
 */
export function opcionesDe(pedidos: StoreOrder[]): {
  vendedores: { id: string; nombre: string }[]
  productos: string[]
} {
  const vendedores = new Map<string, string>()
  const productos = new Set<string>()
  for (const p of pedidos) {
    if (p.assigned_seller_id) vendedores.set(p.assigned_seller_id, p.seller_name || 'Sin nombre')
    if (p.product_name) productos.add(p.product_name)
  }
  return {
    vendedores: [...vendedores].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    productos: [...productos].sort((a, b) => a.localeCompare(b, 'es')),
  }
}

/** Medianoche local del día que contiene `ms`. Local y no UTC: el vendedor
 *  peruano cierra su día a medianoche de Lima, no de Londres. */
function medianoche(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** `YYYY-MM-DD` → medianoche local de ese día. Se parte a mano en vez de
 *  `new Date(iso)` porque esa forma lo interpreta como UTC y corre el día
 *  entero cinco horas en Perú. */
function delDia(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isNaN(t) ? null : t
}
