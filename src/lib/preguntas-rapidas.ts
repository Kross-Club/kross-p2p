// ─── Preguntas rápidas con respuesta — PURO ─────────────────────────────────
//
// Las fichas del chat del comprador eran PREGUNTAS sueltas: las tocaba, la
// pregunta entraba al hilo y alguien tenía que contestarla. Desde el
// 09-set-2026 son preguntas CON su respuesta: lo que el comprador pregunta
// casi siempre —cuándo llega, dónde lo recoge, cuánto le falta, cuál es su
// clave— la app ya lo sabe, y contestarlo al instante es lo que le enseña que
// este chat resuelve.
//
// Son CUATRO y cortas (la tarde del mismo día): van en dos columnas debajo del
// hilo, dos filas en vez de tres, para devolverle pantalla a la conversación.
// Cada pregunta tiene que caber en media pantalla de 360 px sin flecha: hasta
// 19 caracteres, medidos contra el ancho real de la celda. La pregunta también
// es el mensaje que entra al hilo, así que se escribe como se escribe en un
// chat, no como un título.
//
// Se derivan del pedido y de los `pasos` del ticket (los mismos de la tarjeta y
// de /pedido/:token) y nunca se guardan: una respuesta guardada envejece. La
// pregunta y la respuesta entran al hilo por `send-message`, para que el
// vendedor vea qué preguntó y qué se le contestó. Sin React, para probarse.

import type { Ticket } from './checkout/ticket'
import { nombreAgencia } from './checkout/ticket'
import { stageVigente } from './order-stages'
import { isPickupDispatch } from './session'
import { puedePagarSaldo, saldoDelPedido, soles, valorDelPedido } from './order-money'
import type { PedidoDeLaTarjeta } from './tarjeta-del-pedido'

export interface PreguntaRapida {
  pregunta: string
  respuesta: string
  /** La respuesta acaba de prometer avisos al instante y quien pregunta
   *  todavía no tiene la app: el chat le ofrece instalarla detrás de la
   *  respuesta. Falso dentro de la app — ya la tiene. */
  ofreceApp?: boolean
}

export interface PedidoConPreguntas extends PedidoDeLaTarjeta {
  agency_name?: string | null
}

export interface ContextoDePreguntas {
  /** El comprador está en la app instalada (`isInstalled()`). Lo decide el
   *  dispositivo, así que entra como dato: estas reglas siguen siendo puras. */
  enApp?: boolean
}

/** Lo que se le agrega a «¿Cuándo llega?»: el aviso al instante es la razón
 *  entera de instalar la app, y esa pregunta es donde se pregunta por él.
 *  Dentro de la app no se ofrece nada — se le recuerda que ya lo tiene. */
const AVISO = {
  web: 'Instala nuestra app y los avisos de tu pedido te llegan al instante.',
  app: 'Los avisos de tu pedido te llegan al instante con las notificaciones de la app.',
} as const

/** «¿Cuándo llega?», con la coleta del aviso puesta según dónde esté. */
function conAviso(pregunta: string, respuesta: string, enApp: boolean): PreguntaRapida {
  return {
    pregunta,
    respuesta: `${respuesta} ${enApp ? AVISO.app : AVISO.web}`,
    ofreceApp: !enApp,
  }
}

/** Índices de los pasos del ticket (`buildTicket`). */
const PASO = { PAGO: 0, PREPARANDO: 1, EN_CAMINO: 2, LLEGO: 3 } as const

/** Después de entregado, lo que se pregunta es otra cosa. Son tres: la última
 *  va de lado a lado en la cuadrícula. */
const ENTREGADO: PreguntaRapida[] = [
  {
    pregunta: 'Cambiar o devolver',
    respuesta: 'Escríbenos por aquí qué pasó y lo vemos al toque. Las condiciones están en la página Cambios y devoluciones de la tienda.',
  },
  {
    // «Volver a pedir» ya no está en «Mis pedidos» (MOSTRAR_FIDELIZACION): no
    // se manda a nadie a buscar un botón que no existe.
    pregunta: 'Volver a pedir',
    respuesta: 'Escríbenos por aquí qué quieres y te lo armamos. También puedes entrar a la tienda y pedirlo desde ahí.',
  },
  {
    pregunta: 'Tengo un problema',
    respuesta: 'Cuéntanos por aquí qué pasó. Un asesor te responde en breve.',
  },
]

