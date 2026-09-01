import type { OrderStage } from './order-stages'
import type { FilaDeCobro } from '../../supabase/functions/_shared/cobros.ts'
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface OrderSession {
  /** El token del pedido — la llave de su chat, su hoja de guía y su botón de
   *  pagar. `get-session` NO lo devuelve (se entra CON él): lo pone la página
   *  al cargar, desde su propia URL. Sin esto, el botón de pagar el saldo del
   *  comprador era un no-op silencioso en la tienda real — `pedido.token`
   *  llegaba undefined y `pagar()` retornaba sin hacer nada. */
  token?: string | null
  id: string
  order_id: string
  store_id: string | null
  product_id: string | null
  buyer_id: string | null
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  /** `anulado` = creado por error o de prueba. Aparte de `cancelado` a
   *  propósito: un cancelado fue una venta que se perdió y tiene que pesar en
   *  la conversión; un anulado nunca fue una venta. Ver `contable()`. */
  status: 'active' | 'delivered' | 'rejected' | 'expired' | 'cancelado' | 'anulado'
  stage: OrderStage
  expires_at: string | null
  seller_name: string | null
  seller_role: string | null
  seller_avatar: string | null
  address?: string | null
  address_verified?: boolean
  address_lat?: number | null
  address_lng?: number | null
  nota?: string | null
  /** Cómo se entrega: `MOTORIZADO_LIMA`, `MOTORIZADO_PROVINCIA` (los dos a la
   *  puerta, distinto courier) o `AGENCIA_PROVINCIA` (mostrador). Decide si
   *  tiene sentido pedir GPS — en agencia no lo tiene. */
  dispatch_type?: string | null
  agency_name?: string | null
  /** Sede de recojo elegida (§27.b). Ver `pickupBranchIdOf`. */
  agency_branch_id?: string | null
  delivery_reference?: string | null
  /** Contrato `shipment` (00-CORE): identificadores del comprobante del
   *  courier + fase reflejada por el job de tracking. */
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_codigo?: string | null
  tracking_ose_id?: string | null
  /** Año de emisión de la guía Olva (YY): su API rastrea por numero+año. */
  tracking_year?: string | null
  tracking_phase?: string | null
  tracking_phase_at?: string | null
  tracking_demora_at?: string | null
  /** ⚠️ La clave de retiro de Shalom. `get-session` la manda SOLO al equipo
   *  probado (mismo candado que los comentarios internos): quien la tiene se
   *  lleva el paquete. Al comprador le llega como mensaje del chat recién
   *  cuando paga su saldo — nunca por este campo. */
  shalom_pickup_code?: string | null
  /** Estado del cobro del adelanto. */
  payment_verification?: string | null
  /** Motivo escrito por el cobro. Solo llega al vendedor. */
  payment_reason?: string | null
  /** Cuándo se dio por respondida la última pregunta del comprador. */
  answered_at?: string | null
  advance_amount?: number | string | null
  /** '360PAY' = el adelanto se cobra en línea; NULL = sin cobro en línea. */
  payment_provider?: string | null
  items?: OrderItem[] | null
  buyer_can_call?: boolean
  assigned_seller_id?: string | null
  involved_seller_ids?: string[] | null
  writer_seller_ids?: string[] | null
  participants?: Participant[]
  /** Ficha de contacto del comprador. SOLO llega cuando el que mira es
   *  vendedor — para el comprador viaja null, igual que `payment_reason`. */
  buyer_contact?: {
    nombre: string | null
    document_type: string | null
    document_number: string | null
    /** El WhatsApp del checkout (y el teléfono del cliente en 360pay). El
     *  número desde el que YAPEÓ no existe: Yape no lo revela — del pago llega
     *  la operación bancaria, en `payment_trace`. */
    phone: string | null
    /** Primera vez que el comprador entró a la app. `null` = nunca. */
    activated_at?: string | null
    /** Si HOY tiene una suscripción viva a notificaciones. No es lo mismo que
     *  haber entrado: desinstalar la app no avisa a nadie, pero se lleva la
     *  suscripción. Es lo único honesto que se puede decir, y es justo lo que
     *  decide si una push le llega. */
    push_activo?: boolean
  } | null
  /** Rastro del pago cruzado — la cadena con la que el comercio coteja contra
   *  el panel de 360pay y contra el banco. Solo vendedor. */
  payment_trace?: PagoTrazado | null
  /** Cuándo se cruzó el adelanto (o el pago total). La columna existía desde el
   *  principio y no llegaba al tipo, así que el panel no podía decir CUÁNDO
   *  entró la plata — que es lo que ubica la transacción en el portal. */
  /** Los cobros de este pedido (bloque §36). Cuando viene, `cobrosDelPedido`
   *  lee de acá: es el modelo donde un pedido tiene N cobros y el adelanto y el
   *  saldo son dos filas más. Las columnas de abajo son lo de antes. */
  cobros?: FilaDeCobro[] | null
  payment_matched_at?: string | null
  /** Cuándo caduca cada cupón (bloque §35). `null` = se emitió antes de que se
   *  guardara la fecha; ver `vigencia-de-cupon.ts` — eso NO es "vencido". */
  pay360_coupon_expires_at?: string | null
  pay360_saldo_coupon_expires_at?: string | null
  /** El SALDO: la segunda operación, cuando ya hay guía. Sus propias columnas
   *  porque es otro cupón, otra fecha y otro número de operación bancaria. */
  saldo_amount?: number | null
  saldo_verification?: string | null
  saldo_matched_at?: string | null
  saldo_trace?: PagoTrazado | null
}

