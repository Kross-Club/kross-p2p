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

export type Vista = 'sin_responder' | 'favoritos' | 'chats' | 'pedidos'

/**
 * Las cuatro maneras de mirar la bandeja. Dos **recortan** y dos **ordenan**:
 *
 *   · Sin responder → solo los que deben respuesta
 *   · Favoritos     → solo los marcados
 *   · Chats / Pedidos → todos, ordenados por lo último que pasó en cada eje
 *
 * "Recientes" a secas era ambiguo: un chat reciente y un pedido reciente son
 * dos cosas distintas —un pedido de hace un mes puede tener el chat más nuevo
 * de la lista—, y una bandeja que no dice cuál de las dos ordena no se puede
 * usar para decidir.
 */
export const VISTAS: { key: Vista; label: string; pregunta: string; recorta: boolean }[] = [
  { key: 'sin_responder', label: 'Sin responder', pregunta: 'el cliente escribió y nadie contestó — primero el que más lleva esperando', recorta: true },
  { key: 'favoritos', label: 'Favoritos', pregunta: 'los que marcaste para volver', recorta: true },
  { key: 'chats', label: 'Chats recientes', pregunta: 'el último mensaje primero, sea de quien sea', recorta: false },
  { key: 'pedidos', label: 'Pedidos recientes', pregunta: 'el pedido que entró último primero', recorta: false },
]

/** Sin responder primero: es la deuda del panel con el cliente, y la única que
 *  crece sola mientras nadie mira. */
export const VISTA_INICIAL: Vista = 'sin_responder'

export function esVista(v: string | null | undefined): v is Vista {
  return VISTAS.some(p => p.key === v)
}

export interface FilaBandeja {
  /** El último mensaje, ya escrito para la fila. */
  vistaPrevia: string
  /** Quién habló último, ya escrito: `Cliente`, `Milagros`, `Sistema`, `Bot`. */
  quienEscribio: string | null
  /** El rol de quien habló último: `buyer`, `seller`, `system`, `bot`. */
  ultimoDe: string | null
  /** Cuándo se movió el hilo por última vez (ms). Sin mensajes, cuándo entró. */
  ultimoEn: number
  /** Cuándo entró el pedido (ms). Es el OTRO eje: un pedido viejo puede tener
   *  el chat más nuevo de la lista. */
  creadoEn: number
  /** El último que habló fue el comprador: hay una pregunta sin responder. */
  esperando: boolean
  /** Cuánto lleva esperando respuesta. `0` cuando no espera. */
  esperaMs: number
  sinLeer: number
  /** El courier reporta demora en este envío. */
  demorado: boolean
  /** Días parados en la etapa actual (`antiguedad`). */
  diasParado: number
  /** Marcado con estrella en este dispositivo. */
  favorito: boolean
}

/**
 * Lo que la bandeja necesita saber de un pedido.
 *
 * `sinLeer` entra como dato y no se calcula acá porque la pantalla lo suma con
 * lo que llega por realtime: la mitad del número vive fuera de esta función.
 */
export function datosDeFila(
  o: StoreOrder, ahora: number, sinLeer: number, favorito = false,
): FilaBandeja {
  const mensajes = o.chat_messages ?? []
  const ultimo = mensajes.length ? mensajes[mensajes.length - 1] : null
  const ultimoEn = fecha(ultimo?.created_at) ?? fecha(o.created_at) ?? ahora
  const esperando = esperaRespuesta(o)
  const a = antiguedad(o, ahora)

  return {
    vistaPrevia: vistaPrevia(ultimo),
    quienEscribio: quienEscribio(ultimo),
    ultimoDe: ultimo?.sender_role ?? null,
    ultimoEn,
    creadoEn: fecha(o.created_at) ?? ultimoEn,
    esperando,
    esperaMs: esperando ? Math.max(0, ahora - ultimoEn) : 0,
    sinLeer,
    demorado: !!a?.demorado,
    diasParado: a?.dias ?? Math.max(0, Math.floor((ahora - ultimoEn) / DIA)),
    favorito,
  }
}

