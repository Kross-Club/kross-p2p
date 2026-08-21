// ─── SALES ENGINE · Reglas de negocio del Checkout ───────────────────────────
// TODA regla de negocio del checkout vive aquí: montos, umbrales, textos, modos
// de cobertura. Cero números mágicos en el JSX. Cambiar el adelanto de S/10 a
// S/15 debe ser editar UNA línea de este archivo.
//
// Lo que NO vive aquí: los precios y las imágenes de los packs. Kross es
// multi-tenant y cada marca tiene los suyos — vienen de `products.packs` en la
// BD. Aquí solo están las REGLAS sobre esos packs (cuál se preselecciona, qué
// badge lleva, cómo se calcula el ahorro).

import type { CheckoutState, CoverageMode } from './types'

// ─── Adelanto ────────────────────────────────────────────────────────────────
// El adelanto es un PORCENTAJE del pedido, no un monto fijo por región.
//
// Aquí vivían seis constantes —S/5 en Lima, S/20 Shalom, S/25 Olva, S/30 a
// domicilio en provincia— y la función que elegía entre ellas. Se fueron todas.
// Dos razones:
//
//  · **Compromiso.** S/5 filtra al que estaba jugando, pero no compromete a
//    nadie. Quien ya puso la mitad del pedido va a recoger.
//  · **Costo de cobrar.** Con 360pay la comisión es PLANA (~S/3.72), así que
//    cobrar S/5 se llevaba el 74 % del adelanto. Sobre la mitad de un pedido
//    típico es ~3 %, que sí se sostiene.
//
// Lo que ya NO depende del destino: el adelanto es el mismo recoja o le lleven,
// en Lima o en provincia. Por eso las tarjetas de método dejaron de mostrar un
// monto — no había diferencia que enseñar.

/** Elige cuánto adelanta: la mitad (mínimo) o todo. */
export type AdvanceChoice = 'HALF' | 'FULL'

/**
 * La parte mínima del pedido que se adelanta. Cambiar esto a 0,4 o 0,6 es
 * editar esta línea y nada más — el monto se deriva de aquí en el front y su
 * espejo en `supabase/functions/_shared/advance.ts`.
 */
export const ADVANCE_HALF_SHARE = 0.5

/**
 * Cuánto adelanta este pedido.
 *
 * `price` es el precio EFECTIVO —con el descuento de retención y los puntos ya
 * aplicados—, porque adelantar sobre un precio que el comprador no va a pagar
 * le cobraría de más.
 *
 * Se redondea al sol: el comprador lo yapea a mano y "S/69.50" invita a teclear
 * mal. El redondeo es hacia arriba en el .5 (`Math.round`), así que la marca
 * nunca cobra de menos que la mitad exacta.
 */
export function advanceFor(price: number, choice: AdvanceChoice = 'HALF'): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  return choice === 'FULL' ? Math.round(price) : Math.round(price * ADVANCE_HALF_SHARE)
}

// ─── Cobertura ───────────────────────────────────────────────────────────────

/**
 * Modo de cobertura por región. Ambas van por DISTRITO, y es una decisión
 * medida, no una simplificación.
 *
 * Se comparó el veredicto por distrito contra los polígonos del courier usando
 * las 487 sedes de Shalom como muestra de dónde hay gente: **coinciden en el
 * 94,9 % de los casos**. Cobrarle un paso de mapa al 100 % de los compradores
 * para ganar precisión en el 5 % restante cambia conversión por exactitud, y
 * aquí gana la conversión.
 *
 * Los polígonos NO se descartan: se evalúan en silencio cuando existe una
 * coordenada (dirección guardada del comprador, o el pin que captura
 * `AddressBar` en el chat DESPUÉS de cerrar la venta) y su resultado se guarda
 * en el pedido. Sirven para enrutar logística y para negociar cobertura, sin
 * costar un tap.
 */
export const COVERAGE_MODE: Record<'LIMA' | 'PROVINCIA', CoverageMode> = {
  LIMA: 'DISTRICT',
  PROVINCIA: 'DISTRICT',
}

