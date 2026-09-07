// ─── El ticket, reconstruido desde el pedido guardado ────────────────────────
//
// `buildTicket` nació leyendo el estado del checkout, que vive en memoria: la
// pantalla de "pedido confirmado" existía solo dentro del modal y una X la
// borraba para siempre (07-set-2026). Ahora esa pantalla tiene URL propia
// (`/pedido/:token`), así que hay que poder armarla desde lo ÚNICO que
// sobrevive: la fila del pedido.
//
// Este módulo es esa traducción, y es puro a propósito — se prueba sin red y
// sin React. Lo que la fila no guarda (el plazo del courier, el distrito
// suelto) se deja vacío: el ticket ya sabe callarse cuando un dato no está,
// y prometer un plazo que nadie escribió sería inventarlo.

import { pickupBranchIdOf } from '../session'
import { isPickupDispatch } from '../../../supabase/functions/_shared/despacho.ts'
import type { CheckoutState } from './types'

/** Lo que hace falta de la fila del pedido. Un subconjunto de `OrderSession`,
 *  escrito acá para que este módulo no dependa de la API. */
export interface PedidoGuardado {
  buyer_name?: string | null
  product_price?: number | null
  pack_name?: string | null
  product_name?: string | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  payment_provider?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
  address?: string | null
}

/** El número tal cual lo guarda la base, que a veces viaja como texto. */
const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * La fila del pedido con la forma que `buildTicket` sabe leer.
 *
 * No es un `CheckoutState` completo ni pretende serlo: es el subconjunto que
 * el ticket consulta. Se marca como tal para que nadie lo confunda con el
 * estado vivo del formulario.
 */
export function estadoDesdePedido(p: PedidoGuardado): CheckoutState {
  const agencia = isPickupDispatch(p.dispatch_type)
  const branchId = pickupBranchIdOf(p)
  // La referencia guarda dos cosas distintas: el id de la sede (cuando es un
  // número) o la sede escrita a mano. Solo lo segundo es texto para enseñar.
  const ref = String(p.delivery_reference ?? '').trim()
  const sedeEscrita = ref && !/^\d+$/.test(ref) ? ref : null
  const direccion = String(p.address ?? '').trim() || null

  return {
    customerInfo: { dni: '', whatsapp: '', receiverName: String(p.buyer_name ?? '').trim() },
    // Lima o provincia solo cambia de qué campo sale la dirección; en agencia
    // manda la sede, así que el ticket no lo nota.
    locationType: String(p.dispatch_type ?? '').includes('LIMA') ? 'LIMA' : 'PROVINCIA',
    deliveryMethod: agencia ? 'AGENCIA' : 'DOMICILIO',
    pickup: { agency: (p.agency_name ?? null) as CheckoutState['pickup']['agency'], branchId, freeText: sedeEscrita },
    limaAddress: direccion ? { addressText: direccion, district: null, reference: null, lat: null, lng: null } : null,
    provinciaConfig: direccion
      ? { department: null, province: null, district: null, city: null, eta: null, lat: null, lng: null, coverageResult: null, address: { addressText: direccion, district: null, reference: null, lat: null, lng: null } }
      : null,
    advanceAmount: num(p.advance_amount),
  } as unknown as CheckoutState
}

/** ¿El adelanto ya cruzó? Es lo que decide si el ticket dice "pago recibido". */
export const pagadoDelPedido = (p: PedidoGuardado): boolean =>
  String(p.payment_verification ?? '').toUpperCase() === 'MATCHED'

/**
 * ¿El adelanto lo coordina un asesor en vez de cobrarse en línea?
 *
 * Sin riel (`payment_provider` vacío) y con adelanto, el pedido quedó
 * registrado para que alguien lo coordine por el chat. Es la misma rama que en
 * el checkout elige "prefiero que me escriban", y la regla dura del módulo
 * manda: al comprador NUNCA se le dice que su pago no existe.
 */
export const coordinadoDelPedido = (p: PedidoGuardado): boolean =>
  num(p.advance_amount) > 0 && !pagadoDelPedido(p) && !String(p.payment_provider ?? '').trim()
