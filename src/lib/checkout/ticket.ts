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
import { enlaceDeComprobante } from '../comprobante'

export interface TicketInput {
  state: CheckoutState
  /** Precio efectivo del pack (con descuento), el mismo que vio en el paso 3. */
  price: number
  /** Nombre del pack elegido, si lo hay. */
  packName: string | null
  /** La foto de ESE pack, para que el ticket enseñe lo que compró y no un
   *  frasco genérico. La elige el servidor al crear el pedido y viaja en
   *  `items[0].image` (`_shared/packs.ts`). */
  packImage?: string | null
  /** El logo CUADRADO de la marca. Es el respaldo de la miniatura cuando ese
   *  pack no tiene foto: no promete ninguna cantidad, y deja el ticket con la
   *  cara de la tienda en vez de un hueco gris. */
  storeLogo?: string | null
  /** El id del cobro PAGADO cuya constancia se le ofrece al comprador. `null`
   *  cuando todavía no hay ninguno cruzado — y entonces no se ofrece nada: un
   *  botón que abre «este comprobante no existe» es peor que ningún botón. */
  receiptCobroId?: string | null
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
  /** La clave de recojo de Shalom, SOLO cuando el servidor ya se la soltó al
   *  comprador (`get-session` la manda cuando no debe nada). Con ella el paso
   *  de la guía la enseña junto al número y el código: es lo que va a
   *  necesitar en el mostrador, y lo que se le prometió al pagar todo. */
  pickupCode?: string | null
  /** 🔮 La boleta electrónica (Nubefact), cuando exista. Solo aplica a quien
   *  pagó el pedido completo; mientras no haya URL el paso se enseña
   *  pendiente, con su botón apagado. */
  boletaUrl?: string | null
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
  /** La miniatura de la línea, al costado. Hoy solo la del pedido: la foto del
   *  pack que compró. Sin ella la línea se pinta igual, solo sin imagen. */
  image?: string | null
  /** Al COSTADO del valor, no debajo: el DNI de quien recoge va pegado a su
   *  nombre porque en el mostrador se leen juntos, y separarlos en dos
   *  renglones invita a llevar solo la mitad. */
  aside?: string
}

/** Qué paso es, con un nombre que no cambia aunque la etiqueta sí (la
 *  agencia va en el label). Es lo que usan el chat y las preguntas rápidas
 *  para razonar sin contar posiciones. */
export type TipoDePaso = 'pago' | 'boleta' | 'guia' | 'camino' | 'llegada' | 'recojo' | 'preparando' | 'entrega'

/** Un paso del recorrido del pedido, como lo ve el comprador. */
export interface TicketStep {
  tipo: TipoDePaso
  label: string
  /** Lo que ese paso implica para él: cuánto, dónde, con qué. */
  detail?: string
  /** El botón que ESE paso va a traer cuando llegue, enseñado apagado. No es
   *  decoración: el saldo se paga desde el pedido y nunca en el mostrador, y
   *  enseñarlo apagado ahora es lo que hace que se reconozca después. */
  accion?: string
  /** Con qué dibujo va `accion`: la billetera (pagar) o el documento (boleta). */
  accionIcono?: 'pago' | 'documento'
  /** El botón VIVO de ese paso: la constancia del pago, la guía del courier,
   *  la boleta. Abre en otra pestaña; una captura del recorrido sigue diciendo
   *  lo mismo sin él. */
  enlace?: { label: string; href: string }
  /** Lo que falta pagar en ESE paso (el saldo en «Llegó a la agencia»). Con
   *  esto quien pinta puede poner el botón de verdad —el que abre Yape— en
   *  vez del apagado, cuando el pedido ya lo permite. */
  saldo?: number
  estado: 'hecho' | 'actual' | 'pendiente'
}

export interface Ticket {
  /** Cómo se pagó, en una frase. Es la primera línea después del título. */
  payment: string
  /** La constancia de ese pago, si ya hay plata cruzada: el id del cobro, que
   *  ES la dirección de su página (`enlaceDeComprobante`). El comprador la
   *  enseña, la reenvía o la guarda como PDF. `null` = no hay pago cruzado
   *  todavía, y entonces no se ofrece ningún botón. */
  receiptCobroId: string | null
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

  // La miniatura: la foto del pack, y si ese pack no tiene, el logo cuadrado de
  // la marca. NO la primera foto del producto — esa es la del frasco suelto y
  // al que compró tres le enseñaría uno.
  lines.push({ label: 'Tu pedido', value: i.packName ?? 'Tu pack', image: i.packImage ?? i.storeLogo ?? null })

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

  // Quién RECOGE, no "a nombre de": el ticket se reenvía, y quien va al
  // mostrador puede no ser quien compró. Se nombra la acción que esa persona
  // va a hacer, con su documento al lado —es lo que le van a pedir—.
  // El DNI solo en AGENCIA: es donde se lo van a pedir. A domicilio no hay
  // mostrador, y el ticket no nombra un documento que nadie va a mirar —regla
  // vieja del módulo, con su prueba.
  const dni = String(s.customerInfo.dni ?? '').trim()
  lines.push({
    label: isAgency ? 'La persona que recoge' : 'La persona que recibe',
    value: s.customerInfo.receiverName.trim() || '—',
    aside: isAgency && dni ? `DNI ${dni}` : undefined,
  })

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

