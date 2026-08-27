import { useEffect, useState } from 'react'
import { AgencyService } from './checkout/services/AgencyService'
import type { AgencyName } from './checkout/types'
import { isPickupDispatch, pickupBranchIdOf } from './session'

// ─── De dónde es este pedido ─────────────────────────────────────────────────
//
// Distrito, provincia y departamento. Es lo primero que un vendedor necesita
// saber al abrir un chat —decide el courier, el costo del envío y cuánto tarda—
// y estaba escondido: la cabecera decía "En línea ahora" y la ficha decía "Sin
// distrito" en todo pedido que va por agencia.
//
// El dato vive en dos sitios distintos según cómo recibe el comprador, y esa es
// justamente la razón de que esto exista una sola vez:
//
//   · a domicilio → el `address` del pedido, que ya viene como
//     "Aramango, Bagua, Amazonas"
//   · recojo en agencia → la SEDE, no el `address`: el address es el distrito
//     del comprador, y un pedido de Chaclacayo que se recoge en Huaycán se leía
//     como "Chaclacayo" (misma trampa que documenta AddressBar).

/**
 * Junta las partes de una ubicación y las escribe como se dicen.
 *
 * Quita las repetidas seguidas porque en Perú la ciudad, la provincia y el
 * departamento coinciden muy seguido: "Arequipa · Arequipa · Arequipa" no
 * informa más que "Arequipa", y sí ocupa el triple.
 */
export function formatoUbicacion(partes: (string | null | undefined)[]): string | null {
  const limpias: string[] = []
  for (const p of partes) {
    const v = (p ?? '').trim()
    if (!v) continue
    if (limpias.length && limpias[limpias.length - 1].toLowerCase() === v.toLowerCase()) continue
    limpias.push(v)
  }
  return limpias.length ? limpias.join(' · ') : null
}

/** La ubicación escrita en el `address` del pedido: "Distrito, Provincia, Depto". */
export function ubicacionDeDireccion(address: string | null | undefined): string | null {
  return formatoUbicacion((address ?? '').split(','))
}

export interface PedidoUbicable {
  address?: string | null
  dispatch_type?: string | null
  agency_name?: string | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
}

/**
 * La ubicación del pedido, resolviendo la sede si va por agencia.
 *
 * Es un hook porque el catálogo de sedes se carga aparte del bundle. Mientras
 * llega se muestra lo que se pueda sacar del `address`, para no dejar el hueco
 * parpadeando.
 */
export function useUbicacion(pedido: PedidoUbicable | null | undefined): string | null {
  const deDireccion = ubicacionDeDireccion(pedido?.address)
  const esRecojo = isPickupDispatch(pedido?.dispatch_type)
  const agencia = pedido?.agency_name ?? null
  const sedeId = pedido ? pickupBranchIdOf(pedido) : null

  // La sede resuelta se guarda JUNTO a la id que la originó, y se descarta
  // sola si dejan de coincidir. Limpiarla desde el efecto la borraría un render
  // tarde, y en ese render se vería la sede del pedido anterior.
  const [sede, setSede] = useState<{ id: string; valor: string | null } | null>(null)

  useEffect(() => {
    if (!esRecojo || !agencia || !sedeId) return
    let vivo = true
    AgencyService.getBranch(agencia as AgencyName, sedeId)
      .then(b => {
        if (vivo) setSede({ id: sedeId, valor: b ? formatoUbicacion([b.district, b.province, b.department]) : null })
      })
      .catch(() => { if (vivo) setSede({ id: sedeId, valor: null }) })
    return () => { vivo = false }
  }, [esRecojo, agencia, sedeId])

  const deSede = sede && sede.id === sedeId ? sede.valor : null
  return deSede ?? deDireccion
}
