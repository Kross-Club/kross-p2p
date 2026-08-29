// ─── Quién manda en un pedido ────────────────────────────────────────────────
//
// Un pedido tiene UN responsable y, alrededor, gente invitada que también
// escribe. Hasta acá esas reglas estaban repartidas: una parte en la pantalla
// (`canWrite`, el botón de expulsar), otra en el servidor, y una tercera —la de
// reasignar— no existía en ninguna parte.
//
// Vive en `_shared` y no en `src/lib` a propósito: es lo único del repo que
// necesitan LOS DOS lados con la misma respuesta. `permisos.ts` dice qué puede
// alguien en la TIENDA; esto dice qué puede en ESTE pedido, que es otra
// pregunta — un admin puede tocar cualquier pedido, y el responsable solo el
// suyo.
//
// **Esto no es la puerta, es la manija.** La pantalla la usa para no ofrecer lo
// que va a ser rechazado; la puerta es el servidor, que además comprueba QUIÉN
// llama contra su JWT — antes se fiaba de un `by_seller_id` que venía en el
// cuerpo de la petición, o sea de lo que el que llama dijera de sí mismo.
//
// Sin APIs de Deno: se importa también desde vitest y desde el panel.

export interface EquipoDelPedido {
  /** El responsable: uno solo, el que responde por el pedido. */
  assigned_seller_id?: string | null
  /** Quiénes pueden escribir: el responsable y los invitados. */
  writer_seller_ids?: string[] | null
  /** Invitado → quién lo invitó. Es lo que deja quitar a alguien sin pedirle
   *  permiso a un admin: el que lo trajo puede llevárselo. */
  invited_by?: Record<string, string | null> | null
}

export interface Quien {
  /** `auth_user_id`. `null` = sesión sin resolver: no puede nada. */
  id: string | null
  /** Administra la tienda: dueño, supervisor u operador (ver permisos.ts). */
  is_admin?: boolean
  /** En turno. Fuera de turno no se escribe — salvo administrando, que es
   *  justo para lo que existe: cubrir cuando el equipo no está. */
  available?: boolean
}

const escribientes = (p: EquipoDelPedido): string[] => p.writer_seller_ids ?? []

/** ¿Este pedido es suyo? */
export function esResponsable(p: EquipoDelPedido, quien: Quien): boolean {
  return !!quien.id && p.assigned_seller_id === quien.id
}

/**
 * ¿Puede escribir en el chat?
 *
 * El responsable y los invitados, si están en turno; quien administra, siempre.
 * El turno es del admin de la tienda, no de la persona: es lo que evita que un
 * pedido caiga en alguien que hoy no está.
 */
export function puedeEscribir(p: EquipoDelPedido, quien: Quien): boolean {
  if (quien.is_admin) return true
  if (!quien.id) return false
  const enTurno = quien.available !== false
  return enTurno && (esResponsable(p, quien) || escribientes(p).includes(quien.id))
}

/**
 * ¿Puede invitar a alguien más?
 *
 * **Cualquiera que escriba en el pedido**, y esa es la decisión: quien está
 * atendiendo es quien descubre que necesita a Logística. Obligarlo a pedírselo
 * al supervisor añade un salto que se termina haciendo por WhatsApp — que es
 * justo lo que este panel existe para sacar del WhatsApp.
 *
 * Invitar no es peligroso: suma a alguien de la MISMA tienda a un chat que ya
 * podría leer entrando por el panel. Lo que sí cambia de manos —el pedido— pide
 * más (ver `puedeReasignar`).
 */
export function puedeInvitar(p: EquipoDelPedido, quien: Quien): boolean {
  return puedeEscribir(p, quien)
}

/**
 * ¿Puede pasarle el pedido a otro?
 *
 * El responsable —soltarlo cuando no da abasto— y quien administra: el
 * supervisor que reparte carga, cubre una baja o rota turnos. Un invitado no:
 * entró a ayudar, no a quedarse con el pedido de otro.
 */
export function puedeReasignar(p: EquipoDelPedido, quien: Quien): boolean {
  return !!quien.is_admin || esResponsable(p, quien)
}

/**
 * ¿Puede sacar a alguien del pedido?
 *
 * Tres, y el tercero es el que faltaba:
 *
 *   · quien lo invitó — el que lo trajo se lo lleva;
 *   · el responsable — es su pedido;
 *   · quien administra.
 *
 * Sin el responsable, un invitado por alguien que ya no está en la empresa se
 * quedaba dentro para siempre: el único que podía sacarlo era justo el que se
 * fue. Y al responsable **no se le saca**: para eso se reasigna el pedido.
 */
export function puedeQuitar(p: EquipoDelPedido, quien: Quien, aQuien: string): boolean {
  if (!aQuien || aQuien === p.assigned_seller_id) return false
  if (quien.is_admin) return true
  if (!quien.id) return false
  if (esResponsable(p, quien)) return true
  return (p.invited_by ?? {})[aQuien] === quien.id
}
