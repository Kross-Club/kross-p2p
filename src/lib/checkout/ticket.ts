// ─── El ticket del pedido ────────────────────────────────────────────────────
// Lo que la pantalla final le deja al comprador EN LA MANO después de pagar.
//
// Existe por una decisión de producto (05-set-2026, ver `01-SALES-ENGINE.md`
// § Pantalla final): el comprador de provincia con poca costumbre digital no
// vuelve al chat; guarda CAPTURAS. La pantalla de gracias se diseña para ser
// capturada: una sola pantalla con todo lo que va a necesitar el día que le
// avisen que su paquete llegó.
//
// Rediseño del 07-set-2026: lo que falta pagar y qué llevar dejaron de ser
// cajas sueltas y pasaron a ser el DETALLE de su paso en el recorrido del
// pedido (`pasos`): el saldo se explica en "Llegó a la agencia", el DNI y la
// clave en "Recojo". Así el comprador ve en qué va y qué viene, y ninguna
// cifra grita. Nada se quitó: cambió de sitio.
//
// Este archivo arma el contenido; el componente solo lo pinta. Así cada frase
// se puede probar contra un estado del checkout, y la regla dura del módulo
// —al comprador nunca se le dice que su pago no existe— vive en un solo lugar.

import type { AgencyBranch, CheckoutState } from './types'

export interface TicketInput {
  state: CheckoutState
  /** Precio efectivo del pack (con descuento), el mismo que vio en el paso 3. */
  price: number
  /** Nombre del pack elegido, si lo hay. */
  packName: string | null
  /** true cuando el webhook ya confirmó el adelanto. */
  paid: boolean
  /** El comprador pidió que un asesor coordine el adelanto en vez de pagar. */
  unpaid: boolean
  /** La sede de recojo resuelta del catálogo, si el pedido es en agencia y ya
   *  cargó. `null` mientras carga o si es una agencia sin listado (`OTRO`). */
  branch: AgencyBranch | null
  /** La guía del courier, si la API ya la emitió mientras el comprador miraba
   *  esta pantalla (el webhook del pago la dispara en segundo plano). `null`
   *  mientras no exista: el recorrido la muestra como paso pendiente. */
  guide?: TicketGuide | null
  /** La fase que reporta el courier (`EN_ORIGEN` · `EN_TRANSITO` ·
   *  `EN_DESTINO` · `ENTREGADO`), cuando la pantalla la conoce. Es lo que hace
   *  que RECARGAR sirva de algo: sin ella el recorrido solo sabe si la guía
   *  existe, y el comprador que vuelve a mirar ve siempre lo mismo. */
  fase?: string | null
}

export interface TicketGuide {
  courier: string | null
  numero: string | null
  codigo: string | null
  oseId: string | null
  /** El PDF del courier si la API lo trajo; si no, la hoja de guía de la app. */
  href: string
}

export interface TicketLine {
  label: string
  value: string
  /** Segunda línea, más chica: dirección de la sede, referencia. */
  detail?: string
}

/** Un paso del recorrido del pedido, como lo ve el comprador. */
export interface TicketStep {
  label: string
  /** Lo que ese paso implica para él: cuánto, dónde, con qué. */
  detail?: string
  /** El botón que ESE paso va a traer cuando llegue, enseñado apagado. No es
   *  decoración: el saldo se paga desde el pedido y nunca en el mostrador, y
   *  enseñarlo apagado ahora es lo que hace que se reconozca después. */
  accion?: string
  estado: 'hecho' | 'actual' | 'pendiente'
}

export interface Ticket {
  /** Cómo se pagó, en una frase. Es la primera línea después del título. */
  payment: string
  /** Producto, entrega y a nombre de quién. */
  lines: TicketLine[]
  /** La guía en el ticket: el NÚMERO es lo que la agencia pregunta, así que va
   *  como línea (una captura no tiene botones) y el botón va aparte. `null`
   *  hasta que exista. */
  guide: { line: TicketLine; button: string; href: string } | null
  /** El recorrido: en qué va el pedido y qué viene. El saldo y qué llevar van
   *  en el detalle de su paso. Sin nombrar canal de aviso: hoy avisa push o
   *  WhatsApp según lo que tenga el comprador, y prometer uno es mentirle a
   *  quien no lo tiene. */
  pasos: TicketStep[]
}

const soles = (n: number) => `S/ ${Math.max(0, Math.round(n))}`

/** "48h" → "48 horas"; "24h (dia anterior hasta las 11:59pm)" → "24 horas".
 *  El texto del courier trae paréntesis operativos que al comprador no le
 *  dicen nada; si no calza con el patrón, mejor no prometer un plazo. */
