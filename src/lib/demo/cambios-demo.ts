import { useSyncExternalStore } from 'react'
import { siguientePaso } from '../order-tracking'
import { resumenDelPedido } from '../../../supabase/functions/_shared/resumen-pedido.ts'
import { cobradoDelPedido, saldoDelPedido } from '../order-money'
import type { OrderItem, Participant } from '../order-api'
import type { RastroDeCobro } from '../rastro-de-pago'
import type { StoreOrder } from '../store-orders'
import type { FilaDeCobro } from '../../../supabase/functions/_shared/cobros.ts'
import { acuseDePago } from '../../../supabase/functions/_shared/acuse-de-pago.ts'
import { idsDeGuia, mensajeDeClave, mensajeDeGuia } from '../../../supabase/functions/_shared/mensaje-de-guia.ts'
import { esPickupCodeValido } from '../../../supabase/functions/_shared/shalom-orders.ts'
import { isPickupDispatch } from '../../../supabase/functions/_shared/despacho.ts'

// ─── Un demo que se deja tocar ───────────────────────────────────────────────
//
// La tienda de ejemplo se veía pero no se movía: avanzar de etapa, cambiar la
// cantidad de un producto o escribir en el chat llamaban al servidor, y ahí no
// existe ningún pedido `demo-…`. El vendedor que estaba enseñando la
// herramienta se llevaba un "No se pudo cambiar el estado" en plena demo.
//
// Acá viven los cambios que se hacen ENCIMA del generador. Tres reglas, y las
// tres son el porqué de este archivo:
//
//  1. **No tocan el generador.** La tienda de ejemplo se sigue armando igual,
//     determinista, y esto es un parche que se le aplica al leerla. Sin esto,
//     un cambio contagiaría los totales del panel y ya nadie podría comparar
//     dos pantallas.
//  2. **Viven en el dispositivo**, como el favorito, el tema y el propio
//     interruptor del demo (`localStorage`). Se puede cerrar el navegador a
//     media presentación y seguir donde iba.
//  3. **Se van con el demo.** Apagar el modo demo los borra: al volver, la
//     tienda de ejemplo está otra vez como el primer día. Es lo que hace que
//     esto sea seguro — no hay estado acumulado que ensucie la próxima demo.
//
// Y nada de esto sale del navegador: no hay red de por medio, ni siquiera para
// los mensajes. Por eso el chat del demo acepta lo que ESCRIBE el vendedor y no
// puede inventar respuestas del comprador: no hay nadie del otro lado.

const CLAVE = 'kross-demo-cambios'

/** El item del carrito es el MISMO que el del pedido de verdad (`OrderItem`).
 *  Copiarlo acá habría sido una segunda definición de la línea de un pedido, y
 *  la primera vez que se separen el total del demo dejará de cuadrar. */
export type ItemDemo = OrderItem

export interface MensajeDemo {
  id: string
  session_id: string
  sender_role: string
  sender_name?: string | null
  sender_role_label?: string | null
  type: string
  body: string | null
  media_url?: string | null
  created_at: string
  read_at: string | null
  offer?: { product_id?: string | null; nombre: string; precio: number; image?: string | null; accepted?: boolean } | null
  /** A qué cobro apunta una tarjeta de pago (bloque §37). */
  cobro_id?: string | null
  /** `sellers` = comentario interno. En el demo no hay comprador al otro lado,
   *  así que se guarda igual que cualquier mensaje: lo que se enseña es cómo se
   *  ve y dónde vive, no el candado —ese lo pone `get-session`. */
  visibility?: string | null
  mentions?: string[] | null
}

/** Lo que cambió de UN pedido de ejemplo. Todo opcional: se guarda solo lo
 *  tocado, así que el resto sigue saliendo del generador. */
export interface CambioDemo {
  stage?: string
  status?: string
  nota?: string | null
  tracking_numero?: string | null
  tracking_courier?: string | null
  tracking_codigo?: string | null
  tracking_phase?: string | null
  tracking_phase_at?: string | null
  /** La clave de retiro que la guía del demo elige al registrarse — la misma
   *  que el panel del vendedor enseña y que el chat entrega al pagar el saldo. */
  shalom_pickup_code?: string | null
  items?: ItemDemo[]
  product_price?: number
  answered_at?: string | null
  assigned_seller_id?: string | null
  seller_name?: string | null
  seller_role?: string | null
  /** Quién participa en el chat. En el demo el generador no los trae —el pedido
   *  solo lleva su vendedor asignado—, así que se arman al primer invitado. */
  participants?: Participant[]
  /** Los mensajes AGREGADOS en esta demo. Se pegan al final de la conversación
   *  que arma el generador, no la reemplazan. */
  mensajes?: MensajeDemo[]
  /** Cuándo caduca el cupón del saldo. Se toca al generar otro código desde la
   *  tarjeta de cobro — enseñar que un cupón vencido se reemite es la mitad de
   *  lo que hay que enseñar de esa tarjeta. */
  pay360_saldo_coupon_expires_at?: string | null
  /** El saldo pagado, enseñando. Mueve la misma fila que movería el webhook. */
  saldo_verification?: string | null
  saldo_matched_at?: string | null
  /** El importe del cobro del saldo. En una tienda de verdad lo escribe la
   *  emisión del cupón; acá, el pago — que es cuando el demo se entera de
   *  cuánto era. */
  saldo_amount?: number | null
  /** El rastro del saldo (código de pago, operación, banco), en el MISMO sitio
   *  donde lo pone el generador: la tarjeta del panel y el comprobante leen de
   *  ahí para los saldos. */
  saldo_trace?: RastroDeCobro | null
  /** La lista de cobros (bloque §36). Se pisa entera y no se funde: quitar un
   *  cobro es quitarlo, y un merge por índice dejaría el viejo debajo. */
  cobros?: FilaDeCobro[]
}

