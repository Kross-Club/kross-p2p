import { toStage } from './order-stages'
import type { OrderStage } from './order-stages'
import { isPickupDispatch } from './session'

// ─── La línea de vida de un pedido ───────────────────────────────────────────
//
// Un pedido tiene DOS relojes y hasta ahora se miraban por separado:
//
//   · el interno   — `stage`: lo mueve una persona del equipo (confirmó,
//                    preparó, despachó).
//   · el del courier — `tracking_phase`: lo mueve Shalom u Olva desde su API
//                    (EN_ORIGEN → EN_TRANSITO → EN_DESTINO → ENTREGADO).
//
// El vendedor no piensa en dos relojes: piensa "¿dónde está el pedido?". Acá
// se funden en una sola línea, y cuál se arma depende de cómo se entrega:
//
//   Domicilio  →  … confirmado → en camino → entregado
//   Agencia    →  … confirmado → registrado en {courier} → en tránsito →
//                 en agencia de destino → entregado
//
// Si los dos relojes discrepan gana el que va más adelante: que el courier
// diga EN_TRANSITO cuando nadie marcó "despachado" significa que el paquete
// salió, no que no salió.

export type PasoKey =
  | 'nuevo' | 'validando' | 'confirmado'
  | 'registrado' | 'en_origen' | 'transito' | 'en_agencia'   // solo envíos por agencia
  | 'en_camino'                                 // solo domicilio
  | 'entregado' | 'no_entregado'

export interface Paso {
  key: PasoKey
  label: string
  estado: 'hecho' | 'activo' | 'pendiente'
}

/** Fases que reportan Shalom y Olva, en orden. */
export const FASES_COURIER = ['EN_ORIGEN', 'EN_TRANSITO', 'EN_DESTINO', 'ENTREGADO'] as const
export type FaseCourier = typeof FASES_COURIER[number]

export interface PedidoRastreable {
  stage?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  advance_amount?: number | string | null
  tracking_courier?: string | null
  /** Hay guía emitida. Es el tercer reloj: ni el equipo ni el courier, un
   *  hecho nuestro con fecha propia. Marca el paso `registrado`. */
  tracking_numero?: string | null
  tracking_phase?: string | null
}

/** El courier que mueve este pedido, si es uno de los que sabemos rastrear. */
export function courierDelPedido(p: PedidoRastreable): 'SHALOM' | 'OLVA' | null {
  const c = String(p.tracking_courier ?? p.agency_name ?? '').toUpperCase()
  return c === 'SHALOM' || c === 'OLVA' ? c : null
}

const NOMBRE_COURIER: Record<string, string> = { SHALOM: 'Shalom', OLVA: 'Olva' }

/**
 * Los pasos que le tocan a ESTE pedido, con cuál está activo.
 *
 * `validando` solo aparece si hubo adelanto: un pedido sin nada que cruzar no
 * debe mostrar un punto que jamás se va a encender (misma regla que la barra
 * del comprador, ver order-stages.ts).
 */
export function pasosDelPedido(p: PedidoRastreable): Paso[] {
  const stage = toStage(p.stage)
  const porAgencia = isPickupDispatch(p.dispatch_type)
  const courier = courierDelPedido(p)
  const conAdelanto = Number(p.advance_amount ?? 0) > 0

  const claves: PasoKey[] = ['nuevo']
  if (conAdelanto) claves.push('validando')
  claves.push('confirmado')
  if (porAgencia) claves.push('registrado', 'en_origen', 'transito', 'en_agencia')
  else claves.push('en_camino')
  claves.push('entregado')

  const etiquetas: Record<PasoKey, string> = {
    nuevo: 'Pedido creado', validando: 'Validando pago', confirmado: 'Confirmado',
    registrado: courier ? `Registrado en ${NOMBRE_COURIER[courier]}` : 'Registrado',
    en_origen: courier ? `En agencia de ${NOMBRE_COURIER[courier]}` : 'En agencia de origen',
    transito: 'En tránsito', en_agencia: 'En agencia de destino',
    en_camino: 'En camino', entregado: 'Entregado', no_entregado: 'No entregado',
  }

  // El fracaso no es un paso más: cierra la línea donde haya quedado.
  if (stage === 'no_entregado') {
    const hasta = Math.max(0, claves.length - 2)
    return [
      ...claves.slice(0, hasta).map(key => paso(key, etiquetas[key], 'hecho')),
      paso('no_entregado', etiquetas.no_entregado, 'activo'),
    ]
  }

  const actual = Math.max(
    indicePorStage(stage, claves),
    indicePorFase(p.tracking_phase, claves),
    indicePorGuia(p.tracking_numero, claves),
  )

  return claves.map((key, i) => paso(
    key,
    etiquetas[key],
    i < actual ? 'hecho' : i === actual ? 'activo' : 'pendiente',
  ))
}

