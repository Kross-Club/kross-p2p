// ─── El comentario interno ───────────────────────────────────────────────────
//
// El mismo hilo, dos audiencias. Un pedido tiene una conversación con el
// comprador y una conversación SOBRE el comprador, y hasta hoy la segunda no
// tenía dónde: se hacía por WhatsApp del equipo, por la llamada, o no se hacía.
// Lo que se pierde ahí es lo caro — "a este ya lo llamé dos veces y no
// contesta", "el pago no cuadra, ojo antes de despachar"— porque no vive al
// lado del pedido y el siguiente que lo abre no lo sabe.
//
// Va en el MISMO hilo a propósito. Una pestaña aparte de notas internas es una
// pestaña que nadie abre: el contexto sirve cuando se lee al lado de lo que
// pasó, no en otra pantalla.
//
// ── Qué lo hace privado, de verdad ──
//
// `visibility` en `chat_messages`, que ya existía para los mensajes de sistema.
// Pero la columna **no esconde nada por sí sola**: quien decide es
// `get-session`, y hasta ahora le bastaba con `?viewer=seller` en la URL — que
// el comprador puede escribir, porque el token del pedido es suyo. Con esto,
// leer lo interno exige un **JWT de vendedor verificado** contra `sellers`.
//
// Y no viaja por el canal del comprador: su chat está suscrito a
// `order:<id>`, así que un comentario mandado por ahí le aparecería en vivo.
// De lo interno sale solo el aviso de que hay algo nuevo, sin cuerpo, y el
// panel vuelve a pedir el hilo por la puerta que sí verifica.
//
// Tres candados, y hacen falta los tres: uno solo deja la promesa a medias.

/** Los valores de `chat_messages.visibility`. Una sola definición. */
export const VISIBILIDAD = { todos: 'all', equipo: 'sellers' } as const
export type Visibilidad = typeof VISIBILIDAD[keyof typeof VISIBILIDAD]

export interface MensajeConVisibilidad {
  visibility?: string | null
  mentions?: string[] | null
}

/**
 * ¿Este mensaje es solo del equipo?
 *
 * `null` cuenta como público: es lo que tienen las filas viejas, de antes de
 * que existiera la columna, y tratarlas como internas escondería de golpe
 * conversaciones que el comprador ya había leído.
 */
export function esInterno(m: MensajeConVisibilidad): boolean {
  return m.visibility === VISIBILIDAD.equipo
}

// ─── Etiquetar a alguien con @ ───────────────────────────────────────────────
//
// Un comentario interno sin destinatario es una nota en una pizarra: se lee si
// alguien pasa por ahí. El `@` es lo que lo convierte en "esto te toca a ti".
//
// Se etiqueta a gente de la TIENDA, y por eso el buscador sale del equipo del
// pedido y no de un texto libre: un `@renzo` escrito a mano no apunta a nadie.

export interface Etiquetable {
  /** `auth_user_id`: es lo que se guarda, porque el nombre cambia. */
  id: string
  nombre: string
  role_label?: string | null
}

/** El primer nombre, que es como se llama a alguien en un chat de trabajo. */
export const primerNombre = (n: string): string => n.trim().split(/\s+/)[0] ?? n

const sinAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const clave = (s: string) => sinAcento(s).toLowerCase()

/**
 * Lo que se está escribiendo después de un `@`, para abrir el buscador.
 *
 * Devuelve `null` cuando no hay ninguno abierto — y eso incluye el caso que
 * más molesta si se hace mal: un `@` con un espacio después ya no es una
 * mención a medias, es texto. Sin esa regla el buscador se queda abierto para
 * siempre en cuanto alguien escribe un correo.
 */
export function consultaDeArroba(texto: string, caret: number): { desde: number; busca: string } | null {
  const hasta = Math.max(0, Math.min(caret, texto.length))
  const i = texto.lastIndexOf('@', hasta - 1)
  if (i < 0) return null
  // Tiene que empezar palabra: `hola@ejemplo.com` no abre nada.
  if (i > 0 && !/\s/.test(texto[i - 1])) return null
  const parcial = texto.slice(i + 1, hasta)
  if (/\s/.test(parcial)) return null
  return { desde: i, busca: parcial }
}

/** A quién ofrecerle, con lo que se lleva escrito. Por nombre y por rol: quien
 *  busca "despacho" está buscando a quien despacha, no un nombre. */
export function candidatos(equipo: Etiquetable[], busca: string): Etiquetable[] {
  const q = clave(busca)
  if (!q) return equipo
  return equipo.filter(p => clave(p.nombre).includes(q) || clave(p.role_label ?? '').includes(q))
}

/**
 * Mete la mención en el texto, dejando el cursor listo para seguir escribiendo.
 *
 * El espacio de después solo se pone si no hay uno ya: etiquetar a alguien a
 * mitad de una frase escrita —"@ke revisa el pago"— dejaba dos espacios, y esa
 * es la clase de detalle que hace que el texto se vea escrito por una máquina.
 */
export function insertarMencion(
  texto: string, desde: number, caret: number, quien: Etiquetable,
): { texto: string; caret: number } {
  const antes = texto.slice(0, desde)
  const despues = texto.slice(caret)
  const trozo = `@${primerNombre(quien.nombre)}${/^\s/.test(despues) ? '' : ' '}`
  return { texto: `${antes}${trozo}${despues}`, caret: antes.length + trozo.length }
}

/**
 * Quiénes quedaron etiquetados en el texto final.
 *
 * Se resuelve contra el equipo y no se confía en el texto: se guardan `id`s,
 * que es lo único que sigue apuntando a la misma persona cuando cambia de
 * nombre o de rol. Un `@` que no corresponde a nadie no se guarda — es texto.
 */
export function mencionadosEn(texto: string, equipo: Etiquetable[]): string[] {
  const escritos = [...texto.matchAll(/@([\p{L}\p{N}_]+)/gu)].map(m => clave(m[1]))
  if (!escritos.length) return []
  const ids = new Set<string>()
  for (const p of equipo) {
    if (escritos.includes(clave(primerNombre(p.nombre)))) ids.add(p.id)
  }
  return [...ids]
}

/**
 * El texto partido para pintarlo: los trozos etiquetados aparte.
 *
 * Solo se resalta lo que apunta a alguien del equipo. Resaltar cualquier `@`
 * haría que un correo o un precio se pintaran como si hubiéramos llamado a
 * alguien, y a la tercera vez nadie mira los resaltados.
 */
export function trozosConMenciones(
  texto: string, equipo: Etiquetable[],
): { texto: string; mencion: boolean }[] {
  const nombres = new Set(equipo.map(p => clave(primerNombre(p.nombre))))
  const out: { texto: string; mencion: boolean }[] = []
  let i = 0
  for (const m of texto.matchAll(/@([\p{L}\p{N}_]+)/gu)) {
    const inicio = m.index ?? 0
    if (!nombres.has(clave(m[1]))) continue
    if (inicio > i) out.push({ texto: texto.slice(i, inicio), mencion: false })
    out.push({ texto: m[0], mencion: true })
    i = inicio + m[0].length
  }
  if (i < texto.length) out.push({ texto: texto.slice(i), mencion: false })
  return out
}
