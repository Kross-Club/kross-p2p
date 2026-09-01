// ─── Lo que se le dice al comprador cuando su envío queda registrado ─────────
//
// Un solo sitio porque lo dicen dos: `registrarGuia` (vía `_shared/guia.ts`), en
// una tienda de verdad, y el demo cuando la guía se registra enseñando. Vive
// SUELTO de `guia.ts` a propósito: aquel importa `tracking.ts`, que crea su
// cliente con `Deno.env` al cargar, y eso no se puede importar desde el panel.
//
// En Shalom la guía nace como **PRE-GUÍA**: existe y ya se puede seguir, pero se
// vuelve oficial recién cuando el paquete entra a la agencia de origen. Decirlo
// evita el reclamo previsible — el comprador la busca en el mostrador de Shalom
// al minuto y la agencia le dice que no existe. Y se le dice dónde seguirla: en
// esta app, que está sincronizada con su guía, o en Shalom.

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
  if (courier === 'OLVA') {
    return '🏬 ¡Tu paquete entró a la agencia de origen de OLVA! Por aquí te avisamos cada avance.'
  }
  return '🏬 ¡Tu paquete entró a la agencia de origen: tu guía de SHALOM ya es oficial! '
    + 'Por aquí te avisamos cada avance.'
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

export function mensajeDeGuia(courier: Courier, ids: string, saldo: number): string {
  const cobroCopy = saldo > 0
    ? `Tu saldo de S/${saldo} lo pagas cuando quieras por esta misma app —nunca en la agencia— y apenas lo pagues te entregamos tu clave de recojo.`
    : 'Como ya pagaste el total, junto con la guía te entregaremos tu clave de recojo.'

  if (courier === 'OLVA') {
    return `📦 ¡Tu envío ya está registrado en OLVA! ${ids}. `
      + 'Guárdala para el recojo. '
      + cobroCopy + ' Por aquí te avisamos cuando tu pedido llegue a tu agencia.'
  }

  return `📦 ¡Tu envío ya está registrado en SHALOM! ${ids} — guárdalos para el recojo.\n\n`
    + 'Por ahora es una pre-guía: se vuelve oficial cuando tu paquete entre a la agencia '
    + 'de origen, y por acá te avisamos apenas pase. Desde ya puedes seguir tu envío en '
    + 'esta misma app —está sincronizada con tu guía— o directamente en Shalom.\n\n'
    + cobroCopy
}