const paso = (key: PasoKey, label: string, estado: Paso['estado']): Paso => ({ key, label, estado })

// ─── El tablero: el mismo eje, en columnas ───────────────────────────────────
//
// El CRM y las estadísticas llevaban cada uno su propia lista de etapas, copiada
// del `stage` crudo. Dos costos:
//
//  1. El tablero hablaba el idioma del pipeline de ventas (`en_camino`) mientras
//     el courier reportaba el suyo (`EN_TRANSITO`), así que el mismo pedido
//     salía en un paso distinto según la pantalla.
//  2. Un pedido cuyo `stage` no estaba en la lista **desaparecía del tablero**:
//     el filtro era `stage === columna.key` y nadie recogía lo que sobraba.
//     `validando` —que `register-buyer` escribe en TODO pedido con adelanto— y
//     `no_entregado` no estaban en la lista. Se caían sin dejar rastro.
//
// Acá la columna se deriva de `pasosDelPedido`, que siempre devuelve exactamente
// un paso activo: por construcción, todo pedido cae en una columna y solo una.

/** Las columnas del tablero, en orden. Es el eje canónico del pedido. */
export const COLUMNAS: { key: PasoKey; label: string; emoji: string }[] = [
  { key: 'nuevo',      label: 'Pedido creado', emoji: '📋' },
  { key: 'validando',  label: 'Validando',   emoji: '🔎' },
  // 💰 y no 📞: acá lo que pasó es que ENTRÓ PLATA. La llamada es el medio, el
  // adelanto es el hecho — y es el hecho el que decide si esto se despacha.
  //
  // Es también donde se atasca lo que ya está pagado pero el API del courier
  // no aceptó: sin `preparando` en medio, un pedido cobrado y sin guía se ve
  // exactamente por lo que es — plata cobrada que todavía no salió.
  { key: 'confirmado', label: 'Confirmado',  emoji: '💰' },
  // `registrado` es nuestro: hay guía. De `en origen` para abajo manda el
  // courier. El salto entre esos dos es el paquete saliendo del almacén, y es
  // el que más plata cuesta cuando no ocurre.
  { key: 'registrado', label: 'Registrado',  emoji: '🧾' },
  { key: 'en_origen',  label: 'En origen',   emoji: '🏬' },
  { key: 'transito',   label: 'En tránsito', emoji: '🚚' },
  { key: 'en_agencia', label: 'En destino',  emoji: '📍' },
  { key: 'entregado',  label: 'Entregado',   emoji: '✅' },
]

/**
 * En qué columna del tablero está este pedido.
 *
 * `en_camino` (domicilio) y `transito` (agencia) son la misma casilla —"el
 * paquete va en camino"— y comparten columna: el tablero mezcla los dos tipos
 * de envío y una columna por cada uno los partiría en dos sin motivo.
 *
 * `no_entregado` sale acá también, pero NO está en `COLUMNAS`: es el cierre de
 * fracaso y va en su propio grupo, igual que los cancelados. Un tablero donde
 * la derrota es una columna más invita a arrastrar pedidos hacia ella.
 */