/**
 * ¿Este pedido le debe una respuesta al cliente?
 *
 * Dos condiciones, y la segunda es la que hace que la lista sirva:
 *
 *  1. el ÚLTIMO en hablar fue el comprador;
 *  2. nadie lo dio por respondido DESPUÉS de ese mensaje.
 *
 * Lo segundo existe porque no toda respuesta pasa por el chat: se le llamó, se
 * le contestó por WhatsApp, o la pregunta no necesitaba respuesta. Sin poder
 * cerrarlo a mano, esos pedidos se quedan arriba para siempre y la lista deja
 * de significar algo. Y comparar contra la FECHA —y no contra una bandera—
 * hace que un mensaje nuevo del comprador lo devuelva solo a la lista: no hay
 * nada que reabrir.
 */
export function esperaRespuesta(o: StoreOrder): boolean {
  const mensajes = o.chat_messages ?? []
  const ultimo = mensajes.length ? mensajes[mensajes.length - 1] : null
  if (ultimo?.sender_role !== 'buyer') return false

  const respondidoEn = fecha(o.answered_at)
  const preguntadoEn = fecha(ultimo.created_at)
  if (respondidoEn === null || preguntadoEn === null) return respondidoEn === null
  return preguntadoEn > respondidoEn
}

/**
 * Quién escribió el último mensaje, con nombre y no con rol.
 *
 * Decía "Tú:" para todo lo que salía de la tienda, y en un equipo de seis eso
 * es justo lo que no se puede saber de un vistazo: si ya contestó Milagros, no
 * hace falta que conteste nadie más.
 *
 * **`Tienda` NO quiere decir "automático".** Es el respaldo para un mensaje de
 * vendedor que no trae nombre guardado —los de antes de que se guardara—, y
 * dice la verdad sin inventar a nadie.
 *
 * Hoy lo automático es `Sistema` (avisos de pago, guía, etapa) y `Bot` (la IA,
 * cuando exista). Pero hay un hueco conocido: el mensaje de bienvenida que
 * escribe `register-buyer` al entrar el pedido sale con `sender_role: 'seller'`
 * y el NOMBRE del asignado, así que se lee como si esa persona lo hubiera
 * tecleado. Mientras eso siga así, "involucramiento del equipo" contado desde
 * acá saldría inflado. Ver docs/11-RELACIONES.md.
 */
function quienEscribio(m: { sender_role: string; sender_name?: string | null } | null | undefined): string | null {
  if (!m) return null
  if (m.sender_role === 'buyer') return 'Cliente'
  if (m.sender_role === 'system') return 'Sistema'
  if (m.sender_role === 'bot' || m.sender_role === 'ia') return 'Bot'
  // Un vendedor sin nombre guardado es un mensaje viejo, de antes de que se
  // guardara: "Tienda" dice la verdad sin inventar a nadie.
  return m.sender_name?.split(' ')[0] || 'Tienda'
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
/**
 * Recorta y ordena la bandeja según la vista elegida.
 *
 * Devuelve una copia: la lista de origen la comparten cuatro pantallas y
 * ordenarla en el sitio le cambiaría el orden a las otras tres.
 */
export function verBandeja<T>(filas: T[], vista: Vista, de: (x: T) => FilaBandeja): T[] {
  const porChat = (a: T, b: T) => de(b).ultimoEn - de(a).ultimoEn

  switch (vista) {
    // Recorta: solo los que deben respuesta, y primero el que más lleva
    // esperando — la deuda más vieja es la que más caro sale.
    case 'sin_responder':
      return filas.filter(x => de(x).esperando)
        .sort((a, b) => de(b).esperaMs - de(a).esperaMs)

    // Recorta: solo los marcados. Dentro, lo último que se movió.
    case 'favoritos':
      return filas.filter(x => de(x).favorito).sort(porChat)

    case 'chats':
      return [...filas].sort(porChat)

    // El OTRO eje: cuándo entró el pedido, no cuándo se habló. Un pedido de
    // hace un mes puede tener el chat más nuevo de la lista.
    case 'pedidos':
      return [...filas].sort((a, b) => de(b).creadoEn - de(a).creadoEn)
  }
}