type Cambios = Record<string, CambioDemo>

/**
 * Un pedido de ejemplo con su carrito.
 *
 * `items` no está en `StoreOrder` a propósito —ese tipo es el espejo del
 * `select` de `get-store-sessions`, que no lo trae— pero el demo sí lo maneja:
 * es lo que hace que agregar un producto o cambiar la cantidad tenga dónde
 * anotarse. Al abrir el pedido, el chat lo lee como `OrderSession`, que sí lo
 * declara.
 */
export type PedidoDemo = StoreOrder & { items?: ItemDemo[]; participants?: Participant[] }

// ─── Guardado y avisos ───────────────────────────────────────────────────────

let memoria: Cambios | null = null
const oyentes = new Set<() => void>()
/** Identidad estable para React: `useSyncExternalStore` compara por referencia,
 *  así que devolver un objeto nuevo en cada lectura repintaría sin parar. */
const VACIO: Cambios = {}

function leer(): Cambios {
  try {
    const raw = localStorage.getItem(CLAVE)
    const x = raw ? (JSON.parse(raw) as unknown) : null
    return x && typeof x === 'object' && !Array.isArray(x) ? (x as Cambios) : VACIO
  } catch {
    return VACIO
  }
}

export function cambiosDemo(): Cambios {
  if (memoria === null) memoria = leer()
  return memoria
}

function escribir(next: Cambios) {
  memoria = next
  try {
    if (Object.keys(next).length) localStorage.setItem(CLAVE, JSON.stringify(next))
    else localStorage.removeItem(CLAVE)
  } catch { /* sin storage el cambio vale igual mientras dure la pestaña */ }
  oyentes.forEach(l => l())
}

/** Anota un cambio sobre un pedido de ejemplo. Se funde con lo que ya hubiera:
 *  cambiar la cantidad no borra la etapa que se movió antes. */
export function guardarCambio(id: string, patch: CambioDemo) {
  const actual = cambiosDemo()
  escribir({ ...actual, [id]: { ...actual[id], ...patch } })
}

export function agregarMensajeDemo(id: string, ...nuevos: MensajeDemo[]) {
  const actual = cambiosDemo()
  guardarCambio(id, { mensajes: [...(actual[id]?.mensajes ?? []), ...nuevos] })
}

/** Cambia un mensaje que YA se puso. Hace falta para el segundo tiempo de la
 *  demo: la oferta que se envió y diez segundos después aparece aceptada. */
export function actualizarMensajeDemo(id: string, mensajeId: string, patch: Partial<MensajeDemo>) {
  const actual = cambiosDemo()
  const mensajes = (actual[id]?.mensajes ?? []).map(m => m.id === mensajeId ? { ...m, ...patch } : m)
  guardarCambio(id, { mensajes })
}

// ─── Los dos tiempos de una demo ─────────────────────────────────────────────
//
// Enseñando, una oferta que aparece "Aceptada por el cliente" en el mismo
// instante en que se envía no enseña nada: se lee como que el panel se lo
// inventó. Lo que hay que ver son los DOS momentos —lo mandé, y me
// respondieron—, porque esa espera es el producto.
//
// Diez segundos: lo que dura contar qué acaba de pasar antes de que ocurra lo
// siguiente. Menos, y se pisan; más, y hay que rellenar.
/**
 * La guía de MUESTRA del demo: un PDF real de Shalom (formato voucher), alojado
 * en el Storage del proyecto Neural del propio dueño, que autorizó usarlo solo
 * en la tienda de ejemplo. Es lo que abre "Ver mi guía de Shalom" en el demo —
 * el mismo documento formal que en una tienda real sube `shalom-order` al
 * bucket `shalom-guias` (§38). Para cambiarla, basta reemplazar esta URL.
 */
export const GUIA_DEMO_PDF =
  'https://nqibrziksedspoctjhmc.supabase.co/storage/v1/object/public/shalom-guias/559a6002-cb37-47b6-b5d8-450fbe4c1da8/93076937-95c3c1cf503b48fdb2e1.pdf'