/** El rastro de UN cobro: la cadena con la que el comercio coteja contra el
 *  panel de 360pay y contra el banco. */
export interface PagoTrazado {
  operation_number: string | null
  bank: string | null
  /** Id del cupón en 360pay (el `_id` que su panel muestra en el detalle). */
  coupon_id: string | null
  /** Código de pago del cliente (KSH…): es como el panel LISTA los cupones. */
  payment_code: string | null
}

export interface OrderItem {
  product_id?: string | null
  nombre: string
  precio: number          // total de la línea (qty incluida)
  unit_price?: number     // precio de 1 unidad
  qty?: number
  pack_name?: string | null
  image?: string | null
}

export interface Participant {
  id: string
  nombre: string
  role_label: string
  avatar_url: string | null
  can_write: boolean
  is_owner?: boolean
  invited_by?: string | null
}

export interface OrderMessage {
  id: string
  session_id: string
  sender_role: 'buyer' | 'seller' | 'courier' | 'system' | 'sofia'
  sender_name: string | null
  sender_role_label?: string | null
  /** `all` lo ve también el comprador; `sellers` es un COMENTARIO INTERNO.
   *  `null` son las filas viejas, de antes de la columna: cuentan como
   *  públicas. Quién puede leer lo interno lo decide `get-session`, que para
   *  eso exige un JWT de vendedor verificado (ver lib/comentario-interno.ts). */
  visibility?: 'all' | 'sellers' | null
  /** `auth_user_id` de la gente etiquetada con `@` en un comentario interno. */
  mentions?: string[] | null
  /** `cobro` = el vendedor volvió a pedir el saldo: el chat del comprador lo
   *  pinta con el botón de Yape debajo (ver lib/cobro-por-chat.ts). La columna
   *  es texto libre, así que no hizo falta tocar el esquema. */
  type: 'text' | 'audio' | 'image' | 'call_log' | 'status_update' | 'offer' | 'cobro' | 'guia'
  body: string | null
  media_url: string | null
  offer?: { product_id?: string; nombre: string; precio: number; image?: string | null; accepted?: boolean } | null
  /** Grabación de esta llamada, cuando el mensaje es el cierre de una
   *  (`type: 'call_log'`). El AUDIO no viaja en el mensaje: la URL firmada la
   *  pide el panel a `get-recordings`, que sigue siendo solo para admins. */
  call_recording_id?: string | null
  /** De qué COBRO es esta tarjeta de pago (bloque §37). Es un puntero: el
   *  monto, el concepto y si ya se pagó se leen de la lista de cobros del
   *  pedido, no del mensaje —copiarlos acá sería tener dos versiones del mismo
   *  importe y que una envejezca—. `null` en los mensajes de antes de la
   *  columna, y ahí la tarjeta es del saldo, que es lo que era cuando se
   *  mandó. */
  cobro_id?: string | null
  created_at: string
  read_at: string | null
}

export interface SessionData {
  session: OrderSession
  messages: OrderMessage[]
}

export async function getSession(token: string): Promise<SessionData> {
  const res = await fetch(`${BASE}/get-session`, {
    headers: {
      Authorization: `Bearer ${ANON}`,
      'x-kross-token': token,
    },
  })
  if (res.status === 404) throw new Error('not_found')
  if (!res.ok) throw new Error('server_error')
  return res.json()
}

export async function sendMessage(
  token: string,
  payload: { type: 'text' | 'audio' | 'image'; body?: string; media_url?: string }
): Promise<OrderMessage> {
  const res = await fetch(`${BASE}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, ...payload }),
  })
  if (!res.ok) throw new Error('send_failed')
  return res.json()
}

export async function markRead(token: string): Promise<void> {
  await fetch(`${BASE}/mark-read`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })
}
