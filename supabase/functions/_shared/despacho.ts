// ─── ¿Este pedido lo RECOGE el comprador, o se lo llevan? ────────────────────
//
// **Esta es la ÚNICA definición de "es recojo" del repo.** Vivía en
// `src/lib/session.ts`, que el servidor no puede importar, así que el webhook de
// 360pay llevaba su propia copia escrita a mano
// (`=== 'AGENCIA_PROVINCIA' || === 'AGENCIA_LIMA'`) — la misma trampa que este
// archivo existe para cerrar, un nivel más arriba.
//
// Existe porque `dispatch_type` codifica dos cosas en un solo enum —región y
// método— y comparar contra un valor concreto se rompe cada vez que aparece una
// combinación nueva. Cuando Lima pasó a poder recoger en agencia, todo
// `=== 'AGENCIA_PROVINCIA'` regado por el código quedaba tratando ese pedido
// como entrega a domicilio: recibía la línea de vida del motorizado, no aparecía
// en el mapa en vivo, y descartaba en silencio las fases que Shalom sí estaba
// reportando.
//
// Se normaliza a mayúsculas y se toleran dos valores heredados que ningún código
// escribe hoy (`register-buyer` solo acepta los cuatro canónicos): no se pueden
// descartar sin mirar la BD, y aceptarlos no cuesta nada. `AGENCIA` a secas es
// el `deliveryMethod` del checkout —otro dominio, otro enum—; si alguna vez se
// filtró a esta columna, es un recojo igual.

const RECOJO = ['AGENCIA_PROVINCIA', 'AGENCIA_LIMA', 'AGENCIA', 'RECOJO_AGENCIA']

export function isPickupDispatch(d: string | null | undefined): boolean {
  return RECOJO.includes(String(d ?? '').toUpperCase())
}