/**
 * El CÓDIGO y la CLAVE de una guía Shalom del demo, derivados del número.
 *
 * Del número y nunca de `r()` ni de `Math.random`: el número ya salió del
 * generador (o del reloj, en `avanzarEnDemo`), y derivar de él no corre el azar
 * de nada (aviso de CLAUDE.md). Mismo formato que los de verdad: el código son
 * los 4 alfanuméricos del voucher (J3NT) y la clave pasa por el MISMO validador
 * que usa `shalom-order` al emitir (`esPickupCodeValido`) — una clave de demo
 * que Shalom rechazaría enseñaría un dato que no puede existir.
 */
export function codigoDemoDeGuia(numero: string): string {
  return Number(numero).toString(36).toUpperCase().padStart(4, '0').slice(-4)
}

export function claveDemoDeRecojo(numero: string): string {
  let n = 1000 + (Number(numero) % 9000)
  // El validador rechaza repetidas y consecutivas; el vecino siguiente nunca
  // está a más de un par de pasos.
  for (let i = 0; i < 20; i++) {
    const clave = String(n)
    if (esPickupCodeValido(clave)) return clave
    n = n >= 9999 ? 1000 : n + 1
  }
  return '2415'
}

export const ESPERA_CLIENTE_DEMO = 10_000

/**
 * La oferta, ENVIADA y todavía sin responder.
 *
 * Antes esto no existía: `ofertaAceptadaEnDemo` metía de golpe la oferta ya
 * aceptada y el mensaje de confirmación. Ahora es el primer tiempo, y el
 * segundo llega solo.
 */
export function ofertaEnviadaEnDemo(
  p: PedidoDemo,
  oferta: { product_id?: string | null; nombre: string; precio: number; image?: string | null },
  quien: { nombre: string; rol: string | null },
): MensajeDemo {
  const ahora = Date.now()
  const msg: MensajeDemo = {
    id: `demo-of-${ahora}`, session_id: p.id, sender_role: 'seller',
    sender_name: quien.nombre, sender_role_label: quien.rol, read_at: null,
    type: 'offer', body: null, created_at: new Date(ahora).toISOString(),
    offer: { ...oferta, accepted: false },
  }
  agregarMensajeDemo(p.id, msg)
  return msg
}

/** El cobro, ENVIADO. Igual que la oferta: primer tiempo. */
export function cobroEnviadoEnDemo(
  p: PedidoDemo, texto: string, quien: { nombre: string; rol: string | null },
  /** De qué cobro es (bloque §37). Sin esto la tarjeta sería del saldo, y un
   *  flete de S/ 20 se enseñaría con el monto y el botón del saldo. */
  cobroId?: string,
): MensajeDemo {
  const ahora = Date.now()
  const msg: MensajeDemo = {
    id: `demo-cobro-${ahora}`, session_id: p.id, sender_role: 'seller',
    sender_name: quien.nombre, sender_role_label: quien.rol, read_at: null,
    type: 'cobro', body: texto, created_at: new Date(ahora).toISOString(),
    cobro_id: cobroId ?? null,
  }
  agregarMensajeDemo(p.id, msg)
  return msg
}

/**
 * El comprador pagó el saldo — segundo tiempo del cobro.
 *
 * Mueve la MISMA fila que movería el webhook de 360pay, así que el efecto es el
 * de verdad: la tarjeta ámbar del panel se pone verde, el anillo se completa y
 * el mensaje pasa a "Pagada por el cliente". Un demo que solo cambiara el texto
 * del mensaje enseñaría media herramienta.
 *
 * ⚠️ Se marca en LOS DOS sitios —la fila de `cobros` y las columnas de siempre—
 * porque eso es lo que hace el servidor mientras dura la mudanza al bloque §36.
 * Tocar solo las columnas dejaba la lista diciendo PENDING, y como `cobrosDelPedido`
 * lee la lista cuando existe, el saldo se pagaba y la tarjeta seguía ámbar: el
 * demo enseñando que el cobro no entró.
 */