const PAGADO = 'Nada. Tu pedido está pagado por completo.'

export function preguntasRapidas(p: PedidoConPreguntas, ticket: Ticket | null, ctx: ContextoDePreguntas = {}): PreguntaRapida[] {
  // Un pedido cerrado no tiene preguntas de seguimiento: lo que quede se
  // conversa.
  if (p.status === 'cancelado' || p.status === 'anulado') return []
  const etapa = stageVigente(p.stage)
  if (etapa === 'no_entregado') return []

  const enApp = ctx.enApp === true
  const esRecojo = isPickupDispatch(p.dispatch_type)
  const pasos = ticket?.pasos ?? []
  const i = pasos.findIndex(s => s.estado === 'actual')
  const entregado = etapa === 'entregado' || (pasos.length > 0 && i < 0)
  if (entregado) return ENTREGADO

  // Dónde: la misma línea del ticket que ve en «Ver pedido».
  const donde = ticket?.lines.find(l => l.label === 'Lo recoges en' || l.label === 'Llega a') ?? null
  const agencia = p.agency_name ? nombreAgencia(p.agency_name) : 'la agencia'
  // Sin sede resuelta el ticket dice solo el courier: eso no es un lugar.
  const lugar = donde && donde.value !== agencia ? [donde.value, donde.detail].filter(Boolean).join(', ') : null

  // Lo que le falta: con el adelanto todavía sin cruzar, lo que él sabe que
  // pagó cuenta igual — decirle que debe el total mientras validamos su Yape
  // es exactamente la duda que la etapa `validando` existe para evitar.
  // Y un saldo YA cruzado es deuda que no existe (misma regla que `saldoOf`
  // en el servidor), aunque la fila del cobro todavía no esté a la vista.
  const adelanto = Number(p.advance_amount ?? 0)
  const adelantoCruzado = String(p.payment_verification ?? '').toUpperCase() === 'MATCHED'
  const saldoCruzado = String(p.saldo_verification ?? '').toUpperCase() === 'MATCHED'
  const saldo = saldoCruzado
    ? 0
    : adelanto > 0 && !adelantoCruzado
      ? Math.max(0, valorDelPedido(p) - adelanto)
      : saldoDelPedido(p)

  const validando: PreguntaRapida = {
    pregunta: '¿Ya llegó mi pago?',
    respuesta: 'Lo estamos validando. Apenas cruce te avisamos por aquí.',
  }

  if (esRecojo) {
    const sede = donde?.value ?? agencia
    const cuando: PreguntaRapida = etapa === 'validando' ? validando : conAviso('¿Cuándo llega?',
      i <= PASO.PAGO
        ? `Apenas confirmemos tu pago registramos tu envío en ${agencia} y te avisamos por aquí.`
        : i === PASO.PREPARANDO
          ? `Estamos registrando tu envío en ${agencia}. Te avisamos por aquí apenas salga tu guía.`
          : i === PASO.EN_CAMINO
            ? `Va en camino a ${sede}. ${pasos[i]?.detail ? `${pasos[i].detail} ` : ''}Te avisamos por aquí cuando llegue.`
            : `¡Ya llegó! Está en ${sede}, listo para que lo recojas.`,
      enApp)
    const dondeRecojo: PreguntaRapida = {
      pregunta: '¿Dónde lo recojo?',
      respuesta: lugar
        ? `En ${lugar}. Lleva tu DNI y tu clave de recojo.`
        : `En tu agencia de ${agencia}. Te confirmamos la sede por aquí. Lleva tu DNI y tu clave de recojo.`,
    }
    const plata: PreguntaRapida = {
      pregunta: '¿Cuánto saldo debo?',
      respuesta: saldo <= 0
        ? PAGADO
        : puedePagarSaldo(p)
          ? `Te falta ${soles(saldo)}. Págalo con el botón «Pagar ${soles(saldo)} con Yape» de arriba y te llega tu clave de recojo.`
          : `Te falta ${soles(saldo)}. Te avisamos por aquí cuando puedas pagarlo.`,
    }
    // La clave es lo que más se preguntaba a mano. Llega al comprador solo
    // cuando ya no debe nada (`get-session`), así que sin clave la respuesta
    // dice qué la suelta: el saldo, o la guía si ya pagó todo.
    const clave: PreguntaRapida = {
      pregunta: '¿Cuál es mi clave?',
      respuesta: p.shalom_pickup_code
        ? `Tu clave de recojo es ${p.shalom_pickup_code}. Preséntala con tu DNI en el mostrador.`
        : saldo > 0
          ? 'Te la enviamos por aquí apenas pagues el saldo.'
          : 'Te la enviamos por aquí en cuanto esté lista.',
    }
    return [cuando, dondeRecojo, plata, clave]
  }

  const destino = donde?.value ?? 'tu dirección'
  const cuando: PreguntaRapida = etapa === 'validando' ? validando : conAviso('¿Cuándo llega?',
    i <= PASO.PAGO
      ? 'Apenas confirmemos tu pago lo preparamos y te avisamos por aquí.'
      : i === PASO.PREPARANDO
        ? 'Lo estamos preparando. Te avisamos por aquí cuando salga el motorizado.'
        : i === PASO.EN_CAMINO
          ? `Va en camino a ${destino}. Te avisamos por aquí cuando esté por llegar.`
          : 'Ya está por llegar a tu dirección.',
    enApp)
  const pago: PreguntaRapida = {
    pregunta: '¿Cuánto saldo debo?',
    respuesta: saldo > 0 ? `${soles(saldo)}, al recibir tu pedido.` : PAGADO,
  }
  // A dónde sale el motorizado: una dirección mal tipeada es la forma más
  // común de no entregar, y leerla acá es lo que la corrige a tiempo.
  const aDonde: PreguntaRapida = {
    pregunta: '¿A dónde llega?',
    respuesta: donde
      ? `A ${[donde.value, donde.detail].filter(Boolean).join(', ')}. ${p.address_verified
        ? 'Tu ubicación está verificada con GPS.'
        : 'Verifica tu ubicación con GPS desde «Ver pedido» para que el motorizado te encuentre.'}`
      : 'Todavía no tenemos tu dirección. Escríbela por aquí y la registramos.',
  }
  const direccion: PreguntaRapida = {
    pregunta: 'Cambiar dirección',
    respuesta: 'Toca «Ver pedido» y verifica tu ubicación con GPS desde la dirección nueva. Si prefieres, escríbela por aquí y la cambiamos.',
  }
  return [cuando, pago, aDonde, direccion]
}