/**
 * ¿Este pedido sigue vivo?
 *
 * Solo `cancelado` lo mata. `no_entregado` **no**: es el cierre de fracaso —el
 * pedido existió, salió y no llegó— y es la mitad de la tasa de entrega
 * (`entregado / (entregado + no_entregado)`), así que esconderlo junto a los
 * cancelados borraría el número que más duele.
 *
 * Vive acá y no en `store-orders` —que lo reexporta para no tocar a quien ya lo
 * usaba— porque es una pregunta sobre el PEDIDO, no sobre quién lo lee, y
 * `store-orders` arrastra React y el generador del demo: un módulo de lógica
 * pura no debería cargar con eso para preguntar por un `status`.
 */
export function estaVivo(o: { status?: string | null; stage?: string | null }): boolean {
  return o.status !== 'cancelado' && o.status !== 'anulado'
}

/**
 * ¿Es un pedido ANULADO? O sea: creado por error, o una prueba.
 *
 * No es lo mismo que cancelado, y por eso es un estado aparte: un cancelado es
 * una venta que existió y se perdió —duele, y tiene que doler en la tasa de
 * conversión—; un anulado nunca fue una venta. Contarlos juntos ensucia el
 * único número que la marca usa para decidir cuánto invertir.
 *
 * Ver `contable()`: es lo que los saca de las estadísticas.
 */
export function esAnulado(o: { status?: string | null }): boolean {
  return o.status === 'anulado'
}

/**
 * ¿Este pedido cuenta para las estadísticas de conversión?
 *
 * Todo menos lo anulado. Los cancelados SÍ cuentan: alguien pidió y se arrepintió,
 * y esconderlo maquillaría la conversión.
 */
export function contable(o: { status?: string | null }): boolean {
  return !esAnulado(o)
}

/**
 * ¿El pedido sigue ABIERTO? O sea: ni entregado, ni caído, ni cancelado.
 *
 * Es lo que separa "todavía pasa algo acá" de "esto ya terminó". Un pedido
 * entregado en el que la tienda escribió último no está esperando nada: está
 * cerrado, y meterlo en una lista de pendientes la llena de ruido.
 */
export function pedidoAbierto(p: PedidoRastreable & { status?: string | null }): boolean {
  if (!estaVivo(p)) return false
  const col = columnaDelPedido(p)
  return col !== 'entregado' && col !== 'no_entregado'
}

/**
 * ¿De `confirmado` en adelante? O sea: ya entró plata.
 *
 * Es la frontera del anillo de pago: antes de confirmar no hay nada cobrado que
 * mostrar, y un anillo vacío en cada tarjeta de las dos primeras columnas es
 * ruido que enseña a ignorar el anillo justo donde después importa.
 */
/**
 * ¿Este pedido está cobrado y esperando que alguien emita la guía A MANO?
 *
 * Es el atasco más caro del pipeline y el más invisible: la plata ya entró, el
 * API de Shalom u Olva rechazó el registro, y el pedido se queda en `confirmado`
 * — donde se ve exactamente igual que uno que todavía no se ha procesado. Uno
 * espera a la máquina; el otro espera a una persona que no sabe que le toca.
 *
 * Se pregunta por `FAILED` y no por "no tiene guía": un pedido recién cobrado
 * tampoco la tiene, y marcarlos a todos convertiría la alerta en decoración.
 */
export function esperaGuiaManual(p: { shalom_order_status?: string | null }): boolean {
  return String(p.shalom_order_status ?? '').toUpperCase() === 'FAILED'
}

export function conPlataEnJuego(col: PasoKey): boolean {
  const i = COLUMNAS.findIndex(c => c.key === col)
  const desde = COLUMNAS.findIndex(c => c.key === 'confirmado')
  return i >= 0 && desde >= 0 && i >= desde
}

