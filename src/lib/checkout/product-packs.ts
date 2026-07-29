// ─── SALES ENGINE · Packs del producto → opciones del checkout ───────────────
// Los precios y las imágenes son de la MARCA (columna `products.packs`), no de
// la config: Kross es multi-tenant y cada una tiene los suyos. Aquí solo se
// traducen a la forma que consume el paso 1, aplicando las reglas de config.

import { defaultPackIndex } from './checkout.config'

/** Forma cruda de `products.packs` en la BD. */
export interface RawPack {
  nombre: string
  descripcion?: string
  precio: number
}

export interface PackOption {
  id: string
  nombre: string
  descripcion?: string
  precio: number
  unidades: number
  image?: string
}

/**
 * Cuántas unidades trae el pack. La marca no lo declara como número, así que se
 * lee del nombre ("2 unidades", "Pack x3", "3 UNIDADES"). Sin número → 1, que es
 * el supuesto seguro: subestimar unidades solo hace que el ahorro se muestre
 * menor de lo real, nunca mayor.
 */
export function unitsOf(nombre: string): number {
  const m = nombre.match(/(?:^|\D)(\d{1,2})\s*(?:unidad|und|u\b|pack|piezas?)?/i)
  const n = m ? Number(m[1]) : 1
  return n >= 1 && n <= 20 ? n : 1
}

export interface PackSelection {
  packs: PackOption[]
  /** Precio de UNA unidad, base para calcular el ahorro de cada pack. */
  unitPrice: number
  /** Pack preseleccionado y destacado con el badge. */
  defaultPackId: string | null
}

/**
 * Ordena los packs de menor a mayor precio (para que el ahorro se lea de arriba
 * abajo) y resuelve cuál va preseleccionado.
 */
export function buildPackSelection(
  rawPacks: RawPack[] | null | undefined,
  productPrice: number,
  images: string[] = [],
): PackSelection {
  const sorted = [...(rawPacks ?? [])].sort((a, b) => a.precio - b.precio)

  const packs: PackOption[] = sorted.map((p, i) => ({
    id: `pack-${i}`,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    unidades: unitsOf(p.nombre),
    image: images[0],
  }))

  // El precio unitario sale del pack más chico, no del precio del producto: si
  // la marca puso una oferta en el pack de 1, el ahorro debe medirse contra esa.
  const smallest = packs[0]
  const unitPrice = smallest ? smallest.precio / smallest.unidades : productPrice

  const idx = defaultPackIndex(packs.length)
  return { packs, unitPrice, defaultPackId: packs[idx]?.id ?? null }
}
