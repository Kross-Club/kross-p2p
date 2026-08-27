import { supabase } from './supabase'
import type { RealtimeChannel, RealtimeChannelOptions, RealtimePresenceState } from '@supabase/supabase-js'

// ─── Un canal de Realtime, compartido por las pantallas que lo piden ─────────
//
// `supabase.channel(topic)` **no crea un canal**: si ya hay uno con ese topic,
// devuelve el que existe. Y `canal.on(...)` después de `subscribe()`
// **lanza**: `cannot add broadcast callbacks for … after subscribe()`.
//
// Mientras abrir un pedido significaba NAVEGAR, eso nunca pasaba: la lista se
// desmontaba antes de que el pedido se montara. Desde que el pedido entra como
// panel ENCIMA de la lista, las dos están vivas a la vez y piden los mismos dos
// topics —`presence:buyers` y `order:<id>`—. La segunda recibía el canal ya
// suscrito de la primera, le añadía un manejador, y la excepción subía por el
// efecto hasta desmontar el árbol: **la pantalla entera en blanco**, y solo
// desde Lista, porque el Tablero no escucha nada.
//
// Acá el canal se pide una vez, se ata una vez —un comodín de broadcast y un
// `sync` de presencia— y se reparte. Cada pantalla registra y retira sus
// manejadores; el canal se cierra cuando se va la última.

export interface MensajeBroadcast {
  type: string
  event: string
  payload: Record<string, unknown>
}

type Broadcast = Record<string, (m: MensajeBroadcast) => void>
type Presencia = (estado: RealtimePresenceState<Record<string, unknown>>) => void

export interface Suscripcion {
  /** El canal, para `send()`. Es compartido: no lo cierres a mano. */
  canal: RealtimeChannel
  cerrar: () => void
}

interface Compartido {
  canal: RealtimeChannel
  broadcast: Set<Broadcast>
  presencia: Set<Presencia>
}

const canales = new Map<string, Compartido>()

/**
 * Escucha un topic. Si otra pantalla ya lo escucha, se engancha al mismo canal.
 *
 * `broadcast` va por nombre de evento; `presencia` se llama en cada `sync` con
 * el estado ya resuelto.
 */
export function escuchar(topic: string, opciones: {
  broadcast?: Broadcast
  presencia?: Presencia
  /** Config del canal (p. ej. la clave de presencia). **Solo la aplica quien
   *  abre el topic**: después de creado no se puede cambiar. Quien la necesita
   *  —el rastreador de presencia— vive en `Layout`, o sea que monta antes que
   *  cualquier pantalla. */
  config?: RealtimeChannelOptions['config']
  /** Estado de la suscripción. **Solo lo recibe quien abre el topic**, que es
   *  el único que llama a `subscribe()`. */
  alSuscribir?: (estado: string) => void
}): Suscripcion {
  let c = canales.get(topic)

  if (!c) {
    // Las ataduras se ponen ANTES de `subscribe()` y no se tocan más: es la
    // única forma de que una pantalla que llegue después no tenga que añadir
    // ninguna. El comodín `*` recibe todo y el reparto lo hace este módulo.
    const canal = supabase.channel(topic, opciones.config ? { config: opciones.config } : undefined)
    const nuevo: Compartido = { canal, broadcast: new Set(), presencia: new Set() }
    canal
      .on('broadcast', { event: '*' }, (m: MensajeBroadcast) => {
        for (const manejadores of [...nuevo.broadcast]) llamar(manejadores[m.event], m)
      })
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState()
        for (const cb of [...nuevo.presencia]) llamar(cb, estado)
      })
      .subscribe(opciones.alSuscribir)
    canales.set(topic, nuevo)
    c = nuevo
  }

  const { broadcast, presencia } = opciones
  if (broadcast) c.broadcast.add(broadcast)
  if (presencia) c.presencia.add(presencia)

  let cerrado = false
  const compartido = c
  return {
    canal: compartido.canal,
    cerrar: () => {
      // El efecto de React puede limpiar dos veces; cerrar dos veces no debe
      // descontar a otra pantalla del canal.
      if (cerrado) return
      cerrado = true
      if (broadcast) compartido.broadcast.delete(broadcast)
      if (presencia) compartido.presencia.delete(presencia)
      if (compartido.broadcast.size === 0 && compartido.presencia.size === 0) {
        canales.delete(topic)
        supabase.removeChannel(compartido.canal)
      }
    },
  }
}

/**
 * Llama a un manejador sin dejar que se lleve a los demás.
 *
 * El canal es compartido: si el error de una pantalla cortara el recorrido, la
 * otra se quedaría muda sin que nada lo explique — que es exactamente la clase
 * de falla que este módulo existe para evitar. Se registra y se sigue.
 */
function llamar<T>(cb: ((dato: T) => void) | undefined, dato: T) {
  if (!cb) return
  try {
    cb(dato)
  } catch (e) {
    console.error('[realtime] un manejador falló y se saltó', e)
  }
}