/**
 * Ciudades que van SIEMPRE a agencia aunque el courier declare cobertura a
 * domicilio. Es una palanca operativa: si una ciudad empieza a fallar entregas,
 * se agrega aquí y deja de prometerse domicilio, sin tocar código.
 *
 * Vacío a propósito. La data ya resuelve por sí sola los tres casos que se
 * habían identificado como riesgosos: Tumbes no figura en el tarifario (queda
 * como no cubierto), y los 13 distritos de visita semanal de Cusco se degradan
 * solos por `weekly`. Blacklistear ciudades enteras encima de eso sería
 * castigar compradores que sí reciben en casa.
 */
export const AGENCY_ONLY_CITIES: string[] = []

/**
 * Un punto dentro de zona pero a menos de esta distancia del borde se trata como
 * BORDERLINE. Solo aplica al análisis por polígono (post-venta), no al checkout.
 */
export const BORDERLINE_THRESHOLD_M = 500

/**
 * Por debajo de esta distancia, el número deja de informar y la tarjeta dice
 * "En tu distrito" en vez de una cifra.
 *
 * El motivo es cómo se construye el punto de referencia: `build-centroids.mjs`
 * promedia **las sedes mismas** para obtener el centroide del distrito. En los
 * **183 distritos que tienen una sola sede**, ese centroide ES la sede, y la
 * distancia sale 0. Medido sobre los 378 distritos con centroide: **198 caen por
 * debajo de 50 m**. O sea que en más de la mitad del país la primera tarjeta
 * mostraba "a 0 m", que no significa nada y se lee como un sistema roto.
 *
 * El ORDEN sí es correcto —comparar distancias desde el centroide ordena bien
 * las sedes entre sí—, lo que no se sostiene es presentar ese número como "qué
 * tan lejos te queda a ti". Por eso se cambia la presentación, no el ranking.
 */
export const NEARBY_LABEL_THRESHOLD_KM = 0.5

// ─── Packs ───────────────────────────────────────────────────────────────────

/**
 * Índice del pack preseleccionado y destacado, sobre la lista ordenada de menor
 * a mayor precio. `1` = el segundo más barato, que en un catálogo típico es el
 * pack de 2 unidades: es el anclaje que mueve el ticket promedio sin asustar.
 * Si la marca tiene menos packs, se recorta al último disponible.
 */
export const DEFAULT_PACK_INDEX = 1

/** Aplica DEFAULT_PACK_INDEX a una lista real de packs, sin salirse del rango. */
export function defaultPackIndex(packCount: number): number {
  if (packCount <= 0) return 0
  return Math.min(DEFAULT_PACK_INDEX, packCount - 1)
}

/** Badge del pack recomendado. Configurable por marca más adelante. */
export const BEST_PACK_BADGE = '⭐ MÁS ELEGIDO · MEJOR PRECIO'

/** Muestra el ahorro explícito vs. comprar N unidades sueltas. */
export const SHOW_PACK_SAVINGS = true

// ─── Descuento de retención ──────────────────────────────────────────────────

/**
 * Descuento que se ofrece cuando el comprador intenta cerrar el modal con datos
 * ya ingresados. Se descuenta de CADA pack.
 *
 * Ojo con dos cosas al mover este número: se paga también en los pedidos de
 * quien iba a comprar igual, y sobre un margen típico de S/49–78 por pedido,
 * S/5 es 7–10 %. Por eso se ofrece UNA sola vez por checkout.
 */
export const EXIT_DISCOUNT_PEN = 5

/** Una sola oferta por checkout: si la rechaza, no se le vuelve a insistir. */
export const EXIT_DISCOUNT_ONCE = true

// ─── Yape ────────────────────────────────────────────────────────────────────

export const YAPE = {
  copiedFeedbackMs: 1500,
} as const

// ─── Cobro con 360pay (cupón + deep link de Yape) ────────────────────────────

