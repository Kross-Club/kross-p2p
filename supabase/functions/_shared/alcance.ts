// ─── Hasta dónde llega alguien: su tienda, o toda la plataforma ──────────────
//
// Kross tiene una tienda que no vende: `platform`, la casa de quien opera la
// herramienta. Quien trabaja EN Kross vive ahí; quien trabaja en una marca vive
// en la suya. Eso ya era así en la tabla — lo que faltaba era leerlo.
//
// Hasta hoy el alcance se preguntaba por una bandera suelta, `is_super_admin`,
// que había que acordarse de encender al dar de alta a alguien. Y cuando no se
// encendía —porque el panel ya la mandaba pero la función desplegada todavía no
// la leía, que es exactamente lo que pasó con los operadores— quedaba una
// persona que ESTÁ en la plataforma pero no la administra: el login la echaba a
// "entra desde el sitio de tu marca", y su marca no existe. Un candado sin
// llave, y el que lo sufre no puede abrirlo.
//
// Así que el alcance deja de ser un dato que se recuerda y pasa a ser uno que
// se deduce: **la plataforma es un lugar, y quien administra desde ahí,
// administra la plataforma.** La bandera se sigue respetando —nadie pierde lo
// que ya tenía— pero ya no hace falta que esté para que las cosas funcionen.
//
// Vive en `_shared` porque las DOS mitades tienen que responder lo mismo. Si el
// panel dice "sí" y la función dice "no", el resultado es una pantalla que se
// ve bien y no hace nada: menús, botones y listas que al tocarlos devuelven
// vacío. **Esto no es la puerta, es la llave que las dos cerraduras aceptan.**
//
// Sin APIs de Deno: se importa también desde vitest y desde el panel.

/** La tienda de la plataforma (Kross HQ). No es una marca: no vende, no tiene
 *  pedidos y no vive en un subdominio. Ver §8 de `setup-kross.sql`. */
export const TIENDA_PLATAFORMA = 'platform'

/** Lo que hace falta saber de alguien para decidir su alcance. Estructural y no
 *  `SellerProfile`, igual que `Rasgos` en `permisos.ts`: lo mismo se pregunta de
 *  un perfil entero y de la fila de tres columnas que trae una Edge Function. */
export interface ConAlcance {
  store_id?: string | null
  is_admin?: boolean | null
  is_super_admin?: boolean | null
}

type Quien = ConAlcance | null | undefined

/** ¿Trabaja en Kross, y no en una marca? */
export function esDeLaPlataforma(p: Quien): boolean {
  return p?.store_id === TIENDA_PLATAFORMA
}

/**
 * ¿Su alcance es toda la plataforma?
 *
 * O sea: ve la lista de tiendas, entra a cualquiera y opera dentro. Es la
 * pregunta que antes se escribía `me.is_super_admin` repartida por once
 * funciones y cinco pantallas.
 *
 * Dos caminos y una sola respuesta:
 *
 *   · la bandera `is_super_admin`, que es lo que ya estaba escrito;
 *   · estar en la tienda de la plataforma administrando, que es lo mismo dicho
 *     por dónde vive la persona en vez de por una casilla.
 *
 * El segundo no ensancha nada: en `platform` solo hay quien opera Kross —los
 * pedidos son de las marcas, así que ahí no hay miembro raso que atender—, y a
 * un admin de marca se le crea en la suya. Lo que hace es que dar de alta a un
 * operador de la plataforma no pueda salir mal a medias.
 */
export function administraLaPlataforma(p: Quien): boolean {
  if (!p) return false
  return !!p.is_super_admin || (esDeLaPlataforma(p) && !!p.is_admin)
}
