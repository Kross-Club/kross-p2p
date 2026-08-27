// ─── El cliente, visto desde sus pedidos — lógica COMPARTIDA ─────────────────
//
// Cuánto vale un cliente y cuándo le toca volver son UNA definición, no una por
// pantalla. Vivía copiada en dos sitios (`retention-metrics` y `run-campaign`) y
// el listado de clientes iba a ser la tercera; con tres copias, el chip que dice
// "toca recompra" en la ficha y el contador del segmento que dispara la campaña
// se separan en cuanto alguien toca una sola.
//
// La regla que las une: **solo cuenta lo ENTREGADO**. Un pedido en `nuevo` no es
// plata, y en contraentrega uno `no_entregado` tampoco — se devolvió. El LTV de
// un cliente es lo que de verdad se cobró.

const DIA = 86_400_000

/** A qué segmento de reactivación pertenece un cliente, si a alguno. */
export type Segmento = 'restock' | 'winback' | null

export interface ResumenComprador {
  /** Pedidos ENTREGADOS. Es la única definición de "me compró". */
  pedidos: number
  /** Suma del `product_price` de esos pedidos: lo que de verdad entró. */
  gastado: number
  /** Fecha del último pedido entregado, en ms. `0` = ninguno. */
  ultimo: number
}

export interface PedidoDeComprador {
  buyer_id?: string | null
  product_price?: number | string | null
  created_at?: string | null
}

/**
 * Agrega los pedidos ENTREGADOS por comprador.
 *
 * Quien llama es responsable de traer solo `stage = 'entregado'`: filtrar en la
 * consulta y no acá es lo que mantiene barata la lectura cuando la tienda crece.
 */
export function agregarPorComprador(pedidos: PedidoDeComprador[]): Map<string, ResumenComprador> {
  const porComprador = new Map<string, ResumenComprador>()
  for (const p of pedidos) {
    const id = p.buyer_id
    if (!id) continue
    const precio = Number(p.product_price ?? 0)
    const t = Date.parse(String(p.created_at ?? '')) || 0
    const a = porComprador.get(id) ?? { pedidos: 0, gastado: 0, ultimo: 0 }
    a.pedidos += 1
    a.gastado += precio
    a.ultimo = Math.max(a.ultimo, t)
    porComprador.set(id, a)
  }
  return porComprador
}

/**
 * En qué segmento de reactivación cae un cliente.
 *
 *   restock  → compró y el consumible ya se le debe estar acabando
 *   winback  → hace tanto que no compra que se está yendo
 *   null     → ni una cosa ni la otra (recién compró, o nunca compró)
 *
 * Las dos ventanas las configura cada marca (`stores.restock_days` /
 * `winback_days`). Sin último pedido no hay segmento: a quien nunca compró no se
 * le puede pedir que "vuelva".
 */
export function segmentoDe(
  ultimoMs: number,
  ahoraMs: number,
  restockDias: number,
  winbackDias: number,
): Segmento {
  if (!ultimoMs) return null
  const dias = (ahoraMs - ultimoMs) / DIA
  if (dias >= restockDias && dias < winbackDias) return 'restock'
  if (dias >= winbackDias) return 'winback'
  return null
}

/** Las dos ventanas de una tienda, con los mismos valores por defecto en todos
 *  lados. `Math.max(1, …)` porque una ventana de 0 días marcaría a todo el
 *  mundo como "toca recompra" el mismo día que compró. */
export function ventanasDe(store: { restock_days?: unknown; winback_days?: unknown } | null | undefined) {
  return {
    restockDias: Math.max(1, Number(store?.restock_days ?? 30)),
    winbackDias: Math.max(1, Number(store?.winback_days ?? 60)),
  }
}
