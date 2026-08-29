// ─── Quién puede qué ─────────────────────────────────────────────────────────
//
// El panel tenía DOS niveles: administrador o miembro del equipo. Con eso, dar
// de alta a alguien que ayude a operar la plataforma obligaba a elegir entre
// darle todo —incluido apagar la tienda de un cliente— o darle nada.
//
// Ahora son tres, y el que entra en medio es el **operador**: hace todo lo que
// hace el administrador MENOS destruir.
//
//   miembro     · lo suyo: sus pedidos
//   operador    · todo lo del admin, salvo destruir
//   admin       · todo
//
// Los dos ejes son independientes a propósito:
//
//   · `is_admin` / `is_super_admin` dicen **hasta dónde llega**: su tienda, o
//     toda la plataforma. Esa pregunta ya no se responde acá: vive en
//     `_shared/alcance.ts`, porque el servidor tiene que contestarla igual.
//   · `is_operator` dice **qué NO puede hacer** dentro de ese alcance — y eso
//     sí es de este archivo.
//
// Así "operador de una marca" y "operador de la plataforma" son la misma regla
// aplicada a distinto alcance, sin una tercera columna ni un segundo camino.
//
// **Esto no es la puerta, es la manija.** Ocultar un botón no protege nada: un
// POST a la Edge Function pasa igual. Cada regla de acá tiene su gemela en el
// servidor (`admin-team`, `manage-store`, `manage-product`), y la del servidor
// es la que manda. La de acá existe para no ofrecer lo que va a ser rechazado.

/**
 * Lo que hace falta saber de alguien para decidir.
 *
 * Estructural y no `SellerProfile`, a propósito: lo mismo se pregunta de un
 * perfil completo, de la fila que devuelve una consulta con cuatro columnas y
 * del objeto que arma una prueba. Atarlo al perfil obligaría a inventar un
 * perfil entero para preguntar por una bandera.
 */
export interface Rasgos {
  is_admin?: boolean
  is_super_admin?: boolean
  is_operator?: boolean
  role_label?: string | null
}

/** Un `null` —sesión sin resolver, o sin perfil— no puede nada. */
type Quien = Rasgos | null | undefined

/**
 * ¿Administra? O sea: ve la libreta de clientes, el equipo, los productos y la
 * marca, y puede mover pedidos de cualquiera.
 *
 * Operador y administrador dan los dos `true` — esa es exactamente la promesa
 * del rol: **hace todo lo que hago yo**. Por eso todos los `is_admin` que ya
 * había en el repo siguen valiendo tal cual para un operador.
 */
export function puedeAdministrar(p: Quien): boolean {
  return !!p?.is_admin
}

/** ¿Es operador? Se pregunta para rotularlo, no para decidir: lo que decide es
 *  `puedeBorrar`, que es la frase que de verdad se quiere decir. */
export function esOperador(p: Quien): boolean {
  return !!p?.is_admin && !!p?.is_operator
}

/**
 * ¿Puede DESTRUIR?
 *
 * Lo que cubre, que es todo lo que en este panel no se puede deshacer:
 *
 *   · apagar la tienda de una marca (deja de vender)
 *   · borrar un producto
 *   · **crear o promover administradores**
 *
 * El tercero no es "otra cosa que también restringimos": sin él los dos
 * primeros no valen nada. Un operador que puede nombrar admins se nombra a sí
 * mismo —o crea uno y entra con él— y la restricción dura lo que tarde en
 * darse cuenta. Una restricción que el restringido puede levantar no es una
 * restricción, es un cartel.
 *
 * Lo que NO cubre, a propósito: anular o cancelar un pedido. Los dos se
 * deshacen (`restore`, `recreate`), así que no destruyen nada — y son trabajo
 * diario de quien opera.
 */
export function puedeBorrar(p: Quien): boolean {
  return puedeAdministrar(p) && !p?.is_operator
}

/** Crear o promover administradores. Es la misma pregunta que `puedeBorrar` —
 *  ver por qué arriba— y tiene nombre propio porque en el sitio donde se
 *  pregunta, "¿puede borrar?" no se entendería. */
export function puedeNombrarAdmins(p: Quien): boolean {
  return puedeBorrar(p)
}

/**
 * Cómo se rotula a alguien en el equipo.
 *
 * Sale de las banderas y no de `role_label`, que es texto libre: si la etiqueta
 * la escribiera una persona, un "Operador" con dedazo se vería como miembro
 * raso teniendo todos los permisos — o al revés.
 */
export function etiquetaDeRol(p: Quien): string {
  if (!p) return '—'
  if (esOperador(p)) return 'Operador'
  if (p.is_admin) return 'Admin'
  return p.role_label || 'Equipo'
}

/** Lo que un operador NO puede, dicho como se le dice a una persona. Vive acá
 *  para que la pantalla que lo explica y la que lo aplica no se separen. */
export const LIMITES_OPERADOR = [
  'apagar la tienda de una marca',
  'borrar productos',
  'crear o promover administradores',
]
