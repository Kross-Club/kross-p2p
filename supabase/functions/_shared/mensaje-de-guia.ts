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