export function etaEnPalabras(eta: string | null | undefined): string | null {
  if (!eta) return null
  const m = /^(\d{1,3})\s*h/i.exec(eta.trim())
  if (!m) return null
  const h = Number(m[1])
  if (h % 24 === 0 && h >= 48) return `${h / 24} días`
  return `${h} horas`
}

export function buildTicket(i: TicketInput): Ticket {
  const { state: s, price, paid, unpaid } = i
  const advance = s.advanceAmount
  const isAgency = s.deliveryMethod === 'AGENCIA'
  const rest = Math.max(0, price - advance)
  const lines: TicketLine[] = []
  const agencia = s.pickup.agency ? nombreAgencia(s.pickup.agency) : 'la agencia'

  lines.push({ label: 'Tu pedido', value: i.packName ?? 'Tu pack' })

  let destino: string
  if (isAgency) {
    if (i.branch) {
      destino = `${agencia} · ${i.branch.name}`
      lines.push({
        label: 'Lo recoges en',
        value: destino,
        detail: [i.branch.address, i.branch.district ?? i.branch.province].filter(Boolean).join(', ') || undefined,
      })
    } else if (s.pickup.freeText?.trim()) {
      destino = `${agencia} · ${s.pickup.freeText.trim()}`
      lines.push({ label: 'Lo recoges en', value: destino })
    } else {
      const donde = s.locationType === 'LIMA' ? s.limaAddress?.district : s.provinciaConfig?.district
      destino = donde ? `${agencia} · ${donde}` : agencia
      lines.push({ label: 'Lo recoges en', value: destino })
    }
  } else if (s.locationType === 'LIMA') {
    const a = s.limaAddress
    destino = a?.district ?? 'tu dirección'
    lines.push({
      label: 'Llega a',
      value: a?.addressText?.trim() || a?.district || 'Tu dirección',
      detail: a?.addressText ? [a.district, a.reference?.trim()].filter(Boolean).join(' · ') || undefined : undefined,
    })
  } else {
    const p = s.provinciaConfig
    destino = p?.district ?? 'tu dirección'
    lines.push({
      label: 'Llega a',
      value: p?.address?.addressText?.trim() || [p?.district, p?.province].filter(Boolean).join(', ') || 'Tu dirección',
      detail: p?.address?.addressText ? [p.district, p.address.reference?.trim()].filter(Boolean).join(' · ') || undefined : undefined,
    })
  }

  lines.push({ label: 'A nombre de', value: s.customerInfo.receiverName.trim() || '—' })

  // ── Cómo se pagó ──
  // Regla dura: nunca "tu pago no existe". Si hay adelanto y el webhook lo
  // confirmó, se dice con el monto. Si el comprador eligió coordinarlo, se
  // dice que un asesor lo hace. Si no hay cobro en línea, el pedido igual
  // está registrado y el adelanto se coordina por el chat.
  let payment: string
  if (advance > 0 && !unpaid) {
    payment = paid
      ? `Pago recibido por Yape: ${soles(advance)} de ${soles(price)}.`
      : `Pedido registrado. Tu adelanto de ${soles(advance)} lo coordina un asesor por el chat.`
  } else if (advance > 0 && unpaid) {
    payment = `Pedido registrado. Un asesor te escribe para coordinar tu adelanto de ${soles(advance)}.`
  } else {
    payment = `Pedido registrado. Pagas ${soles(price)} al recibir.`
  }

  // ── La guía, si ya salió ──
  const conGuia = !!(isAgency && i.guide && (i.guide.numero || i.guide.oseId))
  const guide = conGuia && i.guide
    ? {
        line: { label: `Guía ${nombreAgencia(i.guide.courier ?? s.pickup.agency ?? '')}`, value: idsDeGuia(i.guide) },
        button: `${nombreGuia(i.guide.courier ?? s.pickup.agency ?? '')}`,
        href: i.guide.href,
      }
    : null

  // ── El recorrido ──
  // Los pasos se escriben una vez y el ESTADO se deriva de un solo número: en
  // qué paso va. Antes cada paso decidía el suyo con su propia condición, y
  // eso no sabía crecer — el envío puede avanzar cuatro veces más (lo dice el
  // courier) y el recorrido se quedaba clavado en "salió la guía".
  //
  // El saldo va en el paso donde se paga y el DNI en el paso donde se pide:
  // una cifra fuera de su momento asusta, y en su momento explica.
  const plazo = etaEnPalabras(s.provinciaConfig?.eta)
  const cobrado = advance > 0 ? (paid && !unpaid) : true

  const crudos: Omit<TicketStep, 'estado'>[] = [
    advance > 0 && !cobrado
      ? { label: 'Pedido registrado', detail: `Un asesor te escribe para coordinar tu adelanto de ${soles(advance)}.` }
      : { label: advance > 0 ? 'Pago recibido' : 'Pedido registrado', detail: advance > 0 ? `${soles(advance)} por Yape.` : undefined },
  ]

  if (isAgency) {
    crudos.push(
      {
        label: 'Guía de envío emitida',
        detail: guide ? `${guide.line.label}: ${guide.line.value}` : 'Te avisaremos a tu celular apenas salga.',
      },
      { label: `En camino a ${agencia}`, detail: plazo ? `Suele tardar ${plazo}.` : undefined },
      {
        // Corto a propósito (07-set-2026): el párrafo largo explicaba la
        // mecánica del pago en un momento en el que todavía no toca. Lo que
        // hace falta es que reconozca el botón cuando llegue, así que se
        // enseña APAGADO debajo. "Nunca en la agencia" se queda —tres
        // palabras— porque es lo que evita que pague en efectivo en el
        // mostrador y se quede sin clave.
        label: 'Llegó a la agencia',
        detail: rest > 0
          ? `Paga tu saldo de ${soles(rest)} desde aquí —nunca en la agencia— y te damos tu clave de recojo.`
          : 'Te avisaremos a tu celular, con tu clave de recojo.',
        accion: rest > 0 ? `Pagar ${soles(rest)} con Yape` : undefined,
      },
      { label: 'Recojo', detail: `En ${destino}, con tu DNI y tu clave de recojo.` },
    )
  } else {
    crudos.push(
      { label: 'Preparando tu pedido' },
      {
        label: `En camino a ${destino}`,
        detail: [plazo ? `Suele tardar ${plazo}.` : null, 'Te avisaremos a tu celular cuando salga.'].filter(Boolean).join(' '),
      },
      {
        label: 'Entrega',
        detail: rest > 0 ? `Pagas ${soles(advance > 0 ? rest : price)} al recibir.` : 'No te queda nada por pagar.',
      },
    )
  }

  const { actual, completado } = enQuePasoVa({
    isAgency, cobrado, conGuia, fase: i.fase, ultimo: crudos.length - 1,
  })
  const pasos: TicketStep[] = crudos.map((p, idx) => ({
    ...p,
    estado: idx < actual ? 'hecho' : idx === actual ? (completado ? 'hecho' : 'actual') : 'pendiente',
  }))

  return { payment, lines, guide, pasos }
}

