// ─── Quién puede qué ─────────────────────────────────────────────────────────
//
// El panel tenía DOS niveles: administrador o miembro del equipo. Con eso, dar
// de alta a alguien que ayude a operar la plataforma obligaba a elegir entre
// darle todo —incluido apagar la tienda de un cliente— o darle nada.
//
// Ahora son tres, y el que entra en medio es el **operador**: opera la
// plataforma entera sin depender de nadie.
//
//   miembro     · lo suyo: sus pedidos
//   operador    · opera todo, pero no reparte mando
//   admin       · todo
//
// **Dónde está la línea, y por qué ahí (29-ago-2026).** Al principio el
// operador no podía tres cosas: apagar una tienda, borrar un producto y nombrar
// administradores. Las dos primeras se le devolvieron: son trabajo de operar
// —una marca que no paga se apaga el mismo día, un producto mal cargado se
// borra— y tener que despertar a un administrador para eso convierte el rol en
// un ayudante, que es justo lo contrario de para qué existe.
//
// La tercera se queda, y es la única que de verdad hace falta: **nombrar es
// repartir mando, no operar.** Sin ese candado el nivel entero es decorativo —
// un operador que puede crear administradores se crea uno y entra con él, o se
// asciende a sí mismo, y lo que no podía hacer lo hace igual dando un rodeo. Una
// restricción que el restringido puede levantar no es una restricción, es un
// cartel.
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
import { nivelDe, NOMBRE_DE_NIVEL } from '../../supabase/functions/_shared/nivel.ts'

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
 *  `puedeBorrar`, que es la frase que de verdad se quiere decir.
 *
 *  Delega en `nivel.ts`, que es donde se ESCRIBEN estas banderas: leerlas con
 *  una regla y escribirlas con otra es como se llega a filas que no son ninguno
 *  de los tres niveles. */
export function esOperador(p: Quien): boolean {
  return nivelDe(p) === 'operador'
}

/**
 * ¿Puede crear o ascender administradores?
 *
 * **Lo único** que separa a un operador de un administrador dentro del panel, y
 * por eso es la única pregunta que mira `is_operator`. Hubo un `puedeBorrar`
 * que además tapaba apagar tiendas y borrar productos; se fue, porque esas dos
 * son trabajo de operar y preguntarlas por separado no cambiaba la respuesta
 * para nadie: quien llega a esos botones ya administra.
 *
 * Que sea una sola pregunta es la mitad del valor. Tres candados que caducan a
 * ritmos distintos se convierten en tres oportunidades de que uno se quede
 * puesto sin que nadie sepa por qué.
 */
export function puedeNombrarAdmins(p: Quien): boolean {
  return puedeAdministrar(p) && !p?.is_operator
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
  const nivel = nivelDe(p)
  if (nivel !== 'miembro') return NOMBRE_DE_NIVEL[nivel]
  return p.role_label || NOMBRE_DE_NIVEL.miembro
}

/** Lo que un operador NO puede, dicho como se le dice a una persona. Vive acá
 *  para que la pantalla que lo explica y la que lo aplica no se separen — y es
 *  UNA frase porque es UN candado (ver `puedeNombrarAdmins`). */
export const LIMITE_OPERADOR = 'crear o ascender administradores'
