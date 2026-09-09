// ─── El ticket, armado desde la fila del pedido ──────────────────────────────
//
// Lo usaban solo `/pedido/:token` (la página para MIRAR) y ahora también el chat
// (`/p/:token`): la tarjeta del pedido y su hoja de detalle se pintan con los
// mismos `pasos` que el recorrido de la página hermana, así que las dos
// pantallas dicen lo mismo del mismo pedido. La sede se pide al catálogo
// porque la fila no la guarda: solo el id que eligió el comprador.

import { useEffect, useMemo, useState } from 'react'
import { buildTicket } from '../../lib/checkout/ticket'
import type { Ticket, TicketGuide } from '../../lib/checkout/ticket'
import { coordinadoDelPedido, estadoDesdePedido, pagadoDelPedido } from '../../lib/checkout/ticket-desde-pedido'
import { AgencyService } from '../../lib/checkout/services/AgencyService'
import type { AgencyBranch } from '../../lib/checkout/types'
import { pickupBranchIdOf } from '../../lib/session'
import { enlaceDeGuia } from '../../lib/hoja-de-guia'
import { useStore } from '../../lib/store-context'
import type { OrderMessage, OrderSession } from '../../lib/order-api'

/** Cómo se NOMBRA el pedido en una línea: el pack, o el primer producto y
 *  cuántos más. El ticket tiene una sola línea para esto. */
export function nombreDelPedido(p: Pick<OrderSession, 'items' | 'pack_name' | 'product_name'>): string {
  const items = p.items ?? []
  if (items.length > 1) return `${items[0].nombre} +${items.length - 1} más`
  return p.pack_name ?? p.product_name ?? 'Tu pedido'
}

export function useTicketDelPedido(
  pedido: OrderSession | null,
  mensajes: OrderMessage[],
  token: string,
): Ticket | null {
  // Solo los couriers con catálogo de sedes: `OTRO` no tiene nada que pedir.
  const agencia = pedido?.agency_name === 'SHALOM' || pedido?.agency_name === 'OLVA'
    ? pedido.agency_name
    : null
  const { store } = useStore()
  const branchId = pedido ? pickupBranchIdOf(pedido) : null
  const [sede, setSede] = useState<AgencyBranch | null>(null)
  useEffect(() => {
    if (!agencia || !branchId) return
    let vivo = true
    AgencyService.getBranch(agencia, branchId)
      .then(b => { if (vivo) setSede(b) })
      .catch(() => { /* el ticket cae al distrito */ })
    return () => { vivo = false }
  }, [agencia, branchId])

  // La guía, como la ve el ticket: el PDF del courier si el chat ya lo trae, y
  // si no la hoja de guía de la app. Misma regla que la tarjeta del chat.
  const pdf = mensajes.find(m => m.type === 'guia' && m.media_url)?.media_url ?? null

  return useMemo(() => {
    if (!pedido) return null
    const guide: TicketGuide | null = pedido.tracking_numero || pedido.tracking_ose_id
      ? {
          courier: pedido.tracking_courier ?? null,
          numero: pedido.tracking_numero ?? null,
          codigo: pedido.tracking_codigo ?? null,
          oseId: pedido.tracking_ose_id ?? null,
          href: pdf ?? enlaceDeGuia(token),
        }
      : null
    return buildTicket({
      state: estadoDesdePedido(pedido),
      price: Number(pedido.product_price ?? 0),
      packName: nombreDelPedido(pedido),
      // La miniatura del ticket: la foto del pack que compró, elegida por el
      // servidor al crear el pedido (`_shared/packs.ts`). Con varios productos
      // es la del primero, que es justo el que nombra la línea. Sin foto de
      // pack, el logo cuadrado de la marca.
      packImage: pedido.items?.[0]?.image ?? null,
      storeLogo: store.logo_url,
      paid: pagadoDelPedido(pedido),
      unpaid: coordinadoDelPedido(pedido),
      branch: sede,
      guide,
      fase: pedido.tracking_phase,
    })
  }, [pedido, pdf, sede, token, store.logo_url])
}
