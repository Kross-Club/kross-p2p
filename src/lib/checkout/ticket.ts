// ─── El ticket del pedido ────────────────────────────────────────────────────
// Lo que la pantalla final le deja al comprador EN LA MANO después de pagar.
//
// Existe por una decisión de producto (05-set-2026, ver `01-SALES-ENGINE.md`
// § Pantalla final): el comprador de provincia con poca costumbre digital no
// instala la app ni vuelve al chat; guarda CAPTURAS. La pantalla de gracias se
// diseña para ser capturada: una sola pantalla con todo lo que va a necesitar
// el día que le avisen que su paquete llegó. Nada que requiera volver.
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
   *  mientras no exista: el ticket no la promete, "Qué sigue" ya avisa. */
  guide?: TicketGuide | null
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

export interface Ticket {
  /** Cómo se pagó, en una frase. Es la primera línea después del título. */
  payment: string
  /** El saldo que queda y CÓMO se paga. `null` si no queda saldo. */
  balance: TicketLine | null
  /** Producto, entrega y a nombre de quién. */
  lines: TicketLine[]
  /** La guía en el ticket: el NÚMERO es lo que la agencia pregunta, así que va
   *  como línea (una captura no tiene botones) y el botón va aparte. `null`
   *  hasta que exista. */
  guide: { line: TicketLine; button: string; href: string } | null
  /** Qué llevar el día de la entrega. Vacío en domicilio. */
  bring: string[]
  /** Qué va a pasar ahora, en una frase. Sin nombrar canal: hoy avisa push,
   *  WhatsApp o SMS según lo que tenga el comprador, y prometer uno es mentir
   *  a los que no lo tienen. */
  next: string
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

  lines.push({ label: 'Tu pedido', value: i.packName ?? 'Tu pack' })

  if (isAgency) {
    const agencia = s.pickup.agency ? nombreAgencia(s.pickup.agency) : 'la agencia'
    if (i.branch) {
      lines.push({
        label: 'Lo recoges en',
        value: `${agencia} · ${i.branch.name}`,
        detail: [i.branch.address, i.branch.district ?? i.branch.province].filter(Boolean).join(', ') || undefined,
      })
    } else if (s.pickup.freeText?.trim()) {
      lines.push({ label: 'Lo recoges en', value: `${agencia} · ${s.pickup.freeText.trim()}` })
    } else {
      const donde = s.locationType === 'LIMA' ? s.limaAddress?.district : s.provinciaConfig?.district
      lines.push({ label: 'Lo recoges en', value: donde ? `${agencia} · ${donde}` : agencia })
    }
  } else if (s.locationType === 'LIMA') {
    const a = s.limaAddress
    lines.push({
      label: 'Llega a',
      value: a?.addressText?.trim() || a?.district || 'Tu dirección',
      detail: a?.addressText ? [a.district, a.reference?.trim()].filter(Boolean).join(' · ') || undefined : undefined,
    })
  } else {
    const p = s.provinciaConfig
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
  let balance: TicketLine | null = null
  if (advance > 0 && !unpaid) {
    payment = paid
      ? `Pago recibido por Yape: ${soles(advance)} de ${soles(price)}.`
      : `Pedido registrado. Tu adelanto de ${soles(advance)} lo coordina un asesor por el chat.`
    if (rest > 0) {
      balance = {
        label: 'Te falta pagar',
        value: soles(rest),
        // Sin la palabra "app": quien no sabe qué es una app sí sabe qué es
        // Yape, un enlace y su celular. "Nunca en la agencia" evita que llegue
        // al mostrador con el saldo en efectivo y sin clave. La misma frase,
        // adaptada, vive en los mensajes del servidor (`_shared/mensaje-de-guia`,
        // `acuse-de-pago`, `tracking`).
        detail: isAgency
          ? 'Lo pagas con Yape desde el enlace de tu pedido, que te llega a tu celular cuando el paquete ya esté en camino. Nunca en la agencia. Al pagarlo te llega tu clave de recojo.'
          : 'Lo pagas al recibir tu pedido.',
      }
    }
  } else if (advance > 0 && unpaid) {
    payment = `Pedido registrado. Un asesor te escribe para coordinar tu adelanto de ${soles(advance)}.`
  } else {
    payment = `Pedido registrado. Pagas ${soles(price)} al recibir.`
  }

  // ── Qué llevar ──
  const bring: string[] = []
  if (isAgency) {
    bring.push('Tu DNI')
    // La clave de recojo aún no existe: la emite la guía. Se nombra para que
    // el día del recojo no sorprenda, y para que sepa que le llega al pagar.
    bring.push(rest > 0 ? 'Tu clave de recojo (te llega cuando pagas el saldo)' : 'Tu clave de recojo (te la enviaremos)')
  }

  // ── Qué sigue ──
  const plazo = etaEnPalabras(s.provinciaConfig?.eta)
  const tarda = plazo ? ` Suele tardar ${plazo}.` : ''
  const next = isAgency
    ? `Te avisaremos a tu celular cuando tu pedido llegue a la agencia.${tarda}`
    : `Te avisaremos a tu celular cuando tu pedido salga a tu dirección.${tarda}`

  // ── La guía, si ya salió ──
  const guide = isAgency && i.guide && (i.guide.numero || i.guide.oseId)
    ? {
        line: { label: `Guía ${nombreAgencia(i.guide.courier ?? s.pickup.agency ?? '')}`, value: idsDeGuia(i.guide) },
        button: `${nombreGuia(i.guide.courier ?? s.pickup.agency ?? '')}`,
        href: i.guide.href,
      }
    : null

  return { payment, balance, lines, guide, bring, next }
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