export function columnaDelPedido(p: PedidoRastreable): PasoKey {
  const key = pasoActual(p)?.key ?? 'nuevo'
  return key === 'en_camino' ? 'transito' : key
}


/** Dónde deja la línea el reloj interno del equipo. */
function indicePorStage(stage: OrderStage, claves: PasoKey[]): number {
  const equivalente: Partial<Record<OrderStage, PasoKey>> = {
    nuevo: 'nuevo', validando: 'validando', confirmado: 'confirmado',
    // `preparando` se fue del eje: no describía un hecho verificable —nadie
    // marca "ya lo empaqué"— y su sitio lo ocupa mejor `confirmado`, que sí
    // dice algo comprobable (entró plata). Los pedidos que la BD todavía tiene
    // en `preparando` caen acá: pagados y sin guía, que es lo que son.
    preparando: 'confirmado',
    // Despachado: en domicilio va en la calle; por agencia, ya se registró la guía.
    en_camino: claves.includes('en_camino') ? 'en_camino' : 'registrado',
    entregado: 'entregado',
  }
  const key = equivalente[stage]
  const i = key ? claves.indexOf(key) : -1
  return i >= 0 ? i : 0
}

/** Dónde deja la línea el reloj del courier. */
function indicePorFase(fase: string | null | undefined, claves: PasoKey[]): number {
  const equivalente: Record<string, PasoKey> = {
    EN_ORIGEN: 'en_origen', EN_TRANSITO: 'transito',
    EN_DESTINO: 'en_agencia', ENTREGADO: 'entregado',
  }
  const key = equivalente[String(fase ?? '').toUpperCase()]
  const i = key ? claves.indexOf(key) : -1
  return i >= 0 ? i : -1
}

/**
 * Dónde deja la línea el hecho de que exista la guía.
 *
 * Es su propio reloj porque no lo mueve ni el equipo ni el courier: la guía se
 * emite y desde ese instante el pedido está `registrado`, aunque nadie haya
 * marcado nada y el courier todavía no reporte. Sin esto, un pedido con guía y
 * sin reporte se quedaba en `preparando` — indistinguible de uno que ni
 * siquiera se ha empacado.
 */
function indicePorGuia(numero: string | null | undefined, claves: PasoKey[]): number {
  if (!numero) return -1
  return claves.indexOf('registrado')
}

/** El paso activo, para titular sin recorrer la lista afuera. */
export function pasoActual(p: PedidoRastreable): Paso | undefined {
  return pasosDelPedido(p).find(x => x.estado === 'activo')
}

// ─── Cuánto lleva parado ─────────────────────────────────────────────────────
//
// Con las columnas en el idioma del courier, el número que importa deja de ser
// *cuántos hay* y pasa a ser *cuánto llevan ahí*: un pedido en `registrado` dos
// días es un paquete que nunca salió del almacén; uno en `en destino` cinco días
// es plata parada esperando que el cliente recoja. Los dos se ven igual en un
// conteo y son problemas distintos.

export interface Antiguedad {
  dias: number
  /** `true` = medido desde que entró a ESTA fase (`tracking_phase_at`).
   *  `false` = solo sabemos la edad del pedido. La pantalla no debe afirmar
   *  "lleva 3 días en esta columna" cuando lo que sabe es otra cosa. */
  exacta: boolean
  /** Alerta de demora del courier. NO es una fase: convive con cualquiera. */
  demorado: boolean
}

export function antiguedad(
  p: { created_at?: string | null; tracking_phase_at?: string | null; tracking_demora_at?: string | null },
  ahora: number,
): Antiguedad | null {
  const exacta = !!p.tracking_phase_at
  const desde = p.tracking_phase_at ?? p.created_at
  if (!desde) return null
  const t = Date.parse(desde)
  if (Number.isNaN(t)) return null
  return {
    dias: Math.max(0, Math.floor((ahora - t) / 86400_000)),
    exacta,
    demorado: !!p.tracking_demora_at,
  }
}