/**
 * ¿Este pedido se cobra con 360pay? Es una LECTURA pura, no un derivado
 * persistido: no va en `derive()` porque no forma parte del estado — la config
 * la inyecta el modal y puede llegar asíncrona, después de que el comprador ya
 * esté en el paso 3.
 *
 * `locationType === null` (aún no eligió destino) da false: sin destino no hay
 * monto, y la rama de cobro sin monto no existe.
 *
 * **No tiene `scope` por región**, a diferencia del motor que vivió antes aquí:
 * aquel acotaba el cobro a provincia porque era un salto de fe que podía costar
 * conversión limeña. 360pay no tiene ese riesgo —el comprador toca un botón y
 * Yape abre con el monto puesto— así que aplica donde la tienda lo encendió.
 */
export function pay360ActiveFor(
  s: Pick<CheckoutState, 'pay360' | 'locationType' | 'advanceAmount'>,
): boolean {
  return !!s.pay360?.enabled && s.advanceAmount > 0 && !!s.locationType
}

// ─── Verificación del adelanto ───────────────────────────────────────────────

/**
 * Cada cuánto se consulta el pedido mientras el comprador paga en Yape.
 *
 * 3 s y no menos: el comprador está EN OTRA APP, así que una consulta más
 * rápida no le adelanta nada —no está mirando— y sí multiplica llamadas a
 * `get-session` por cada pedido en vuelo. Y no más, porque cuando vuelve sí
 * mira, y ahí los segundos se notan.
 */
export const PAY360_POLL_MS = 3000

// ─── Persistencia ────────────────────────────────────────────────────────────

export const DRAFT_STORAGE_PREFIX = 'kross_checkout:'

