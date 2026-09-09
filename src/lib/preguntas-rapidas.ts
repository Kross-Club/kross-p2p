// ─── Preguntas rápidas con respuesta — PURO ─────────────────────────────────
//
// Las fichas del chat del comprador eran PREGUNTAS sueltas: las tocaba, la
// pregunta entraba al hilo y alguien tenía que contestarla. Desde el
// 09-set-2026 son tres preguntas CON su respuesta: lo que el comprador pregunta
// casi siempre —cuándo llega, dónde lo recoge, cuánto le falta— la app ya lo
// sabe, y contestarlo al instante es lo que le enseña que este chat resuelve.
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
}

export interface PedidoConPreguntas extends PedidoDeLaTarjeta {
  agency_name?: string | null
}

/** Índices de los pasos del ticket (`buildTicket`). */
const PASO = { PAGO: 0, PREPARANDO: 1, EN_CAMINO: 2, LLEGO: 3 } as const

/** Después de entregado, lo que se pregunta es otra cosa. */
const ENTREGADO: PreguntaRapida[] = [
  {
    pregunta: '¿Cómo hago un cambio o devolución?',
    respuesta: 'Escríbenos por aquí qué pasó y lo vemos al toque. Las condiciones están en la página Cambios y devoluciones de la tienda.',
  },
  {
    pregunta: 'Quiero volver a pedir',
    respuesta: 'Toca la flecha de arriba y entra a la tienda desde tus pedidos. Si prefieres, escríbenos por aquí y te lo armamos.',
  },
  {
    pregunta: 'Tengo un problema con mi pedido',
    respuesta: 'Cuéntanos por aquí qué pasó. Un asesor te responde en breve.',
  },
]

export function preguntasRapidas(p: PedidoConPreguntas, ticket: Ticket | null): PreguntaRapida[] {
  // Un pedido cerrado no tiene preguntas de seguimiento: lo que quede se
  // conversa.
  if (p.status === 'cancelado' || p.status === 'anulado') return []
  const etapa = stageVigente(p.stage)
  if (etapa === 'no_entregado') return []

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
    const cuando: PreguntaRapida = etapa === 'validando' ? validando : {
      pregunta: '¿Cuándo llega mi pedido?',
      respuesta: i <= PASO.PAGO
        ? `Apenas confirmemos tu pago registramos tu envío en ${agencia} y te avisamos por aquí.`
        : i === PASO.PREPARANDO
          ? `Estamos registrando tu envío en ${agencia}. Te avisamos por aquí apenas salga tu guía.`
          : i === PASO.EN_CAMINO
            ? `Va en camino a ${sede}. ${pasos[i]?.detail ? `${pasos[i].detail} ` : ''}Te avisamos por aquí cuando llegue.`
            : `¡Ya llegó! Está en ${sede}, listo para que lo recojas.`,
    }
    const dondeRecojo: PreguntaRapida = {
      pregunta: '¿Dónde recojo mi pedido?',
      respuesta: lugar
        ? `En ${lugar}. Lleva tu DNI y tu clave de recojo.`
        : `En tu agencia de ${agencia}. Te confirmamos la sede por aquí. Lleva tu DNI y tu clave de recojo.`,
    }
    const plata: PreguntaRapida = saldo > 0
      ? {
          pregunta: '¿Cuánto me falta pagar?',
          respuesta: puedePagarSaldo(p)
            ? `Te falta ${soles(saldo)}. Págalo con el botón «Pagar ${soles(saldo)} con Yape» de arriba y te llega tu clave de recojo.`
            : `Te falta ${soles(saldo)}. Te avisamos por aquí cuando puedas pagarlo.`,
        }
      : {
          pregunta: '¿Cuál es mi clave de recojo?',
          respuesta: p.shalom_pickup_code
            ? `Tu clave de recojo es ${p.shalom_pickup_code}. Preséntala con tu DNI en el mostrador.`
            : 'Te la enviamos por aquí en cuanto esté lista.',
        }
    return [cuando, dondeRecojo, plata]
  }

  const destino = donde?.value ?? 'tu dirección'
  const cuando: PreguntaRapida = etapa === 'validando' ? validando : {
    pregunta: '¿Cuándo llega mi pedido?',
    respuesta: i <= PASO.PAGO
      ? 'Apenas confirmemos tu pago lo preparamos y te avisamos por aquí.'
      : i === PASO.PREPARANDO
        ? 'Lo estamos preparando. Te avisamos por aquí cuando salga el motorizado.'
        : i === PASO.EN_CAMINO
          ? `Va en camino a ${destino}. Te avisamos por aquí cuando esté por llegar.`
          : 'Ya está por llegar a tu dirección.',
  }
  const pago: PreguntaRapida = {
    pregunta: '¿Cuánto pago al recibir?',
    respuesta: saldo > 0 ? `${soles(saldo)} al recibir tu pedido.` : 'Nada. Tu pedido está pagado por completo.',
  }
  const direccion: PreguntaRapida = {
    pregunta: 'Quiero cambiar mi dirección',
    respuesta: 'Toca «Ver pedido» y verifica tu ubicación con GPS desde la dirección nueva. Si prefieres, escríbela por aquí y la cambiamos.',
  }
  return [cuando, pago, direccion]
}