export function saldoPagadoEnDemo(p: PedidoDemo): CambioDemo {
  const cuando = new Date().toISOString()

  // Cuánto es el saldo se DERIVA del pedido; no se lee de `saldo_amount`.
  //
  // Esa columna solo existe si alguien emitió un cupón, y desde que el panel
  // puede mandar la tarjeta de un saldo que todavía no tiene cupón, puede no
  // existir. Leyéndola, el demo anunciaba **"¡Recibimos tu saldo de S/0!"**.
  // `saldoDelPedido` es la misma cuenta que pinta la tarjeta y que el botón le
  // promete al comprador: tres restas iguales en tres sitios es como se llega a
  // que el mensaje diga un monto y la caja cobre otro.
  const monto = saldoDelPedido(p)

  // Y si el saldo todavía no es una fila, se CREA — que es exactamente lo que
  // hace el webhook cuando le entra un cupón sin fila previa. Sin esto la
  // tarjeta del saldo no se ponía verde: desaparecía. `saldoPorCobrar` deja de
  // devolverla en cuanto el saldo está cruzado, y no había ninguna fila que
  // ocupara su lugar.
  const previos = p.cobros ?? []
  const suyo = previos.find(c => c.tipo === 'saldo')
  const cobros = suyo
    ? previos.map(c => c.tipo === 'saldo' ? { ...c, monto, estado: 'MATCHED', matched_at: cuando } : c)
    : [...previos, {
        // El mismo formato que el generador (`demo-cob-<i>-s`), para que el
        // comprobante lo encuentre por el camino corto.
        id: `demo-cob-${/demo-ped-(\d+)/.exec(p.id)?.[1] ?? p.id}-s`,
        tipo: 'saldo' as const, monto, estado: 'MATCHED',
        matched_at: cuando, created_at: cuando,
      }]

  // El rastro del cobro, con la MISMA convención del generador: el saldo va en
  // `saldo_trace` y su código es la serie KSH6xxx (`rastroDemo` con `i + 5000`).
  // Sin esto la tarjeta verde salía sin "Código de pago" — que es justo el dato
  // con el que se enseña a seguir una transacción. Del ÍNDICE, nunca de `r()`:
  // una tirada acá le corre el azar a todos los pedidos (aviso de CLAUDE.md).
  const i = Number(/demo-ped-(\d+)/.exec(p.id)?.[1] ?? 0)
  const rastroSaldo = p.saldo_trace ?? {
    payment_code: `KSH${String(6000 + i).slice(-4)}`,
    coupon_id: null,
    operation_number: String(10000000 + ((i * 7919 + 4242) % 89999999)),
    bank: 'BCP',
  }

  const patch: CambioDemo = {
    // Las dos mitades, como escribe el servidor mientras dura la mudanza al
    // bloque §36: la fila y la columna.
    saldo_amount: monto,
    saldo_verification: 'MATCHED',
    saldo_matched_at: cuando,
    saldo_trace: rastroSaldo,
    // Vacío no se manda: una lista `[]` no es "este pedido no cobró nada", es
    // "no me llegó lista", y pisar la del generador con una vacía haría que el
    // pedido se viera SIN COBRAR. Ver `order-money.ts`.
    ...(cobros.length ? { cobros } : {}),
  }
  guardarCambio(p.id, patch)
  acusarPagoEnDemo(p, 'saldo', monto, cobros.find(c => c.tipo === 'saldo')?.id ?? null)
  // La CLAVE DE RECOJO, justo después del acuse — que acaba de prometer "Te
  // enviamos tu clave de recojo por acá". Es lo que hace el webhook en una
  // tienda real: el pago del saldo es EL momento en que la clave deja de estar
  // retenida. Solo si el pedido la tiene (guía Shalom del generador o de
  // `avanzarEnDemo`); un segundo después para que el hilo los cuente en orden.
  if (isPickupDispatch(p.dispatch_type) && p.shalom_pickup_code) {
    agregarMensajeDemo(p.id, {
      id: `demo-clave-${Date.now()}`, session_id: p.id, sender_role: 'system',
      sender_name: 'Kross', sender_role_label: null, read_at: null,
      type: 'status_update', visibility: 'all',
      body: mensajeDeClave(p.shalom_pickup_code),
      created_at: new Date(Date.now() + 1000).toISOString(),
    })
  }
  return patch
}

/**
 * El "gracias por tu pago" con su comprobante, igual que lo manda el webhook.
 *
 * Con la MISMA copy (`_shared/acuse-de-pago.ts`) y apuntando al cobro, que es lo
 * que convierte el aviso en la tarjeta con el botón que abre la constancia. Sin
 * esto el demo enseñaba el cobro entrando y ahí se acababa — justo el final del
 * flujo, que es lo que se está vendiendo.
 */
function acusarPagoEnDemo(
  p: PedidoDemo, tipo: 'adelanto' | 'saldo' | 'extra', pagado: number,
  cobroId: string | null, concepto?: string | null,
): MensajeDemo {
  const ahora = Date.now()
  const msg: MensajeDemo = {
    id: `demo-acuse-${ahora}`, session_id: p.id, sender_role: 'system',
    sender_name: 'Kross', sender_role_label: null, read_at: null,
    type: 'status_update', visibility: 'all',
    body: acuseDePago({
      tipo, pagado, total: Number(p.product_price ?? 0),
      esRecojo: isPickupDispatch(p.dispatch_type), concepto,
    }),
    cobro_id: cobroId,
    created_at: new Date(ahora).toISOString(),
  }
  agregarMensajeDemo(p.id, msg)
  return msg
}

/** Vuelve la tienda de ejemplo a como la arma el generador. */
export function reiniciarDemo() {
  escribir(VACIO)
}

export function hayCambiosDemo(): boolean {
  return Object.keys(cambiosDemo()).length > 0
}

