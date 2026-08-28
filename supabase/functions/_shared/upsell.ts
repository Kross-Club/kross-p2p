// ─── ¿El upsell entra en el mismo pedido, o abre uno nuevo? ──────────────────
//
// Cuando el comprador acepta una oferta del chat hay dos finales posibles, y no
// es una preferencia: es una pregunta física. **¿La caja todavía está acá?**
//
//   sí  → el producto entra al MISMO pedido. Sube el total, sube el saldo, y el
//         anillo del tablero pasa a medir el adelanto contra el total nuevo.
//   no  → se abre un pedido aparte. Nadie puede meter nada en un paquete que ya
//         está viajando, y decir que sí sería prometer una entrega que no va a
//         ocurrir.
//
// Antes la regla era `stage === 'nuevo' || stage === 'confirmado'`, escrita
// dentro del `if` que la usaba, y dejaba fuera dos casos que sí caben:
//
//   · `validando` — el yapeo no cuadra todavía; la caja ni se ha tocado;
//   · `registrado` — la guía existe pero el paquete SIGUE en la tienda. Es
//     justo el momento en que se arma el pedido, o sea cuando más se agrega.
//
// Un upsell en esos dos abría un pedido paralelo con su propio envío por cobrar,
// que es la manera cara de resolverlo.
//
// Sin APIs de Deno a propósito: el archivo se importa también desde vitest.

/** Las etapas en las que el paquete sigue en manos de la tienda. */
const EN_LA_TIENDA = new Set(['nuevo', 'validando', 'confirmado', 'registrado'])

export interface PedidoQueQuizaSalio {
  stage?: string | null
  /** Lo que reporta el courier. Que exista significa que el paquete ya está en
   *  su poder: `EN_ORIGEN` es "lo recibimos en la sede de salida". */
  tracking_phase?: string | null
}

/**
 * ¿Se le puede sumar un producto a este pedido sin mentir?
 *
 * Se pregunta a las DOS agujas del eje, y con eso basta:
 *
 *   · la del equipo (`stage`), que dice hasta dónde llegó lo nuestro;
 *   · la del courier (`tracking_phase`), que manda en cuanto aparece — un
 *     pedido que Shalom ya reporta EN_ORIGEN salió, diga lo que diga el stage.
 *
 * Con una sola no alcanza: hay pedidos en `registrado` que el courier ya
 * recogió (la guía se emite antes de entregarle el paquete) y pedidos en
 * `en_camino` que nadie ha movido todavía. La condición es que las dos digan
 * que sigue acá.
 */
export function cabeEnElMismoPaquete(p: PedidoQueQuizaSalio): boolean {
  if (!EN_LA_TIENDA.has(String(p.stage ?? 'nuevo'))) return false
  return !p.tracking_phase
}