// ─── Enfriamiento ────────────────────────────────────────────────────────────
// Una pregunta recién tocada se queda resaltada y no se puede volver a tocar
// hasta cinco minutos después: dos toques seguidos meten dos veces la misma
// respuesta al hilo, y en cinco minutos el pedido casi nunca cambia. Cuando sí
// cambia —cruzó el pago, salió la guía— la respuesta ya es otra, y por eso la
// marca es de la pregunta CON su respuesta: el botón se vuelve a encender solo,
// antes de los cinco minutos, porque ahora dice algo nuevo.

export const ESPERA_PREGUNTA_MS = 5 * 60_000

/** Con qué se recuerda una pregunta usada: cambia si cambia la respuesta. */
export function claveDePregunta(q: PreguntaRapida): string {
  return `${q.pregunta}\n${q.respuesta}`
}

/** Milisegundos que le faltan a una pregunta usada para volver a poder
 *  tocarse; 0 si ya puede. Nunca más que la espera entera, por si el reloj
 *  del dispositivo retrocedió. */
export function esperaRestante(usadaEn: number | undefined, ahora: number): number {
  if (usadaEn === undefined || !Number.isFinite(usadaEn)) return 0
  return Math.min(ESPERA_PREGUNTA_MS, Math.max(0, usadaEn + ESPERA_PREGUNTA_MS - ahora))
}

/** Deja solo las marcas que todavía esperan: lo demás es basura que se acumula. */
export function usadasVigentes(usadas: Record<string, number>, ahora: number): Record<string, number> {
  const vivas: Record<string, number> = {}
  for (const [clave, en] of Object.entries(usadas)) {
    if (esperaRestante(en, ahora) > 0) vivas[clave] = en
  }
  return vivas
}

/** En cuántos milisegundos vence la espera más próxima; null si ninguna espera. */
export function proximoVencimiento(usadas: Record<string, number>, ahora: number): number | null {
  let minimo: number | null = null
  for (const en of Object.values(usadas)) {
    const falta = esperaRestante(en, ahora)
    if (falta > 0 && (minimo === null || falta < minimo)) minimo = falta
  }
  return minimo
}