function subscribe(onChange: () => void): () => void {
  oyentes.add(onChange)
  return () => { oyentes.delete(onChange) }
}

/** Repinta cuando algo del demo cambia. Devuelve los cambios para que quien
 *  los use se recalcule con ellos. */
export function useCambiosDemo(): Cambios {
  return useSyncExternalStore(subscribe, cambiosDemo, () => VACIO)
}

// ─── Aplicar ─────────────────────────────────────────────────────────────────

/**
 * El pedido de ejemplo tal como se ve DESPUÉS de lo que se tocó.
 *
 * Los mensajes se pegan al final; el resto pisa. Devuelve el mismo objeto
 * cuando no hay nada que aplicar, para no romper las comparaciones por
 * referencia de React en el 99% de los pedidos que nadie tocó.
 */
export function conCambios<T extends PedidoDemo>(p: T, cambios: Cambios = cambiosDemo()): T {
  const c = cambios[p.id]
  if (!c) return p
  const { mensajes, ...campos } = c
  const salida = { ...p, ...campos } as T
  if (mensajes?.length) {
    salida.chat_messages = [...(p.chat_messages ?? []), ...mensajes] as T['chat_messages']
  }
  return salida
}

export function listaConCambios<T extends PedidoDemo>(ps: T[], cambios: Cambios = cambiosDemo()): T[] {
  return Object.keys(cambios).length === 0 ? ps : ps.map(p => conCambios(p, cambios))
}

// ─── Lo que en la tienda de verdad hace `order-manage` ───────────────────────
//
// Mismo gesto, misma respuesta, sin red. Solo las acciones que se usan
// enseñando: mover de etapa, cambiar cantidades, quitar un producto, anular y
// recuperar. Lo que no está devuelve `ok: false` y quien llama enseña su aviso
// de siempre — mejor eso que fingir que pasó algo.

export interface RespuestaDemo {
  ok: boolean
  items?: ItemDemo[]
  total?: number
  /** Lo que el pedido pasó a ser, para que la pantalla se refresque sin releer. */
  patch?: CambioDemo
}

const suma = (items: ItemDemo[]) => items.reduce((n, it) => n + (Number(it.precio) || 0), 0)

/** El carrito de un pedido de ejemplo. Los del generador no traen `items`
 *  —tienen un producto y su precio—, así que se arma uno al primer cambio. */
function carritoDe(p: PedidoDemo): ItemDemo[] {
  if (Array.isArray(p.items) && p.items.length) return p.items
  const precio = Number(p.product_price ?? 0)
  return [{
    product_id: p.product_id ?? null,
    nombre: p.product_name ?? 'Producto',
    precio,
    unit_price: precio,
    qty: 1,
    pack_name: p.pack_name ?? null,
  }]
}

/**
 * Avanzar en el demo mueve el reloj que le toque al paso.
 *
 * Es la diferencia con la tienda de verdad, y es legítima: ahí `registrado` lo
 * enciende la guía y `en origen` lo reporta Shalom, así que el panel no los
 * ofrece —prometer un hecho que no tenemos es mentir—. En el demo no hay guía
 * ni courier: **los hacemos nosotros**, que es justamente lo que hay que poder
 * enseñar. La guía se inventa acá, con el mismo formato que la de verdad.
 */
