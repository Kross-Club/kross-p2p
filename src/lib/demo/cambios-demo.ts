import { useSyncExternalStore } from 'react'
import { siguientePaso } from '../order-tracking'
import type { OrderItem, Participant } from '../order-api'
import type { StoreOrder } from '../store-orders'

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
  tracking_phase?: string | null
  tracking_phase_at?: string | null
  items?: ItemDemo[]
  product_price?: number
  answered_at?: string | null
  /** Quién participa en el chat. En el demo el generador no los trae —el pedido
   *  solo lleva su vendedor asignado—, así que se arman al primer invitado. */
  participants?: Participant[]
  /** Los mensajes AGREGADOS en esta demo. Se pegan al final de la conversación
   *  que arma el generador, no la reemplazan. */
  mensajes?: MensajeDemo[]
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

  const patch: CambioDemo =
    sig.quien === 'guia'
      ? {
        // Seis dígitos como los del generador. Del reloj y no de `Math.random`:
        // en el demo nada es al azar, ni siquiera una guía inventada de un clic.
        tracking_numero: String(100000 + (Date.now() % 900000)),
        tracking_courier: p.tracking_courier ?? p.agency_name ?? 'SHALOM',
        stage: 'en_camino',
      }
      : sig.quien === 'courier'
        ? { tracking_phase: sig.fase, tracking_phase_at: ahora }
        : { stage: sig.stage, ...(sig.fase ? { tracking_phase: sig.fase, tracking_phase_at: ahora } : {}) }

  guardarCambio(p.id, patch)
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
  const base = { session_id: p.id, sender_role: 'seller', sender_name: quien.nombre, sender_role_label: quien.rol, read_at: null }

  agregarMensajeDemo(p.id,
    { ...base, id: `demo-of-${ahora}`, type: 'offer', body: null, created_at: new Date(ahora).toISOString(), offer: { ...oferta, accepted: true } },
    {
      ...base, id: `demo-of-${ahora}-ok`, type: 'text', created_at: new Date(ahora + 1000).toISOString(),
      body: `✅ Agregué ${oferta.nombre} a tu pedido. Nuevo total: S/${total} — llega todo junto en una sola entrega. 📦`,
    },
  )
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
  const previos: Participant[] = p.participants?.length ? p.participants : [{
    id: p.assigned_seller_id ?? 'demo-asignado',
    nombre: p.seller_name ?? 'Asignado',
    role_label: p.seller_role ?? '',
    avatar_url: null,
    can_write: true,
    is_owner: true,
  }]
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