/**
 * En qué paso va el pedido, en UN número.
 *
 * Manda lo que reporta el courier, porque es el único hecho comprobable: el
 * comprador que recarga su pedido para ver si avanzó tiene que ver que avanzó.
 * Sin fase se cae a lo que se sabe sin él —si el adelanto cruzó y si la guía
 * existe—, que es todo lo que había antes de que esta pantalla tuviera URL.
 */
function enQuePasoVa(p: {
  isAgency: boolean
  cobrado: boolean
  conGuia: boolean
  fase: string | null | undefined
  ultimo: number
}): { actual: number; completado: boolean } {
  // Sin cobro no hay envío que seguir: el pedido está en su primer paso.
  if (!p.cobrado) return { actual: 0, completado: false }

  const fase = String(p.fase ?? '').toUpperCase()
  if (fase === 'ENTREGADO') return { actual: p.ultimo, completado: true }
  // En agencia el último paso es el RECOJO, que lo hace el comprador: que el
  // paquete esté en el mostrador no es haberlo recogido.
  if (fase === 'EN_DESTINO') return { actual: p.isAgency ? 3 : 2, completado: false }
  // `EN_ORIGEN` es "entró a la agencia de origen": para el comprador ya es
  // camino, y decirle otra cosa sería vocabulario del courier, no suyo.
  if (fase === 'EN_TRANSITO' || fase === 'EN_ORIGEN') return { actual: 2, completado: false }

  if (!p.isAgency) return { actual: 1, completado: false }
  return { actual: p.conGuia ? 2 : 1, completado: false }
}

/** Los ids como los nombra el voucher del courier — el mismo vocabulario que
 *  `_shared/mensaje-de-guia.ts` usa en el chat, para que la captura y el chat
 *  digan lo mismo. Sin la clave: la clave se entrega contra el saldo. */
function idsDeGuia(g: TicketGuide): string {
  if (String(g.courier).toUpperCase() === 'OLVA') return `N.º ${g.numero ?? g.oseId}`
  if (!g.numero) return `Orden de servicio ${g.oseId}`
  return `Nro. de orden ${g.numero}${g.codigo ? ` · Código ${g.codigo}` : ''}`
}

function nombreGuia(a: string): string {
  return String(a).toUpperCase() === 'OLVA' ? 'Olva' : 'Shalom'
}

function nombreAgencia(a: string): string {
  switch (a) {
    case 'SHALOM': return 'Shalom'
    case 'OLVA': return 'Olva'
    default: return 'Agencia'
  }
}
