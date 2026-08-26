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
//   Domicilio  →  … preparando → en camino → entregado
//   Agencia    →  … preparando → registrado en {courier} → en tránsito →
//                 en agencia de destino → entregado
//
// Si los dos relojes discrepan gana el que va más adelante: que el courier
// diga EN_TRANSITO cuando nadie marcó "despachado" significa que el paquete
// salió, no que no salió.

export type PasoKey =
  | 'nuevo' | 'validando' | 'confirmado' | 'preparando'
  | 'registrado' | 'transito' | 'en_agencia'   // solo envíos por agencia
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
  claves.push('confirmado', 'preparando')
  if (porAgencia) claves.push('registrado', 'transito', 'en_agencia')
  else claves.push('en_camino')
  claves.push('entregado')

  const etiquetas: Record<PasoKey, string> = {
    nuevo: 'Pedido', validando: 'Validando pago', confirmado: 'Confirmado',
    preparando: 'Preparando',
    registrado: courier ? `Registrado en ${NOMBRE_COURIER[courier]}` : 'Registrado',
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

  const actual = Math.max(indicePorStage(stage, claves), indicePorFase(p.tracking_phase, claves))

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
  { key: 'nuevo',      label: 'Pedido',      emoji: '📋' },
  { key: 'validando',  label: 'Validando',   emoji: '🔎' },
  { key: 'confirmado', label: 'Confirmado',  emoji: '📞' },
  { key: 'preparando', label: 'Preparando',  emoji: '📦' },
  // De acá para abajo manda el courier (o el motorizado, que reporta a mano).
  { key: 'registrado', label: 'Registrado',  emoji: '🧾' },
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
export function columnaDelPedido(p: PedidoRastreable): PasoKey {
  const key = pasoActual(p)?.key ?? 'nuevo'
  return key === 'en_camino' ? 'transito' : key
}


/** Dónde deja la línea el reloj interno del equipo. */
function indicePorStage(stage: OrderStage, claves: PasoKey[]): number {
  const equivalente: Partial<Record<OrderStage, PasoKey>> = {
    nuevo: 'nuevo', validando: 'validando', confirmado: 'confirmado', preparando: 'preparando',
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
    EN_ORIGEN: 'registrado', EN_TRANSITO: 'transito',
    EN_DESTINO: 'en_agencia', ENTREGADO: 'entregado',
  }
  const key = equivalente[String(fase ?? '').toUpperCase()]
  const i = key ? claves.indexOf(key) : -1
  return i >= 0 ? i : -1
}

/** El paso activo, para titular sin recorrer la lista afuera. */
export function pasoActual(p: PedidoRastreable): Paso | undefined {
  return pasosDelPedido(p).find(x => x.estado === 'activo')
}
