import { cobrosDelPedido } from './order-money'
import type { StoreOrder } from './store-orders'
import type { TipoDeCobro } from './order-money'

// ─── El filtro de Pedidos ────────────────────────────────────────────────────
//
// Vive en la pantalla contenedora y no en cada modo, por la misma razón que la
// lectura (`useStoreOrders`): Lista, Tablero y Resumen son la MISMA lista
// mirada distinto (docs/11-RELACIONES.md). Un filtro por modo haría que
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
  /** `assigned_seller_id`. Lista vacía = todos.
   *
   *  Son LISTAS y no un valor porque la pregunta real casi nunca es por uno
   *  solo: "los de Kevin y Milagros", "las dos fajas". Con un desplegable de a
   *  uno, eso obligaba a mirar dos veces y sumar de cabeza. */
  vendedores: string[]
  /** `product_name`. Lista vacía = todos. */
  productos: string[]
  /** Texto libre: nombre, N° de pedido, DNI, teléfono o guía. Vacío = todos.
   *  Ver `coincide` para por qué esos cinco y no el producto. */
  busca: string
  /** En qué quedó el cobro de este pedido. Lista vacía = todos. Ver `PAGOS`. */
  pagos: TipoDeCobro[]
}

/** ¿Este valor pasa una condición de lista? Vacía = no filtra. Es la misma
 *  regla para vendedor, producto y pago: elegir nada es no preguntar. */
const enLista = <T,>(elegidos: T[], valor: T | null): boolean =>
  elegidos.length === 0 || (valor !== null && elegidos.includes(valor))

export const FILTRO_VACIO: Filtro = {
  rango: 'todo', desde: '', hasta: '', vendedores: [], productos: [], busca: '', pagos: [],
}

// ─── Rebanar por lo que se cobró ─────────────────────────────────────────────
//
// Un pedido se cobra hasta dos veces y son operaciones distintas (§ "Un
// adelanto, un pago total y un saldo son tres cosas" en docs/11-RELACIONES.md).
// El tablero ya lo dice pedido por pedido —el anillo, las tarjetas verdes— pero
// no se podía preguntar al revés: *cuáles* van por cada camino.
//
// Acá el pedido cae en UNA sola casilla, la de hasta dónde llegó su cobro:
//
//   Adelanto → adelantaron una parte y **todavía deben el saldo**.
//   Total    → pagaron el precio entero de una. Nada que cobrar después.
//   Saldo    → adelantaron y después pagaron el saldo: hicieron los DOS pagos.
//
// Una casilla y no una etiqueta por operación, que era como estaba y estaba
// mal: quien adelantó y después pagó su saldo salía en "Adelanto" y en
// "Saldo", así que pedir "los que adelantaron" —la pregunta de verdad, la de a
// quién hay que cobrarle— devolvía también a los que ya no deben nada. Sin
// solape, marcar *Adelanto* y no marcar *Saldo* dice exactamente eso.
//
// Y con casillas que no se pisan, elegir varias es sumar listas, igual que en
// producto y en vendedor. Una sola forma de leer los tres filtros.
//
// **Solo cuenta lo cruzado por la pasarela**, la misma regla del anillo
// (`cobradoDelPedido`). Un cupón emitido y sin pagar no es un pago, y este
// filtro dice "pagos": listarlo acá haría contar como cobrado lo que todavía
// no entró, que es exactamente el error que hace despachar de más.

export const PAGOS: { key: TipoDeCobro; label: string }[] = [
  { key: 'adelanto', label: 'Adelanto' },
  { key: 'total', label: 'Total' },
  { key: 'saldo', label: 'Saldo' },
]

/**
 * Hasta dónde llegó el cobro de este pedido. `null` = no entró nada.
 *
 * Es la ÚLTIMA operación que cruzó, que es justo lo que responde "en qué
 * quedó": con el saldo pagado da `saldo` aunque antes hubiera un adelanto,
 * porque el pedido ya no debe nada. Un cupón de saldo emitido y sin pagar no
 * mueve la casilla — sigue siendo un pedido que adelantó y debe.
 */
export function estadoDeCobro(p: StoreOrder): TipoDeCobro | null {
  const entrados = cobrosDelPedido(p).filter(c => c.verificado)
  return entrados.length ? entrados[entrados.length - 1].tipo : null
}