export function avanzarEnDemo(p: PedidoDemo): RespuestaDemo {
  const sig = siguientePaso(p)
  if (!sig) return { ok: false }
  const ahora = new Date().toISOString()

  // Seis dígitos como los del generador. Del reloj y no de `Math.random`: en el
  // demo nada es al azar, ni siquiera una guía inventada de un clic. El código
  // y la clave se DERIVAN del número, como todo lo demás.
  const numeroNuevo = String(100000 + (Date.now() % 900000))
  const courierNuevo = String(p.tracking_courier ?? p.agency_name ?? 'SHALOM').toUpperCase() === 'OLVA'
    ? 'OLVA' as const : 'SHALOM' as const

  const patch: CambioDemo =
    sig.quien === 'guia'
      ? {
        tracking_numero: numeroNuevo,
        tracking_courier: courierNuevo,
        // Los identificadores completos de una guía Shalom: el código que viaja
        // por el chat y la clave que se queda en el panel hasta que el saldo se
        // pague. Olva no lleva ninguno de los dos.
        tracking_codigo: courierNuevo === 'SHALOM' ? codigoDemoDeGuia(numeroNuevo) : null,
        shalom_pickup_code: courierNuevo === 'SHALOM' ? claveDemoDeRecojo(numeroNuevo) : null,
        stage: 'en_camino',
      }
      : sig.quien === 'courier'
        ? { tracking_phase: sig.fase, tracking_phase_at: ahora }
        : { stage: sig.stage, ...(sig.fase ? { tracking_phase: sig.fase, tracking_phase_at: ahora } : {}) }

  guardarCambio(p.id, patch)

  // La guía registrada también se ANUNCIA, con la misma copy que manda
  // `registrarGuia` en una tienda de verdad (`_shared/mensaje-de-guia.ts`):
  // la pre-guía, dónde seguirla y qué pasa con el saldo. Sin botón de PDF —el
  // demo no tiene un PDF de Shalom que abrir, y un botón hacia una página
  // vacía enseña un producto roto.
  if (sig.quien === 'guia') {
    const saldo = saldoDelPedido(p)
    agregarMensajeDemo(p.id, {
      id: `demo-guia-${Date.now()}`, session_id: p.id, sender_role: 'system',
      sender_name: 'Kross', sender_role_label: null, read_at: null,
      type: 'guia', visibility: 'all',
      // Los mismos ids que el mensaje real (`idsDeGuia`): en Shalom, el nro. de
      // orden y el código del voucher.
      body: mensajeDeGuia(courierNuevo,
        idsDeGuia(courierNuevo, { numero: numeroNuevo, codigo: patch.tracking_codigo }), saldo),
      // La guía de muestra: en una tienda real acá va el voucher que subió
      // `shalom-order`. Solo Shalom — de Olva no hay documento que enseñar.
      media_url: courierNuevo === 'SHALOM' ? GUIA_DEMO_PDF : null,
      created_at: ahora,
    })
    // Y si el pedido ya no debe nada, la clave sale JUNTO con la guía — el
    // mensaje de arriba acaba de prometerlo, y es lo que hace `registrarGuia`
    // en una tienda real. Con saldo pendiente se queda guardada: la entrega el
    // pago (`saldoPagadoEnDemo`, espejo del webhook).
    if (saldo === 0 && patch.shalom_pickup_code) {
      agregarMensajeDemo(p.id, {
        id: `demo-clave-${Date.now()}`, session_id: p.id, sender_role: 'system',
        sender_name: 'Kross', sender_role_label: null, read_at: null,
        type: 'status_update', visibility: 'all',
        body: mensajeDeClave(patch.shalom_pickup_code),
        created_at: ahora,
      })
    }
  }
  return { ok: true, patch }
}

