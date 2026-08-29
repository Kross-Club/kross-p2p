// ─── Qué tiendas ves, y con qué mando ────────────────────────────────────────
//
// Entrar como alguien es **una vista**, no una identidad. El servidor decide lo
// que se PUEDE mirando el JWT del vendedor real —el objeto de suplantación vive
// en `localStorage`, así que no puede decidir nada—; la pantalla decide lo que
// se MUESTRA siguiendo a quien estás actuando.
//
// Hasta hoy la pantalla de Tiendas no hacía ni una cosa ni la otra: leía al
// vendedor REAL y, para no acabar enseñando los datos de uno con el nombre de
// otro en la cabecera, se bloqueaba entera en cuanto había suplantación
// (`!isAdmin || impersonating`). El costo era que "Entrar como" —que existe
// justamente para ver lo que ese otro ve— chocaba con un cartel; y que el super
// admin que entraba a una marca no podía tocar la marca a la que acababa de
// entrar, que es la razón número uno para entrar.
//
// Las dos preguntas se separan acá, y la clave es que **actuar solo rebaja**:
// solo se entra como alguien que ya está dentro del alcance propio, así que
// cruzar el permiso del servidor con el de la persona actuada nunca amplía
// nada — como mucho enseña de menos, que es exactamente lo que se quiere.

import { administraLaPlataforma } from '../../supabase/functions/_shared/alcance.ts'

export interface QuienActua {
  store_id?: string | null
  is_admin?: boolean | null
  is_super_admin?: boolean | null
}

export interface VistaDeTiendas<T> {
  /** ¿Se ve la plataforma —todas las tiendas, crear, entrar— o UNA marca? */
  plataforma: boolean
  /** Las filas que toca pintar. */
  visibles: T[]
}

/**
 * @param tiendas            lo que devolvió el servidor para el vendedor REAL
 * @param actuando           a quién se está actuando (`effective`)
 * @param plataformaEnServidor  el `is_super` que respondió `manage-store`
 */
export function vistaDeTiendas<T extends { id: string }>(
  tiendas: T[],
  actuando: QuienActua | null | undefined,
  plataformaEnServidor: boolean,
): VistaDeTiendas<T> {
  // La Y es el corazón: el servidor dice hasta dónde llega quien llama, y
  // `actuando` hasta dónde llega la vista. Basta con que una diga "no".
  const plataforma = plataformaEnServidor && administraLaPlataforma(actuando)
  if (plataforma) return { plataforma, visibles: tiendas }
  // Dentro de una marca solo se ve esa marca. Sin `store_id` no se ve ninguna:
  // enseñarlas todas sería justo el caso que esto evita.
  const suya = actuando?.store_id
  return { plataforma, visibles: suya ? tiendas.filter(t => t.id === suya) : [] }
}