  // La constancia va EN el paso del pago (14-set-2026): antes colgaba de la
  // cabecera, lejos de la línea que la explica. Solo con plata cruzada.
  const comprobante = (paid && i.receiptCobroId) || null
  const crudos: Omit<TicketStep, 'estado'>[] = [
    advance > 0 && !cobrado
      ? { tipo: 'pago', label: 'Pedido registrado', detail: `Un asesor te escribe para coordinar tu adelanto de ${soles(advance)}.` }
      : {
          tipo: 'pago',
          label: advance > 0 ? 'Pago recibido' : 'Pedido registrado',
          detail: advance > 0 ? `${soles(advance)} por Yape.` : undefined,
          enlace: comprobante ? { label: 'Ver mi comprobante de pago', href: enlaceDeComprobante(comprobante) } : undefined,
        },
  ]

  // Solo el NÚMERO del documento (14-set-2026): el nombre pudo cambiar en el
  // camino, y lo que importa en el mostrador es que recoge el titular de ese
  // DNI, con la dirección de la agencia.
  const conDni = dni ? `con el DNI ${dni}` : 'con tu DNI'
  if (isAgency) {
    // La clave, pegada al número y al código de la guía cuando el servidor ya
    // la soltó (pagó todo, o pagó el saldo): es lo que lleva al mostrador.
    const clave = i.pickupCode ? ` · Clave ${i.pickupCode}` : ''
    crudos.push(
      {
        tipo: 'guia',
        label: 'Guía de envío emitida',
        detail: guide ? `${guide.line.label}: ${guide.line.value}${clave}` : 'Te avisaremos a tu celular apenas salga.',
        enlace: guide ? { label: `Ver mi guía de ${guide.button}`, href: guide.href } : undefined,
      },
      { tipo: 'camino', label: `En camino a ${agencia}`, detail: plazo ? `Suele tardar ${plazo}.` : undefined },
      {
        tipo: 'llegada',
        // Corto a propósito (07-set-2026): el párrafo largo explicaba la
        // mecánica del pago en un momento en el que todavía no toca. Lo que
        // hace falta es que reconozca el BOTÓN cuando llegue, y por eso se
        // enseña apagado debajo — el botón dice mejor que cualquier frase que
        // el saldo se paga acá. La advertencia de no pagar en el mostrador
        // sigue viva donde sí toca: en el aviso que le llega al celular cuando
        // el paquete llega (`_shared/tracking.ts`, `sms-texto.ts`).
        label: 'Llegó a la agencia',
        detail: rest > 0
          ? `Paga tu saldo de ${soles(rest)} desde aquí y te damos tu clave de recojo.`
          : 'Te avisaremos a tu celular, con tu clave de recojo.',
        accion: rest > 0 ? `Pagar ${soles(rest)} con Yape` : undefined,
        saldo: rest > 0 ? rest : undefined,
      },
      { tipo: 'recojo', label: 'Recojo', detail: `En ${destino}, ${conDni} y tu clave de recojo.` },
    )
  } else {
    crudos.push(
      { tipo: 'preparando', label: 'Preparando tu pedido' },
      {
        tipo: 'camino',
        label: `En camino a ${destino}`,
        detail: [plazo ? `Suele tardar ${plazo}.` : null, 'Te avisaremos a tu celular cuando salga.'].filter(Boolean).join(' '),
      },
      {
        tipo: 'entrega',
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

  // ── La boleta electrónica (14-set-2026) ──
  // Solo para quien pagó el pedido COMPLETO: es el documento tributario de esa
  // venta, y con un adelanto no hay venta cerrada que facturar. Va justo
  // después del pago y su estado es SUYO, no el del envío: mientras Nubefact
  // no exista (🔮) se enseña pendiente, con su botón apagado, aunque el
  // paquete ya esté en camino. Un paso «hecho» sin documento sería mentir.
  const pagoTodo = advance > 0 && cobrado && rest === 0
  if (pagoTodo) {
    pasos.splice(1, 0, i.boletaUrl
      ? { tipo: 'boleta', label: 'Boleta electrónica', detail: 'Lista para descargar.', enlace: { label: 'Ver mi boleta electrónica', href: i.boletaUrl }, estado: 'hecho' }
      : { tipo: 'boleta', label: 'Boleta electrónica', detail: 'Te la enviamos por aquí apenas se emita.', accion: 'Ver mi boleta electrónica', accionIcono: 'documento', estado: 'pendiente' })
  }

  // La constancia solo se ofrece si hay plata cruzada. Con el adelanto sin
  // cobrar no hay página que abrir, y la regla dura del módulo —al comprador
  // nunca se le dice que su pago no existe— se cumple callándose: no hay botón,
  // y tampoco una explicación de por qué no lo hay.
  return { payment, lines, guide, pasos, receiptCobroId: (paid && i.receiptCobroId) || null }
}

/**
 * Los pasos del ENVÍO: todos menos la boleta. Es lo que usan el chat y las
 * preguntas rápidas para saber en qué va el paquete —cuánto avanzó, si ya
 * llegó— sin que un documento pendiente cuente como un tramo del camino ni
 * impida dar por entregado un pedido que el courier ya entregó.
 */
export function pasosDelEnvio(pasos: TicketStep[]): TicketStep[] {
  return pasos.filter(p => p.tipo !== 'boleta')
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

export function nombreAgencia(a: string): string {
  switch (a) {
    case 'SHALOM': return 'Shalom'
    case 'OLVA': return 'Olva'
    default: return 'Agencia'
  }
}