/** El resto de acciones, con la misma forma que las del servidor. */
export function ejecutarEnDemo(p: PedidoDemo, payload: { action: string; [k: string]: unknown }): RespuestaDemo {
  switch (payload.action) {
    case 'advance': {
      const stage = String(payload.stage ?? '')
      // El cierre de fracaso viaja por la misma puerta que avanzar, y no es un
      // paso del eje: se marca tal cual, sin preguntarle a `siguientePaso`.
      if (stage === 'no_entregado' || stage === 'entregado') {
        const patch = { stage }
        guardarCambio(p.id, patch)
        return { ok: true, patch }
      }
      return avanzarEnDemo(p)
    }
    case 'cancel': {
      const patch = { status: 'cancelado' }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'anular': {
      const patch = { status: 'anulado' }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'restore': {
      const patch = { status: 'active' }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'recreate': {
      const patch = { status: 'active', stage: 'nuevo', nota: 'recuperado' }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'set_nota': {
      const patch = { nota: (payload.nota as string | null) ?? null }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'mark_answered': {
      const patch = { answered_at: new Date().toISOString() }
      guardarCambio(p.id, patch); return { ok: true, patch }
    }
    case 'set_qty': {
      const items = [...carritoDe(p)]
      const i = Number(payload.index ?? -1)
      const qty = Math.max(1, Number(payload.qty ?? 1))
      if (!items[i]) return { ok: false }
      // Sin packs de por medio: el demo cobra el unitario por la cantidad, que
      // es lo que el vendedor está explicando. El precio por pack lo resuelve el
      // servidor contra el producto, y acá no hay servidor.
      const unit = Number(items[i].unit_price ?? items[i].precio) || 0
      items[i] = { ...items[i], qty, precio: unit * qty, pack_name: `${qty} und` }
      const total = suma(items)
      guardarCambio(p.id, { items, product_price: total })
      return { ok: true, items, total, patch: { items, product_price: total } }
    }
    case 'remove_item': {
      const items = carritoDe(p)
      const i = Number(payload.index ?? -1)
      if (!items[i]) return { ok: false }
      if (items.length <= 1) return { ok: false }
      const quedan = items.filter((_, k) => k !== i)
      const total = suma(quedan)
      guardarCambio(p.id, { items: quedan, product_price: total })
      return { ok: true, items: quedan, total, patch: { items: quedan, product_price: total } }
    }
    default:
      return { ok: false }
  }
}

/**
 * Un upsell completo, de una: la oferta y el cliente aceptándola.
 *
 * En la tienda de verdad son dos momentos con una persona en medio —el asesor
 * manda la oferta, el comprador la acepta desde su chat—. En el demo no hay
 * nadie del otro lado, y una oferta que se queda esperando para siempre no
 * enseña nada: lo que hay que poder mostrar es el pedido creciendo, el total
 * subiendo y el anillo bajando porque el adelanto ya no lo cubre.
 *
 * Escribe los DOS mensajes que escribiría el servidor, con los mismos textos,
 * para que la conversación se lea igual que una de verdad.
 */
export function ofertaAceptadaEnDemo(
  p: PedidoDemo,
  oferta: { product_id?: string | null; nombre: string; precio: number; image?: string | null },
  quien: { nombre: string; rol: string | null },
  /** El mensaje de oferta que se envió antes (`ofertaEnviadaEnDemo`). Se marca
   *  aceptado en vez de meter otro: dos ofertas en el hilo por una sola es lo
   *  que pasaba cuando esto insertaba la oferta ya aceptada. */
  mensajeId: string,
): RespuestaDemo {
  const items = [...carritoDe(p), {
    product_id: oferta.product_id ?? null,
    nombre: oferta.nombre,
    precio: oferta.precio,
    unit_price: oferta.precio,
    qty: 1,
    image: oferta.image ?? null,
  }]
  const total = suma(items)
  const ahora = Date.now()

  actualizarMensajeDemo(p.id, mensajeId, { offer: { ...oferta, accepted: true } })
  agregarMensajeDemo(p.id, {
    id: `demo-of-${ahora}-ok`, session_id: p.id, sender_role: 'seller',
    sender_name: quien.nombre, sender_role_label: quien.rol, read_at: null,
    type: 'text', created_at: new Date(ahora).toISOString(),
    // El MISMO texto que escribe `order-manage`: un mensaje que se lee distinto
    // según quién lo generó es un mensaje en el que no se puede confiar — y el
    // demo existe para enseñar lo que va a pasar de verdad.
    body: resumenDelPedido({
      cambio: `🛍️ Producto agregado: ${oferta.nombre}`,
      total, abonado: cobradoDelPedido(p), entregaJunta: true,
    }),
  })
  guardarCambio(p.id, { items, product_price: total })
  return { ok: true, items, total, patch: { items, product_price: total } }
}

/**
 * Invitar a alguien, en la tienda de ejemplo.
 *
 * Hace lo mismo que `order-manage`: lo suma a los participantes, deja el aviso
 * que ve el comprador ("se unió al chat") y, si hay nota, la nota interna
 * etiquetándolo. Los tres pasos importan para enseñarlo — la gracia de invitar
 * con nota es justo que el otro llegue sabiendo qué le toca.
 *
 * Los participantes se siembran con el vendedor asignado: si se guardaran solo
 * los invitados, invitar a alguien haría **desaparecer** de "Asignado" a quien
 * lleva el pedido.
 */
export function invitarEnDemo(
  p: PedidoDemo,
  miembro: { id: string; nombre: string; role_label?: string | null },
  nota: string,
  quien: { nombre: string; rol: string | null },
): RespuestaDemo {
  const previos = participantesDe(p)
  if (previos.some(x => x.id === miembro.id)) return { ok: false }

  const participants: Participant[] = [...previos, {
    id: miembro.id,
    nombre: miembro.nombre,
    role_label: miembro.role_label ?? '',
    avatar_url: null,
    can_write: true,
    is_owner: false,
  }]

  const ahora = Date.now()
  const base = { session_id: p.id, read_at: null }
  const nuevos: MensajeDemo[] = [{
    ...base, id: `demo-inv-${ahora}`, sender_role: 'system', type: 'status_update',
    created_at: new Date(ahora).toISOString(),
    // Mismo texto que escribe el servidor, para que se lea igual.
    body: `${miembro.nombre.split(' ')[0]} (${miembro.role_label ?? 'equipo'}) se unió al chat`,
  }]
  if (nota.trim()) {
    nuevos.push({
      ...base, id: `demo-inv-${ahora}-nota`, sender_role: 'seller',
      sender_name: quien.nombre, sender_role_label: quien.rol,
      type: 'text', visibility: 'sellers', mentions: [miembro.id],
      created_at: new Date(ahora + 1000).toISOString(),
      body: `@${miembro.nombre} ${nota.trim()}`,
    })
  }

  agregarMensajeDemo(p.id, ...nuevos)
  guardarCambio(p.id, { participants })
  return { ok: true, patch: { participants } }
}

/** Los participantes que tiene hoy este pedido de ejemplo, sembrados con el
 *  asignado: guardar solo a los invitados haría desaparecer de "Asignado" a
 *  quien lleva el pedido. */
function participantesDe(p: PedidoDemo): Participant[] {
  if (p.participants?.length) return p.participants
  return [{
    id: p.assigned_seller_id ?? 'demo-asignado',
    nombre: p.seller_name ?? 'Asignado',
    role_label: p.seller_role ?? '',
    avatar_url: null,
    can_write: true,
    is_owner: true,
  }]
}

/**
 * Pasarle el pedido a otro, en la tienda de ejemplo.
 *
 * Igual que el servidor: cambia el responsable, deja al anterior dentro —lleva
 * el contexto y lo normal es que el nuevo le pregunte algo—, le dice al
 * comprador quién lo atiende ahora y escribe la nota interna con el porqué.
 */
export function reasignarEnDemo(
  p: PedidoDemo,
  nuevo: { id: string; nombre: string; role_label?: string | null },
  nota: string,
  quien: { nombre: string; rol: string | null },
): RespuestaDemo {
  if (!nota.trim() || nuevo.id === p.assigned_seller_id) return { ok: false }

  const previos = participantesDe(p)
  const participants: Participant[] = [
    { id: nuevo.id, nombre: nuevo.nombre, role_label: nuevo.role_label ?? '', avatar_url: null, can_write: true, is_owner: true },
    ...previos
      .filter(x => x.id !== nuevo.id)
      .map(x => ({ ...x, is_owner: false })),
  ]

  const ahora = Date.now()
  const base = { session_id: p.id, read_at: null }
  agregarMensajeDemo(p.id,
    {
      ...base, id: `demo-re-${ahora}`, sender_role: 'system', type: 'status_update',
      created_at: new Date(ahora).toISOString(),
      body: `Ahora te atiende ${nuevo.nombre.split(' ')[0]} (${nuevo.role_label ?? 'equipo'})`,
    },
    {
      ...base, id: `demo-re-${ahora}-nota`, sender_role: 'seller',
      sender_name: quien.nombre, sender_role_label: quien.rol,
      type: 'text', visibility: 'sellers', mentions: [nuevo.id],
      created_at: new Date(ahora + 1000).toISOString(),
      body: `@${nuevo.nombre} ${nota.trim()}`,
    },
  )
  const patch: CambioDemo = {
    participants,
    assigned_seller_id: nuevo.id,
    seller_name: nuevo.nombre,
    seller_role: nuevo.role_label ?? null,
  }
  guardarCambio(p.id, patch)
  return { ok: true, patch }
}

/** Sacar a alguien del pedido. Al responsable no: para eso se reasigna. */
export function quitarEnDemo(p: PedidoDemo, id: string): RespuestaDemo {
  if (!id || id === p.assigned_seller_id) return { ok: false }
  const participants = participantesDe(p).filter(x => x.id !== id)
  const patch: CambioDemo = { participants }
  guardarCambio(p.id, patch)
  return { ok: true, patch }
}


// ─── Cobrar algo más, enseñando ──────────────────────────────────────────────
//
// Las tres mueven la LISTA de cobros, que es la misma que lee el panel en una
// tienda de verdad (bloque §36). No hay atajo de pantalla: si el demo tocara
// otra cosa, enseñaría un camino que en producción no existe.

/** Un cobro nuevo, pendiente. Sin cupón, igual que en la tienda real: el cupón
 *  se emite cuando el comprador toca pagar.
 *
 *  El id lleva la posición y no un azar: dos cobros creados en el mismo
 *  milisegundo compartirían id, y el segundo pagaría por el primero. */
export function cobroExtraEnDemo(p: PedidoDemo, monto: number, concepto: string): CambioDemo & { id: string } {
  const previos = p.cobros ?? []
  const id = `demo-extra-${previos.length}-${Date.now()}`
  const cobros = [...previos, {
    id, tipo: 'extra' as const, monto, estado: 'PENDING', concepto,
    created_at: new Date().toISOString(),
  }]
  guardarCambio(p.id, { cobros })
  return { cobros, id }
}

/** El comprador lo paga — segundo tiempo, diez segundos después.
 *
 *  Se marca POR ID y no "el primer pendiente": con dos cobros esperando, el que
 *  se acepta tiene que ser el que se acaba de mandar. */
export function cobroExtraPagadoEnDemo(p: PedidoDemo, cobroId: string): CambioDemo {
  const cobros = (p.cobros ?? []).map(c =>
    c.id === cobroId
      ? { ...c, estado: 'MATCHED', matched_at: new Date().toISOString(),
          // El código de pago del COMPRADOR, que es el que usa un extra en la
          // tienda real (`pay360-coupon` emite con `session.pay360_consumer_code`,
          // estable por comprador). Sin él la tarjeta verde salía sin código.
          pay360_consumer_code: p.payment_trace?.payment_code ?? null }
      : c)
  const patch = { cobros }
  guardarCambio(p.id, patch)
  const suyo = cobros.find(c => c.id === cobroId)
  if (suyo) acusarPagoEnDemo(p, 'extra', Number(suyo.monto ?? 0), cobroId, suyo.concepto)
  return patch
}

/** Darlo de baja. ANULADO y no borrado, igual que el servidor: el cobro existió
 *  y se le mandó al comprador; borrarlo dejaría una conversación sobre algo que
 *  en la base no pasó nunca. */
export function quitarCobroEnDemo(p: PedidoDemo, cobroId: string): CambioDemo {
  const cobros = (p.cobros ?? []).map(c => c.id === cobroId ? { ...c, estado: 'ANULADO' } : c)
  const patch = { cobros }
  guardarCambio(p.id, patch)
  return patch
}
