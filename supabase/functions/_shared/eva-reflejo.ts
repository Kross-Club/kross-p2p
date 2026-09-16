// ─── Reflejar UN estado de Eva en el pedido ──────────────────────────────────
//
// Compartido entre las DOS entradas, y por la misma razón que `tracking.ts`
// existe: si un estado se reflejara distinto según por dónde llegó, el mismo
// pedido hablaría dos idiomas.
//
//   · `eva-webhook`  — Eva empuja el cambio (la entrada rápida).
//   · `order-manage` · `consultar_eva` — el botón «Actualizar» del panel, que
//     pregunta `GET /api/v1/orders/{tracking_id}/`.
//
// La segunda no es un lujo: en el portal de Eva **el estado lo mueve el
// motorizado**, no el cliente, así que un vendedor que quiere saber dónde está
// su paquete no tiene otra forma de averiguarlo hasta que Eva llame. Y si el
// webhook no llega —Eva no reintenta—, esto es lo único que cierra el pedido.

import { applyTracking, broadcast, chatMessage, supabase, type TrackedRow } from './tracking.ts'
import { anotar } from './api-eventos.ts'
import { esCierreSinEntregaEva, esDemoraEva, faseDeEva, mensajesDeEva } from './eva.ts'

/** La fila del pedido más lo que Eva ya había dicho de él. */
export type FilaEva = TrackedRow & {
  order_id?: string | null
  eva_estado?: string | null
  eva_estado_at?: string | null
}

/** Un estado de Eva, venga del webhook o de la consulta. */
export interface EstadoDeEva {
  estado: string
  motivo?: string | null
  comentarios?: string | null
  fotos?: string[]
  fechahora?: string | null
}

export interface ResultadoDeReflejo {
  /** `false` = el mismo estado con la misma hora: ya estaba reflejado. */
  aplicado: boolean
  patch: Record<string, unknown>
}

/**
 * Aplica el estado al pedido: la fase (solo hacia adelante), la demora, el
 * cierre, los avisos a cada lado y el rastro crudo.
 *
 * Idempotente: mismo estado + misma hora = mismo hecho, y no se vuelve a
 * escribir en el chat. Cada visita fallida sí cuenta —otra hora es otra
 * visita—, que es justo lo que el vendedor necesita saber. Y un estado SIN
 * hora (el GET de un pedido recién registrado no trae hitos, ver 17-EVA §9)
 * que es el mismo que ya tenemos tampoco es novedad: si contara, cada
 * «Actualizar» reescribiría la hora y anotaría un evento por nada.
 */
export async function reflejarEstadoEva(row: FilaEva, ev: EstadoDeEva): Promise<ResultadoDeReflejo> {
  const estado = ev.estado
  const ahora = new Date().toISOString()
  const patch: Record<string, unknown> = { eva_estado: estado, eva_estado_at: ev.fechahora ?? ahora }

  const mismo = row.eva_estado === estado
    && (!ev.fechahora || (!!row.eva_estado_at && row.eva_estado_at === ev.fechahora))
  if (mismo) return { aplicado: false, patch: {} }

  const ctx = { proveedor: 'EVA' as const, storeId: row.store_id, sessionId: row.id }
  await anotar({ ...ctx, op: 'reparto.estado', outcome: 'OK', providerRef: row.tracking_numero, detail: estado })

  const msgs = mensajesDeEva(estado, { motivo: ev.motivo, comentarios: ev.comentarios, fotos: ev.fotos ?? [] })
  const foto = (ev.fotos ?? [])[0]
  if (estado === 'ENTREGADO' && foto) patch.eva_entrega_foto = foto

  const fase = faseDeEva(estado)
  if (fase) {
    // Con los mensajes de EVA y no los de agencia: un domicilio no «llega a tu
    // agencia». `applyTracking` sigue decidiendo si la fase avanza.
    await applyTracking(row, { phase: fase, demoraIso: null }, {
      alAvanzar: async () => {
        if (msgs.comprador) await chatMessage(row.id, msgs.comprador, 'all')
        if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
      },
    })
  } else if (esDemoraEva(estado)) {
    patch.tracking_demora_at = ev.fechahora ?? ahora
    if (msgs.comprador) await chatMessage(row.id, msgs.comprador, 'all')
    if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
  } else if (esCierreSinEntregaEva(estado)) {
    if (msgs.equipo) await chatMessage(row.id, msgs.equipo, 'sellers')
  } else if (row.eva_estado !== estado && msgs.equipo) {
    await chatMessage(row.id, msgs.equipo, 'sellers')
  }

  const { error } = await supabase.from('order_sessions').update(patch).eq('id', row.id)
  if (error) {
    console.error('[eva] reflejo: update', row.id, error.message)
    return { aplicado: false, patch: {} }
  }
  await broadcast(row.id, 'tracking_update', patch)
  return { aplicado: true, patch }
}

/** Las columnas que el reflejo necesita, además de las de `TRACKED_COLUMNS`. */
export const COLUMNAS_EVA = 'order_id, eva_estado, eva_estado_at'
