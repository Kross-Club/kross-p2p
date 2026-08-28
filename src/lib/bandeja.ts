import { antiguedad } from './order-tracking'
import type { StoreOrder } from './store-orders'

// ─── La bandeja: qué atender primero ─────────────────────────────────────────
//
// *Lista* y *Tablero* miran los mismos pedidos y responden preguntas distintas
// (docs/11-RELACIONES.md), y por eso muestran cosas distintas:
//
//   · Tablero → ¿dónde se atora la OPERACIÓN?  → etapa, producto, plata
//   · Lista   → ¿a quién le debo un MENSAJE?   → conversación, espera, quién atiende
//
// Repetir la etapa y el producto en la Lista era llenarla con lo que ya está
// resuelto dos clics más allá, y dejar fuera lo único que esta pantalla decide:
// **el orden**. Una bandeja no se lee entera: se lee de arriba abajo hasta que
// se acaba el tiempo, así que lo que está arriba es la pantalla.

const DIA = 86_400_000

export type Prioridad = 'sin_responder' | 'sin_leer' | 'demorados' | 'recientes'

/** `pregunta` es lo que ese orden pone arriba, y sale como `title` del botón.
 *  Un orden que no cambia quién queda primero no debería existir. */
export const PRIORIDADES: { key: Prioridad; label: string; pregunta: string }[] = [
  { key: 'sin_responder', label: 'Sin responder', pregunta: 'el cliente escribió último y nadie contestó — primero el que más lleva esperando' },
  { key: 'sin_leer', label: 'Sin leer', pregunta: 'lo que llegó y nadie abrió' },
  { key: 'demorados', label: 'Parados', pregunta: 'lo que lleva más tiempo sin moverse de etapa' },
  { key: 'recientes', label: 'Recientes', pregunta: 'lo último que se movió' },
]

/** Sin responder primero: es la deuda del panel con el cliente, y la única que
 *  crece sola mientras nadie mira. */
export const PRIORIDAD_INICIAL: Prioridad = 'sin_responder'

export function esPrioridad(v: string | null | undefined): v is Prioridad {
  return PRIORIDADES.some(p => p.key === v)
}

export interface FilaBandeja {
  /** El último mensaje, ya escrito para la fila. */
  vistaPrevia: string
  /** Quién habló último: `buyer`, `seller` o `system`. */
  ultimoDe: string | null
  /** Cuándo se movió el hilo por última vez (ms). Sin mensajes, cuándo entró. */
  ultimoEn: number
  /** El último que habló fue el comprador: hay una pregunta sin responder. */
  esperando: boolean
  /** Cuánto lleva esperando respuesta. `0` cuando no espera. */
  esperaMs: number
  sinLeer: number
  /** El courier reporta demora en este envío. */
  demorado: boolean
  /** Días parados en la etapa actual (`antiguedad`). */
  diasParado: number
}

/**
 * Lo que la bandeja necesita saber de un pedido.
 *
 * `sinLeer` entra como dato y no se calcula acá porque la pantalla lo suma con
 * lo que llega por realtime: la mitad del número vive fuera de esta función.
 */
export function datosDeFila(o: StoreOrder, ahora: number, sinLeer: number): FilaBandeja {
  const mensajes = o.chat_messages ?? []
  const ultimo = mensajes.length ? mensajes[mensajes.length - 1] : null
  const ultimoEn = fecha(ultimo?.created_at) ?? fecha(o.created_at) ?? ahora

  // "Esperando" es que el ÚLTIMO en hablar haya sido el comprador. No es lo
  // mismo que "sin leer": un mensaje leído y no contestado sigue siendo una
  // deuda, y es justo el que se olvida.
  const esperando = ultimo?.sender_role === 'buyer'
  const a = antiguedad(o, ahora)

  return {
    vistaPrevia: vistaPrevia(ultimo),
    ultimoDe: ultimo?.sender_role ?? null,
    ultimoEn,
    esperando,
    esperaMs: esperando ? Math.max(0, ahora - ultimoEn) : 0,
    sinLeer,
    demorado: !!a?.demorado,
    diasParado: a?.dias ?? Math.max(0, Math.floor((ahora - ultimoEn) / DIA)),
  }
}

function vistaPrevia(m: { type: string; body: string | null } | null | undefined): string {
  if (!m) return 'Sin mensajes'
  if (m.type === 'audio') return '🎵 Audio'
  if (m.type === 'call_log') return `📞 ${m.body ?? 'Llamada'}`
  if (m.type === 'status_update') return m.body ?? 'Actualización'
  return m.body || 'Sin mensajes'
}

function fecha(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Ordena la bandeja según lo que se quiera atender primero.
 *
 * Devuelve una copia: la lista de origen la comparten cuatro pantallas y
 * ordenarla en el sitio le cambiaría el orden a las otras tres.
 */
export function ordenarBandeja<T>(
  filas: T[], prioridad: Prioridad, de: (x: T) => FilaBandeja,
): T[] {
  const copia = [...filas]
  const reciente = (a: T, b: T) => de(b).ultimoEn - de(a).ultimoEn

  switch (prioridad) {
    case 'sin_responder':
      // Primero quien espera, y de esos el que más lleva esperando: la deuda
      // más vieja es la que más caro sale.
      return copia.sort((a, b) => {
        const x = de(a), y = de(b)
        if (x.esperando !== y.esperando) return x.esperando ? -1 : 1
        if (x.esperando) return y.esperaMs - x.esperaMs
        return reciente(a, b)
      })

    case 'sin_leer':
      return copia.sort((a, b) => {
        const x = de(a), y = de(b)
        const hayX = x.sinLeer > 0, hayY = y.sinLeer > 0
        if (hayX !== hayY) return hayX ? -1 : 1
        if (hayX && x.sinLeer !== y.sinLeer) return y.sinLeer - x.sinLeer
        return reciente(a, b)
      })

    case 'demorados':
      // La demora que reporta el courier manda sobre el conteo de días: es el
      // único atraso que no estamos infiriendo nosotros.
      return copia.sort((a, b) => {
        const x = de(a), y = de(b)
        if (x.demorado !== y.demorado) return x.demorado ? -1 : 1
        if (x.diasParado !== y.diasParado) return y.diasParado - x.diasParado
        return reciente(a, b)
      })

    case 'recientes':
      return copia.sort(reciente)
  }
}