/** Un borrador vive 24 h: alcanza para volver del anuncio, no para confundir. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

// ─── Validación ──────────────────────────────────────────────────────────────

export const DNI_LENGTH = 8
export const PHONE_LENGTH_PE = 9
export const PHONE_COUNTRY_CODE_PE = '51'

// ─── Textos ──────────────────────────────────────────────────────────────────
// Centralizados para poder ajustar copy sin tocar componentes. El copy es parte
// de la conversión, así que se versiona igual que el código.

export const COPY = {
  step2Title: '¡Genial! ¿Quién recibe el pedido?',
  // El DNI solo se pide en provincia, y el motivo es de ELLOS, no nuestro: la
  // agencia no entrega el paquete sin el documento del destinatario. Un hecho
  // que el comprador puede verificar convierte mejor que "para crear tu cuenta".
  // Se muestra también en Lima, donde no hay agencia. La razón honesta y común
  // a los dos casos es que el adelanto tiene que quedar a nombre de alguien.
  dniWhy: 'Con esto confirmamos tu pedido y tu adelanto a tu nombre.',
  dniOtherReceiver: '¿Lo recibe otra persona?',
  referencePlaceholder: 'Portón negro, frente a la bodega',

  inZone: '¡Sí llegamos a tu puerta!',
  outOfZone: 'En tu zona la entrega es en agencia.',
  // En B las dos son ELECCIÓN del comprador, no veredicto del sistema. El texto
  // determinante ("en tu zona la entrega ES en agencia") le dice que no tuvo
  // opción justo después de haberla ejercido, y el botón para volver atrás pasa
  // a leerse como una excepción que está forzando.
  inZoneChosen: 'Ok, te lo enviaremos a tu casa.',
  outOfZoneChosen: 'Con gusto, te lo dejamos en la agencia que prefieras.',
  outOfZoneBenefit: 'Recoges cuando quieras, y pagas el resto ahí.',
  agencyNeutral: 'Elige tu agencia de recojo',
  /** Reemplaza a la cifra cuando el centroide no da para afirmar una distancia
   *  real. Ver `NEARBY_LABEL_THRESHOLD_KM`. */
  pickupInDistrict: 'En tu distrito',
  retryDomicilio: 'Prefiero intentar entrega a domicilio',

  advanceHeadsUp: `Se paga un adelanto del envío por Yape y el resto al recibir.`,
  advanceHeadsUpShort: 'El resto lo pagas al recibir tu pedido.',
  // Antes de elegir cómo recibirlo NO se sabe el monto —cambia entre S/20, S/25
  // y S/30—, así que la nota tranquiliza sin cifra. Poner una y que después
  // suba es la sorpresa que el aviso existía para evitar.
  advanceHeadsUpNoAmount:
    'Se adelanta una parte del envío por Yape y se descuenta del total: el resto lo pagas al recibir.',

  // ─── Paso 3 ────────────────────────────────────────────────────────────────
  step3Title: 'Último paso: confirma tu pedido',
  step3TitleAdvance: 'Último paso: adelanta tu envío',
  yapeCopied: '¡Copiado!',
  // Sin cobro en línea conectado el paso 3 no pide nada, pero tampoco se queda
  // mudo: quien esperaba pagar ahora tiene que saber qué sigue.
  advanceByChatTitle: 'Tu adelanto lo coordinamos por el chat',
  advanceByChatHint: 'Termina tu pedido y un asesor te escribe para acordar el adelanto. No tienes que pagar nada en esta pantalla.',

  doneUnpaid: 'Registramos tu pedido. Un asesor te escribirá por el chat para coordinar el adelanto.',
  /** La landing, cuando quedó un pedido con el pago pendiente. Nombra lo que el
   *  botón HACE —abrir el chat, donde un asesor cobra— y no lo que uno querría
   *  que hiciera: decía "Termina el pago" y llevaba al chat, prometiendo un
   *  cobro que esa pantalla no da. El modal reducido de solo-cobro está
   *  anotado como follow-up; hasta entonces, el rótulo dice la verdad. */
  finishPaymentCta: 'Coordinar el pago de tu pedido',

  // ─── Cobro con 360pay ──────────────────────────────────────────────────────
  // El comprador paga "con Yape": el recaudador es cocina nuestra. Nombrar a
  // 360pay solo agrega una marca desconocida justo en la pantalla donde la
  // confianza decide.
  // Pedido creado + pago no resuelto: la pantalla que no puede decir "error" a
  // secas. Primero lo que SÍ pasó (tu pedido existe), después lo que falta.
  paymentPendingTitle: 'Tu pedido está guardado — falta el pago',
  paymentPendingBody: 'No perdiste nada de lo que llenaste. Solo falta cobrar tu adelanto.',
  retryPaymentCta: 'Reintentar el pago',
  contactMeInstead: 'Prefiero que me escriban para pagar',

  pay360Title: 'Paga tu adelanto con Yape',
  pay360Intro: 'Toca el botón y Yape se abre con todo listo. No tienes que escribir el monto ni buscar ningún número.',
  pay360AmountLabel: 'Monto a pagar',
  // Lo que se ve ANTES de terminar el pedido. Dice qué va a pasar, para que
  // tocar el botón no sea un salto al vacío — pero no pide nada, porque
  // todavía no hay nada que el comprador pueda darnos.
  pay360Step3Hint: 'Al terminar tu pedido te mostramos un botón que abre Yape con el monto ya puesto. No tienes que escribir nada.',
  pay360Cta: 'Pagar con Yape',
  // Lo que hay que decir ANTES de que se vaya: Yape no lo devuelve solo, y
  // volver sin entender qué pasó es donde se pierden los pedidos ya pagados.
  pay360AfterHint: 'Cuando termines en Yape, vuelve a esta ventana: tu pedido se confirma solo.',
  pay360CodeLabel: '¿Pagas desde tu computadora?',
  // Sin botón el código deja de ser el respaldo y pasa a ser el camino: el
  // rótulo no puede seguir preguntando por la computadora.
  pay360CodeLabelOnly: 'Tu código de pago',
  pay360IntroCodeOnly: 'Abre tu Yape y paga con este código. El monto ya está reservado: no tienes que escribirlo.',
  pay360CodeCopy: 'Copiar',
  // El nombre del servicio importa tanto como el código: sin él, el comprador
  // no sabe qué buscar en la lista de pagos de servicios de su app.
  pay360CodeHint: 'En tu Yape entra a “Pagar servicios”, busca 360Pay y pega este código.',
  // La espera. No dice "verificando" a secas: el comprador acaba de salir de la
  // app y tiene que saber que lo suyo ya está hecho.
  pay360Waiting: 'Esperando tu pago…',
  pay360WaitingHint: 'Apenas Yape confirme, esta pantalla cambia sola. Puedes cerrarla: tu pedido ya está registrado.',
  pay360IssueFailed: 'No pudimos generar tu pago. Vuelve a intentarlo.',

  submit: 'Terminar mi pedido',
  submitting: 'Registrando tu pedido…',
  submitError: 'No pudimos registrar tu pedido. Toca para reintentar.',

  // Confirmación
  doneTitle: '¡Pedido confirmado! 🎉',
  // El canal es el CHAT del pedido, no WhatsApp. WhatsApp es solo el fallback
  // cuando el comprador no entra al chat, así que prometerlo aquí manda a
  // esperar por donde no vamos a escribir primero — y deja el chat, que es lo
  // que sostiene la tasa de entrega, sonando a algo secundario.
  doneCod: 'Pagas al recibir. Coordinamos la entrega por el chat de tu pedido.',
  doneAdvance: 'Ya registramos tu adelanto. Coordinamos el envío por el chat de tu pedido.',
  // Nombra el BENEFICIO, no la mecánica: "abrir el chat" describe un botón,
  // "rastrear la entrega" describe lo que el comprador gana entrando — y es
  // literal, no una promesa: `/p/:token` monta el `OrderTracker` con las etapas
  // del pedido en vivo. Es la única acción de la pantalla final: no compite con
  // ningún "Listo", porque el que se va sin pasar por el chat es el que después
  // no reconoce quién le escribe.
  doneOpenChat: 'Ver mi pedido y rastrear la entrega',
  // La frase que hace el trabajo de verdad. Lo que se juega en esta pantalla no
  // es conversión —la venta ya está cerrada— sino la TASA DE ENTREGA: en COD el
  // motivo número uno de que un pedido no se recoja es que el cliente no
  // reconoce quién le escribe. Avisarle aquí de dónde vendrá el mensaje es la
  // vacuna, y este es el único momento de atención garantizada que queda.
  doneChatHint: 'Por aquí te escribiremos para coordinar tu entrega.',

  advancePendingByChat: 'Un asesor te escribe por el chat para coordinar tu adelanto.',
  verifyingCanClose: 'Puedes cerrar esta ventana: tu pedido ya está registrado.',
  verifyMatched: '¡Pago confirmado! Tu pedido está en camino.',
  verifyUnmatched: 'Recibimos tu comprobante, un asesor lo está validando.',

  // El monto NO va escrito en el copy: lo pone el componente desde
  // EXIT_DISCOUNT_PEN. Así cambiar el descuento es editar un solo número y no
  // deja textos mintiendo un monto viejo.
  exitBadge: 'SOLO POR ESTA VEZ',
  exitTitle: '¡Espera! No te vayas con las manos vacías',
  exitAmountLabel: 'de descuento en tu pedido',
  exitBody: 'Se aplica a cualquier pack que elijas. Si sales ahora, lo pierdes.',
  exitApply: 'Aplicar mi descuento',
  exitLeave: 'No, gracias',
  exitApplied: '🎉 Descuento aplicado a todos los packs',

  // Variante sin descuento: cuando ya se le ofreció una vez, o ya lo aceptó.
  exitConfirmTitle: '¿Salir sin terminar?',
  exitConfirmBody: 'Guardamos tu avance por 24 horas: puedes volver donde lo dejaste.',
  exitConfirmStay: 'Seguir comprando',
  exitConfirmLeave: 'Salir',

  // Aquí vivían `olvaQuestion` y `olvaFinderUrl`, de cuando Olva era la agencia
  // sin listado y había que mandar al comprador a buscar su sede al sitio del
  // courier. Olva tiene sus 424 sedes desde hace rato, y con la lista unificada
  // el texto libre ya no es de nadie en particular: es la salida de `OTRO`, y su
  // etiqueta vive en el propio campo.
} as const