// ─── Buscar UN pedido ────────────────────────────────────────────────────────
//
// Los desplegables de arriba REBANAN —"los de Milagros", "los de esta semana"—
// y esto ENCUENTRA: el cliente llamó, el courier preguntó por una guía, alguien
// dictó un DNI por teléfono. Son dos gestos distintos y por eso son dos
// controles distintos.
//
// Qué se busca, que es la decisión de verdad: **con qué llega uno a la
// pantalla**. Cinco cosas:
//
//   · el nombre del comprador
//   · el N° de pedido (`ORD-…`), que es lo que el cliente tiene a la vista
//   · el DNI, que es su identidad en Kross — un mismo número junta sus pedidos
//     aunque cambie de teléfono
//   · el teléfono, que es de donde viene la llamada
//   · el número de guía, que es por lo que pregunta el courier
//
// El PRODUCTO no está, y no es un olvido: ya tiene su desplegable al lado.
// Meterlo acá haría que escribir "faja" devuelva media tienda desde un control
// que promete encontrar uno.
//
// Se compara sin acentos, sin mayúsculas y **sin separadores**: quien dicta un
// teléfono lo dice "912 345 678", quien copia un pedido trae "ORD-17563…" y
// quien escribe un apellido no pone la tilde. Sin normalizar, esas tres formas
// de escribir lo mismo no encuentran nada — y un buscador que no encuentra se
// deja de usar a la segunda.

const sinAcento = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Un texto reducido a lo comparable: sin acentos, en mayúsculas y sin nada que
 *  no sea letra o número. */
export const clave = (s: string | null | undefined): string =>
  sinAcento(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface PedidoBuscable {
  buyer_name?: string | null
  buyer_phone?: string | null
  order_id?: string | null
  tracking_numero?: string | null
  buyers?: { document_number?: string | null } | null
}

/**
 * El texto contra el que se busca un pedido.
 *
 * Los campos van separados por `|` en vez de pegados: normalizado, "JUAN PEREZ"
 * + "ORD-123" pegados serían `JUANPEREZORD123`, donde un "ZORD" encontraría un
 * pedido que no dice eso en ninguna parte. La barra no puede aparecer en un
 * término —`clave` la borra— así que corta sin estorbar.
 */
export function textoDe(p: PedidoBuscable): string {
  return [
    p.buyer_name,
    p.order_id,
    p.buyers?.document_number,
    p.buyer_phone,
    p.tracking_numero,
  ].map(clave).join('|')
}

/**
 * ¿Este pedido responde a lo que se escribió?
 *
 * Por TÉRMINOS y no por la frase entera: "perez ana" encuentra a Ana Pérez
 * igual que "ana perez". Uno no recuerda en qué orden estaba escrito el nombre,
 * y exigirlo convierte una búsqueda fallida en "este cliente no existe".
 *
 * Todos los términos tienen que estar (Y, no O): con OR, escribir dos palabras
 * devuelve MÁS resultados que escribir una, que es lo contrario de lo que uno
 * espera al seguir tecleando.
 */
export function coincide(p: PedidoBuscable, busca: string): boolean {
  const terminos = busca.split(/\s+/).map(clave).filter(Boolean)
  if (!terminos.length) return true
  const texto = textoDe(p)
  return terminos.every(t => texto.includes(t))
}

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
  if (!enLista(f.vendedores, p.assigned_seller_id ?? null)) return false
  if (!enLista(f.productos, p.product_name ?? null)) return false
  if (f.busca.trim() && !coincide(p, f.busca)) return false
  if (!enLista(f.pagos, estadoDeCobro(p))) return false

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
  // Cada filtro cuenta UNA vez aunque tenga tres cosas marcadas: el globito
  // dice cuántas preguntas hay puestas, no cuántas casillas.
  return fecha + (f.vendedores.length ? 1 : 0) + (f.productos.length ? 1 : 0)
    + (f.busca.trim() ? 1 : 0) + (f.pagos.length ? 1 : 0)
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
  pagos: TipoDeCobro[]
} {
  const vendedores = new Map<string, string>()
  const productos = new Set<string>()
  const pagos = new Set<TipoDeCobro>()
  for (const p of pedidos) {
    if (p.assigned_seller_id) vendedores.set(p.assigned_seller_id, p.seller_name || 'Sin nombre')
    if (p.product_name) productos.add(p.product_name)
    const cobro = estadoDeCobro(p)
    if (cobro) pagos.add(cobro)
  }
  return {
    vendedores: [...vendedores].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    productos: [...productos].sort((a, b) => a.localeCompare(b, 'es')),
    // En el orden de `PAGOS` —adelanto, total, saldo— y no en el que aparecieron:
    // un desplegable que se reordena solo según qué pedido entró primero obliga
    // a leerlo entero cada vez.
    pagos: PAGOS.map(x => x.key).filter(k => pagos.has(k)),
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
