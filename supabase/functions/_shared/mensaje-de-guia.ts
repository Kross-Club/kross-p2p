// ─── Lo que se le dice al comprador cuando su envío queda registrado ─────────
//
// Un solo sitio porque lo dicen dos: `registrarGuia` (vía `_shared/guia.ts`), en
// una tienda de verdad, y el demo cuando la guía se registra enseñando. Vive
// SUELTO de `guia.ts` a propósito: aquel importa `tracking.ts`, que crea su
// cliente con `Deno.env` al cargar, y eso no se puede importar desde el panel.
//
// En Shalom la guía nace como **PRE-GUÍA**: existe y ya se puede seguir, pero se
// vuelve oficial recién cuando el paquete entra a la agencia de origen. Eso se
// explica en «Ver pedido» (junto a los ids), no en el mensaje: el aviso del
// chat dice que la guía existe, sus ids y qué sigue (09-set-2026).

export type Courier = 'SHALOM' | 'OLVA'

/**
 * Cómo se NOMBRAN los identificadores de una guía, en todas partes.
 *
 * En Shalom, con el vocabulario de su propio voucher: **"Nro. de orden"** y
 * **"Código"** — es lo que el comprador lee en el PDF y lo que le piden en el
 * mostrador; llamarlo "Guía" acá y "NRO. ORDEN" allá lo deja traduciendo entre
 * dos papeles que hablan de lo mismo. En Olva la guía se llama guía, porque así
 * la llama Olva.
 *
 * La CLAVE de recojo no está aquí a propósito: estos ids identifican el envío y
 * viajan por el chat; la clave lo ENTREGA, y se manda sola —`mensajeDeClave`—
 * recién cuando el saldo está pagado.
 */
export function idsDeGuia(
  courier: Courier,
  g: { numero?: string | null; codigo?: string | null; oseId?: string | null },
): string {
  if (courier === 'OLVA') return `Guía ${g.numero}`
  if (!g.numero) return `Orden de servicio ${g.oseId}`
  return `Nro. de orden ${g.numero}${g.codigo ? ` · Código ${g.codigo}` : ''}`
}

/**
 * El aviso de que el paquete ENTRÓ A LA AGENCIA DE ORIGEN.
 *
 * Es el momento que la tarjeta de la guía promete ("por acá te avisamos apenas
 * pase"): en Shalom la pre-guía se vuelve oficial exactamente aquí, y decirlo
 * cierra ese ciclo con las mismas palabras. Lo escriben dos —el reflejo de
 * tracking (`_shared/tracking.ts`) y el demo—, así que vive acá, como todo lo
 * que se dice dos veces.
 */
export function mensajeDeOrigen(courier: Courier): string {
  return `🏬 Tu paquete ya está en ${nombreDelCourier(courier)} y va camino a tu agencia. Te avisamos por aquí cuando llegue.`
}

function nombreDelCourier(courier: Courier): string {
  return courier === 'OLVA' ? 'Olva' : 'Shalom'
}

/**
 * La CLAVE DE RECOJO, entregada por el chat. La escriben tres: el webhook de
 * 360pay cuando cruza el saldo, `registrarGuia` cuando la guía nace con el
 * pedido ya pagado del todo, y el demo enseñando ese mismo momento.
 *
 * ⚠️ Este mensaje solo puede existir DESPUÉS de que el pedido quede sin saldo:
 * quien tiene la clave se lleva el paquete, y en Kross se entrega contra el
 * pago (02 §El saldo de agencia). Nunca por `visibility: 'sellers'` tampoco —
 * `viewer=seller` se resuelve con el token del comprador.
 */
export function mensajeDeClave(clave: string): string {
  return `🔑 Tu clave de recojo es ${clave}. La presentas en el mostrador junto con tu DNI `
    + 'para retirar tu paquete. No la compartas con nadie.'
}

/**
 * El aviso de la guía: que ya existe, sus ids y qué sigue. Nada más
 * (09-set-2026): la pre-guía, dónde seguirla y el saldo salieron de acá.
 * Eran tres párrafos que daban flojera leer, y lo que decían ya vive en otra
 * parte —la pre-guía y los ids en «Ver pedido», el saldo en el botón de la
 * tarjeta del pedido, dónde va en las preguntas rápidas—. Los ids van en su
 * propia línea para que se lean (y se copien) de un vistazo.
 */
export function mensajeDeGuia(courier: Courier, ids: string): string {
  return `📦 ¡Tu envío ya está registrado en ${nombreDelCourier(courier)}!\n${ids}\nTe avisamos por aquí cuando llegue a tu agencia.`
}
