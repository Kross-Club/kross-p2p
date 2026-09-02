import { AgencyService } from '../checkout/services/AgencyService'
import { agregarPorComprador, segmentoDe } from '../../../supabase/functions/_shared/clientes.ts'
import type { StoreOrder } from '../store-orders'
import type { Cliente, PedidoDeCliente } from '../store-clients'
import type { Curioso } from '../store-drafts'
import type { GrupoEntrega } from '../mapa-entregas'
import { claveDemoDeRecojo, codigoDemoDeGuia, comisionDemo, conCambios, guardarCambio, GUIA_DEMO_PDF } from './cambios-demo'
import { idsDeGuia, mensajeDeClave, mensajeDeGuia, mensajeDeOrigen } from '../../../supabase/functions/_shared/mensaje-de-guia.ts'
import { acuseDePago } from '../../../supabase/functions/_shared/acuse-de-pago.ts'
import { soles, textoDeCobro } from '../../../supabase/functions/_shared/cobro-por-chat.ts'

// ─── Una tienda de ejemplo que sí vende ──────────────────────────────────────
//
// Reproduce una marca que despacha ~1.000 pedidos al día entre tres productos
// (S/150, S/120 y S/180), con meses de historial detrás: clientes que repiten,
// otros que se están yendo, y una ventana viva de pedidos en todas las etapas.
//
// Tres reglas para que esto no se vuelva una mentira:
//
//  1. **Las sedes son reales.** Los destinos se buscan en el listado de Shalom y
//     Olva, así que las líneas del mapa caen donde caerían de verdad. Lo único
//     inventado son los pedidos.
//  2. **Nunca se mezcla con lo real.** El panel muestra o lo uno o lo otro, y
//     mientras muestra esto lo dice con una barra fija arriba.
//  3. **Es determinista.** Mismo generador, mismos datos: sin `Math.random()`,
//     con una semilla fija. Si cada pintada inventara números distintos, un
//     total cambiaría solo al cambiar de modo y nadie podría fiarse de nada.
//
// Nada de esto toca la base de datos.

/** Cuántos pedidos al día representa esta tienda. Sale en la barra del panel. */
export const PEDIDOS_POR_DIA = 1000

/**
 * La ventana VIVA: lo que el panel muestra de verdad.
 *
 * En producción `get-store-sessions` corta en 80, así que un demo que trajera
 * miles enseñaría una pantalla que la tienda real nunca va a ver. Se generan
 * algunos más que el corte para que el tablero tenga fondo en cada columna.
 */
const VENTANA = 120

/**
 * El HISTORIAL, para que los clientes tengan pasado.
 *
 * Solo pedidos entregados y solo con los campos que necesita el agregado
 * (comprador, precio, fecha): son los que dan LTV, recompra y segmentos. Traer
 * seis meses de pedidos completos costaría megabytes para pintar un promedio.
 */
const HISTORIAL = 2200
const DIAS_HISTORIAL = 180
const DIA = 86_400_000

// ─── Azar reproducible ───────────────────────────────────────────────────────
// mulberry32: pequeño, rápido y determinista. La semilla es fija a propósito.
function azar(semilla: number) {
  let a = semilla
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const elige = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const entre = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1))

// ─── El rastro de un cobro, en la tienda de ejemplo ──────────────────────────
//
// En producción esto lo arma `get-session` cruzando el cupón de la fila con el
// evento del webhook. Acá no hay servidor, así que se inventa — pero con la
// FORMA de los de verdad: el código de pago que escribe el comercio (prefijo de
// 3 letras + correlativo), el `_id` de 360pay (24 hex, como un id de Mongo) y
// el número de operación del banco.
//
// Sin esto, la tarjeta de cobro del demo salía sin un solo dato de seguimiento
// —tres líneas vacías— y quien mira el demo concluía que el panel no los
// guarda. Un demo que enseña de menos es peor que no tenerlo.
const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank'] as const
const HEX = '0123456789abcdef'

function rastroDemo(r: () => number, i: number, pagado: boolean) {
  const cupon = Array.from({ length: 24 }, () => HEX[Math.floor(r() * 16)]).join('')
  return {
    payment_code: `KSH${String(1000 + i).slice(-4)}`,
    coupon_id: cupon,
    // Un cupón emitido y sin pagar no tiene rastro bancario: todavía no ocurrió.
    operation_number: pagado ? String(entre(r, 10000000, 99999999)) : null,
    bank: pagado ? elige(r, BANCOS) : null,
  }
}

// ─── El catálogo ─────────────────────────────────────────────────────────────
export interface ProductoDemo {
  id: string
  nombre: string
  precio: number
  activo: boolean
  images: string[]
  packs: { nombre: string; precio: number }[]
  vendidos: number
}

const CATALOGO: { id: string; nombre: string; precio: number }[] = [
  { id: 'demo-prod-1', nombre: 'Faja Reductora Premium', precio: 150 },
  { id: 'demo-prod-2', nombre: 'Set de Ollas Antiadherentes', precio: 120 },
  { id: 'demo-prod-3', nombre: 'Colchón Inflable Doble', precio: 180 },
]

const NOMBRES = [
  'Rosa Medina', 'Luis Ccahuana', 'Ana Quispe', 'Jorge Farfán', 'Marta Ríos',
  'Pedro Chávez', 'Silvia Mamani', 'Diego Vílchez', 'Carmen Huamán', 'Raúl Espinoza',
  'Nélida Palomino', 'Óscar Tapia', 'Gladys Ayala', 'Wilder Chuquimango', 'Betty Rojas',
  'Iván Cárdenas', 'Milagros Sáenz', 'Hugo Paredes', 'Lucía Ventura', 'Édgar Ticona',
  'Yeny Cabrera', 'Marco Zegarra', 'Pilar Ordóñez', 'Fredy Anccasi', 'Rocío Bardales',
]
const APELLIDOS = ['Torres', 'Flores', 'Gutiérrez', 'Sánchez', 'Ramos', 'Castillo', 'Núñez', 'Vargas']

/** De dónde sale y a dónde va. Casi todo el despacho del país sale de Lima. */
const ORIGEN = 'LIMA'
const DESTINOS = [
  { departamento: 'LA LIBERTAD', courier: 'SHALOM' },
  { departamento: 'AREQUIPA', courier: 'SHALOM' },
  { departamento: 'CUSCO', courier: 'OLVA' },
  { departamento: 'PIURA', courier: 'SHALOM' },
  { departamento: 'LORETO', courier: 'OLVA' },
  { departamento: 'JUNIN', courier: 'SHALOM' },
  { departamento: 'PUNO', courier: 'OLVA' },
  { departamento: 'LAMBAYEQUE', courier: 'SHALOM' },
  { departamento: 'ANCASH', courier: 'SHALOM' },
  { departamento: 'ICA', courier: 'OLVA' },
] as const

/** La ventana viva, repartida como se reparte de verdad: se acumula al final
 *  de la cadena, no al principio. Un tablero con todo en "Pedido" no se parece
 *  a ninguna operación real. */
const REPARTO: { stage: string; fase: string | null; peso: number }[] = [
  { stage: 'nuevo', fase: null, peso: 8 },
  { stage: 'validando', fase: null, peso: 10 },
  // El montón de `confirmado` es el peso que tenía `preparando` más el suyo: es
  // la columna donde de verdad se acumula la operación —plata cobrada que
  // todavía no tiene guía, incluido lo que el API del courier rechazó— y el
  // tablero tiene que enseñarla llena, porque llena es como se ve.
  { stage: 'confirmado', fase: null, peso: 26 },
  { stage: 'en_camino', fase: null, peso: 8 },            // guía emitida, sin reporte
  { stage: 'en_camino', fase: 'EN_ORIGEN', peso: 10 },
  { stage: 'en_camino', fase: 'EN_TRANSITO', peso: 16 },
  { stage: 'en_camino', fase: 'EN_DESTINO', peso: 12 },
  { stage: 'entregado', fase: 'ENTREGADO', peso: 8 },
  { stage: 'no_entregado', fase: null, peso: 2 },
]

export interface MiembroDemo {
  id: string
  auth_user_id: string
  nombre: string
  role_label: string
  is_admin: boolean
  available: boolean
  avatar_url: string | null
}

const EQUIPO: MiembroDemo[] = [
  { nombre: 'Andrea Quiroz', role_label: 'Admin', is_admin: true, available: true },
  { nombre: 'Kevin Salas', role_label: 'Ventas', is_admin: false, available: true },
  { nombre: 'Milagros Pinto', role_label: 'Ventas', is_admin: false, available: true },
  { nombre: 'Renzo Aguilar', role_label: 'Despacho', is_admin: false, available: true },
  { nombre: 'Yajaira Cruz', role_label: 'Soporte', is_admin: false, available: false },
  { nombre: 'Christian Loayza', role_label: 'Motorizado', is_admin: false, available: true },
].map((m, i) => ({
  ...m,
  id: `demo-seller-${i}`,
  auth_user_id: `demo-auth-${i}`,
  avatar_url: null,
}))

// ─── El audio de ejemplo ─────────────────────────────────────────────────────
// Un WAV diminuto generado a mano (un tono suave de medio segundo). Existe para
// que el reproductor de la grabación sea REAL y no un botón muerto: se ve el
// control, se puede dar play y se oye algo. Pesa ~4 KB en base64 y no sale del
// navegador. Lo que NO hace es fingir una conversación grabada.
function wavDeEjemplo(): string {
  const hz = 8000, segundos = 0.6, n = Math.floor(hz * segundos)
  const buf = new Uint8Array(44 + n)
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i) }
  const u32 = (o: number, v: number) => { buf[o] = v & 255; buf[o+1] = (v>>8) & 255; buf[o+2] = (v>>16) & 255; buf[o+3] = (v>>24) & 255 }
  const u16 = (o: number, v: number) => { buf[o] = v & 255; buf[o+1] = (v>>8) & 255 }
  txt(0, 'RIFF'); u32(4, 36 + n); txt(8, 'WAVE'); txt(12, 'fmt ')
  u32(16, 16); u16(20, 1); u16(22, 1); u32(24, hz); u32(28, hz); u16(32, 1); u16(34, 8)
  txt(36, 'data'); u32(40, n)
  for (let i = 0; i < n; i++) {
    const desvanece = 1 - i / n
    buf[44 + i] = 128 + Math.round(Math.sin(i * 0.08) * 40 * desvanece)
  }
  let bin = ''
  for (const b of buf) bin += String.fromCharCode(b)
  return `data:audio/wav;base64,${btoa(bin)}`
}

export const AUDIO_DEMO = wavDeEjemplo()

/** La conversación de un pedido: lo que el equipo y el comprador se dijeron. */
function conversacion(
  r: () => number, ahora: number, pedidoId: string,
  cliente: string, producto: string, vendedor: string, t: { stage: string; fase: string | null },
  /** El envío ya registrado, si el pedido lo tiene: con esto el hilo lleva la
   *  tarjeta de la guía —la misma copy que manda `registrarGuia`—. */
  envio?: {
    courier: 'SHALOM' | 'OLVA'; numero: string
    /** El código del voucher y la clave de retiro (solo Shalom). El código
     *  viaja con la guía; la clave, RECIÉN contra el saldo pagado. */
    codigo: string | null; clave: string | null
    saldo: number
    /** El saldo YA pagado en este hilo: el acuse y la clave que el webhook
     *  habría escrito entonces. `null` = todavía debe (o no había saldo). */
    pagado?: { cobroId: string; monto: number; total: number } | null
  } | null,
): NonNullable<StoreOrder['chat_messages']> {
  const msgs: NonNullable<StoreOrder['chat_messages']> = []
  let cuando = ahora - entre(r, 2, 9) * DIA
  const push = (rol: string, tipo: string, cuerpo: string, extra: Record<string, unknown> = {}) => {
    cuando += entre(r, 2, 90) * 60_000
    msgs.push({
      id: `${pedidoId}-m${msgs.length}`,
      sender_role: rol,
      type: tipo,
      body: cuerpo,
      created_at: new Date(cuando).toISOString(),
      read_at: new Date(cuando).toISOString(),
      ...extra,
    } as NonNullable<StoreOrder['chat_messages']>[number])
  }

  push('system', 'status_update', `Pedido registrado · ${producto}`)
  push('buyer', 'text', elige(r, [
    'Hola, quiero confirmar mi pedido por favor',
    'Buenas, ¿en cuánto tiempo me llega?',
    '¿Sigue disponible el pack de 2?',
  ]))
  push('seller', 'text', `¡Hola ${cliente.split(' ')[0]}! Soy ${vendedor.split(' ')[0]}. Confirmo tu pedido de ${producto}.`)

  // Una llamada, con su grabación. Es lo que antes vivía en otra pantalla.
  if (r() < 0.45) {
    push('system', 'call_log', `${vendedor} inició una llamada de voz`)
    const seg = entre(r, 45, 260)
    push('system', 'call_log', `Llamada de voz · ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`,
      { call_recording_id: `${pedidoId}-rec` })
  }

  if (t.stage !== 'nuevo') {
    push('buyer', 'text', elige(r, ['Ya hice el pago', 'Listo, adelanté la mitad', 'Te mando el yapeo']))
    // El acuse solo si el adelanto DE VERDAD cruzó: `validando` es justamente
    // "hay un yapeo que todavía no cuadra", y su hilo decía "Adelanto
    // verificado" con el panel en ámbar — el pedido contradiciéndose solo.
    // ⚠️ La tirada del reloj se hace SIEMPRE (saltarla correría el azar de
    // todos los pedidos de abajo); lo condicional es solo escribir el mensaje.
    cuando += entre(r, 2, 90) * 60_000
    if (t.stage !== 'validando') {
      msgs.push({
        id: `${pedidoId}-m${msgs.length}`,
        sender_role: 'system',
        type: 'status_update',
        body: 'Adelanto verificado',
        created_at: new Date(cuando).toISOString(),
        read_at: new Date(cuando).toISOString(),
      } as NonNullable<StoreOrder['chat_messages']>[number])
    }
  }
  // La guía registrada, ANTES de que el courier reporte nada — que es cuando
  // ocurrió. ⚠️ Sin tiradas: el reloj avanza fijo, porque un `entre(r,…)` acá
  // correría el azar de todos los pedidos de abajo (aviso de CLAUDE.md).
  if (envio) {
    // Reloj fijo también para estos: cada mensaje del sistema que este bloque
    // agrega va SIN tirada, igual que la guía.
    const sistema = (tipo: string, cuerpo: string, extra: Record<string, unknown> = {}) => {
      msgs.push({
        id: `${pedidoId}-m${msgs.length}`,
        sender_role: 'system',
        type: tipo,
        body: cuerpo,
        created_at: new Date(cuando).toISOString(),
        read_at: new Date(cuando).toISOString(),
        ...extra,
      } as NonNullable<StoreOrder['chat_messages']>[number])
    }
    cuando += 45 * 60_000
    sistema('guia',
      // Los mismos ids que el mensaje real (`idsDeGuia`): en Shalom, el nro. de
      // orden y el código del voucher — la clave NO va aquí.
      mensajeDeGuia(envio.courier,
        idsDeGuia(envio.courier, { numero: envio.numero, codigo: envio.codigo }), envio.saldo),
      // La guía de muestra (PDF real de Shalom, autorizado por el dueño): lo
      // que en una tienda real es el voucher subido por `shalom-order`.
      { media_url: envio.courier === 'SHALOM' ? GUIA_DEMO_PDF : null })

    // La CLAVE, exactamente cuando la entrega la tienda real (`registrarGuia` /
    // el webhook): junto con la guía si el pedido ya no debía nada, o pegada al
    // acuse del saldo si lo pagó después. Un hilo del demo con saldo pendiente
    // NO la enseña — esa retención es la regla que se está enseñando.
    if (envio.saldo === 0 && envio.clave) {
      cuando += 60_000
      sistema('status_update', mensajeDeClave(envio.clave))
    }
    // El paquete ENTRÓ A ORIGEN (cualquier fase reportada implica que pasó por
    // ahí): el aviso que la guía prometió y, si el pedido debía su saldo, LA
    // TARJETA DE PAGO que el tracking manda sola en la tienda real — la misma
    // copy que la del vendedor (`_shared/cobro-por-chat.ts`). En los hilos que
    // después pagaron se ve pagada, porque la tarjeta se pinta contra el pedido
    // de hoy; en los que deben, sigue cobrando. Antes del acuse a propósito:
    // primero se cobra, después entra la plata.
    if (t.fase) {
      cuando += 60 * 60_000
      sistema('status_update', mensajeDeOrigen(envio.courier))
      if (envio.saldo > 0) {
        cuando += 60_000
        sistema('cobro', textoDeCobro(soles(envio.saldo)))
      }
    }
    if (envio.pagado) {
      cuando += 90 * 60_000
      sistema('status_update',
        acuseDePago({ tipo: 'saldo', pagado: envio.pagado.monto, total: envio.pagado.total, esRecojo: true }),
        { cobro_id: envio.pagado.cobroId })
      if (envio.clave) {
        cuando += 60_000
        sistema('status_update', mensajeDeClave(envio.clave))
      }
    }
  }
  if (t.fase === 'EN_TRANSITO' || t.fase === 'EN_DESTINO' || t.fase === 'ENTREGADO') {
    push('system', 'status_update', '🚚 ¡Tu pedido va en camino a tu agencia!')
  }
  if (t.fase === 'EN_DESTINO' || t.fase === 'ENTREGADO') {
    push('system', 'status_update', '📍 ¡Tu pedido ya llegó a tu agencia!')
    push('buyer', 'text', '¿Con qué documento lo recojo?')
    // Coherente con la regla nueva: la clave no la "pasa" una persona — la
    // entrega el chat solo, contra el saldo pagado (o ya la entregó, si no
    // había saldo). El vendedor solo señala dónde está.
    push('seller', 'text', 'Con tu DNI y tu clave de recojo, que te llega por este mismo chat.')
  }

  // Y en una parte de los hilos, la última palabra es del comprador.
  //
  // Sin esto NINGÚN pedido de ejemplo quedaba "sin responder": todas las
  // conversaciones cerraban con la tienda o con un aviso del sistema, así que la
  // vista que ordena la bandeja salía siempre en cero y el botón de "marcar como
  // respondido" —que solo aparece cuando hay deuda— no se veía nunca.
  //
  // Se mezclan los dos casos a propósito, porque piden cosas distintas: una
  // pregunta hay que contestarla; un "gracias" no —ese se cierra a mano, y es
  // justo para lo que existe el botón.
  if (r() < 0.4) {
    push('buyer', 'text', elige(r, [
      // Piden respuesta
      '¿Ya salió mi pedido?',
      'Hola, ¿alguna novedad?',
      '¿Me pueden cambiar la dirección?',
      // No piden nada: se cierran marcándolos
      'Gracias 🙏',
      'Ok, perfecto 👍',
      '¡Buenísimo! 😄',
    ]))
  }
  return msgs
}

export interface PedidoHistorico {
  buyer_id: string
  order_id: string
  /** Su token, como cualquier pedido. Todo pedido nace de un formulario y por
   *  eso todo pedido tiene chat: un "pedido sin chat" no existe en el producto,
   *  y el demo no debería inventar un estado que la tienda real no tiene. La
   *  conversación se arma al abrirlo (`pedidoDemoPorToken`) y no acá: son miles
   *  de pedidos, y generar miles de chats para que se lean cuatro es pagar por
   *  adelantado algo que casi nunca se usa. */
  token: string
  product_price: number
  product_name: string
  created_at: string
}

export interface RutaDemo {
  courier: string
  destinoId: string
  origenId: string
}

export interface TiendaDemo {
  pedidos: StoreOrder[]
  /** Las rutas reales (courier + sede de destino). Las necesita el armado de un
   *  pedido histórico, que ocurre al abrirlo y no al generar la tienda. */
  rutas: RutaDemo[]
  /** Compradores "conectados" ahora mismo, para el puntito verde. La presencia
   *  de verdad la da Supabase y en una tienda de ejemplo no hay nadie: un
   *  tablero donde ningún cliente está en línea no enseña la herramienta. */
  enLinea: string[]
  /** Lo entregado en los últimos meses. Es lo que da recompras a la ficha del
   *  cliente y peso al LTV; no son pedidos vivos, así que no tienen chat. */
  historial: PedidoHistorico[]
  clientes: Cliente[]
  productos: ProductoDemo[]
  equipo: MiembroDemo[]
  /** Producto → sede de origen, igual que lo arma Logística en Productos. */
  origenPorProducto: Record<string, string>
}

let cache: Promise<TiendaDemo> | null = null

/** La tienda de ejemplo. Se arma una vez por sesión y se reutiliza: así los
 *  números no bailan al cambiar de pantalla. */
export function tiendaDemo(): Promise<TiendaDemo> {
  if (!cache) cache = construir()
  return cache
}

async function construir(): Promise<TiendaDemo> {
  const r = azar(20260827)
  const ahora = Date.now()

  // ── Las sedes reales de cada destino ──
  const sedes = await Promise.all(DESTINOS.map(async d => {
    const [destino] = await AgencyService.byDepartment(d.courier, d.departamento)
    const [origen] = await AgencyService.byDepartment(d.courier, ORIGEN)
    return destino && origen ? { ...d, destinoId: destino.id, origenId: origen.id } : null
  }))
  const rutas = sedes.filter((x): x is NonNullable<typeof x> => !!x)

  const origenPorProducto: Record<string, string> = {}
  const rutaShalom = rutas.find(x => x.courier === 'SHALOM')
  for (const p of CATALOGO) if (rutaShalom) origenPorProducto[p.id] = rutaShalom.origenId

  // ── Las personas ──
  // Una parte compra una vez y otra repite: sin esa mezcla no hay tasa de
  // recompra que mirar, que es medio Loyalty.
  const TOTAL_CLIENTES = 640
  const personas = Array.from({ length: TOTAL_CLIENTES }, (_, i) => ({
    id: `demo-cli-${i}`,
    nombre: `${elige(r, NOMBRES).split(' ')[0]} ${elige(r, APELLIDOS)}`,
    document_number: String(entre(r, 10000000, 79999999)),
    phone: `9${entre(r, 10000000, 99999999)}`,
  }))

  // ── El historial: solo entregados, solo lo que pesa el agregado ──
  const historial: PedidoHistorico[] = []
  for (let i = 0; i < HISTORIAL; i++) {
    // Sesgo hacia los primeros clientes: unos pocos concentran las recompras,
    // que es como se comporta una base real.
    const idx = Math.floor(Math.pow(r(), 1.7) * TOTAL_CLIENTES)
    const prod = elige(r, CATALOGO)
    historial.push({
      buyer_id: personas[Math.min(idx, TOTAL_CLIENTES - 1)].id,
      product_price: prod.precio,
      product_name: prod.nombre,
      order_id: `ORD-${17540000000000 + i * 6151}`,
      token: `demo-h-${i}`,
      created_at: new Date(ahora - entre(r, 1, DIAS_HISTORIAL) * DIA).toISOString(),
    })
  }

  const porComprador = agregarPorComprador(historial)
  const clientes: Cliente[] = personas.map((p, i) => {
    const a = porComprador.get(p.id) ?? { pedidos: 0, gastado: 0, ultimo: 0 }
    return {
      id: p.id,
      nombre: p.nombre,
      document_type: 'DNI',
      document_number: p.document_number,
      phone: p.phone,
      puntos: Math.round(a.gastado / 10),
      score: entre(r, 40, 95),
      source: i % 7 === 0 ? 'import' : 'order',
      activated_at: i % 3 === 0 ? new Date(ahora - entre(r, 1, 90) * DIA).toISOString() : null,
      created_at: new Date(ahora - entre(r, 1, DIAS_HISTORIAL) * DIA).toISOString(),
      pedidos: a.pedidos,
      gastado: a.gastado,
      ultimo: a.ultimo ? new Date(a.ultimo).toISOString() : null,
      segmento: segmentoDe(a.ultimo, ahora, 30, 60),
    }
  })

  // ── La ventana viva de pedidos ──
  const bolsa: typeof REPARTO = []
  for (const t of REPARTO) for (let i = 0; i < t.peso; i++) bolsa.push(t)

  const pedidos: StoreOrder[] = Array.from({ length: VENTANA }, (_, i) => {
    const t = elige(r, bolsa)
    const prod = elige(r, CATALOGO)
    const ruta = elige(r, rutas)
    const persona = personas[entre(r, 0, TOTAL_CLIENTES - 1)]
    const conGuia = t.stage === 'en_camino' || t.stage === 'entregado'
    // Mitad y mitad es el reparto típico del adelanto; algunos pagan todo.
    //
    // ⚠️ La tirada se hace SIEMPRE, se use o no: quitarla en una rama correría
    // el azar de todos los pedidos siguientes (aviso de CLAUDE.md). En
    // CONFIRMADO se ignora y todos adelantan LA MITAD: esa es la columna donde
    // se enseñan el comprobante del pago y la pre-guía —el pedido recién
    // cobrado, listo para registrar su envío—, y un "pagó todo" ahí no deja
    // saldo que cobrar ni flujo que mostrar.
    const sorteo = r() < 0.25 ? prod.precio : Math.round(prod.precio / 2)
    const adelanto = t.stage === 'confirmado' ? Math.round(prod.precio / 2) : sorteo
    // Que el adelanto esté CRUZADO lo decide la etapa ENTERA, en las dos
    // direcciones. `validando` significa exactamente "hay un yapeo que todavía
    // no cuadra", y de `confirmado` en adelante el pedido está ahí PORQUE la
    // plata entró. Y al revés también: en la tienda real el webhook escribe
    // `stage: 'confirmado'` EN EL MISMO ACTO de cruzar el adelanto, así que un
    // pedido en `nuevo` o `validando` con la plata cruzada no puede existir —
    // era la captura de "Wilder Flores": Pedido creado con el adelanto pagado,
    // el anillo apagado y el formulario de registrar envío ofrecido.
    // La tirada se hace SIEMPRE y se ignora entera (quitarla correría el azar
    // de todos los pedidos de abajo — aviso de CLAUDE.md).
    const antesDeCobrar = t.stage === 'nuevo' || t.stage === 'validando'
    r()
    const cruzado = !antesDeCobrar

    // ── El SALDO: la segunda operación ──
    // No es el adelanto con otro monto. Ocurre después —cuando la guía ya
    // existe— con su propio cupón, y es lo que suelta la clave de recojo. Tres
    // condiciones, las mismas que `puedePagarSaldo`: que quede algo por cobrar,
    // que el adelanto YA esté cruzado (el banco cobra siempre el cupón
    // pendiente más antiguo) y que haya guía.
    //
    // Y no lo paga todo el mundo, a propósito: el que no lo paga por acá lo
    // arregla con el comercio por fuera y llega a `entregado` con el anillo a
    // medias. Ese contraste es justo lo que el anillo existe para enseñar —si
    // en el demo todos pagaran el saldo, un anillo lleno no significaría nada.
    const falta = prod.precio - adelanto
    const puedeSaldo = falta > 0 && cruzado && conGuia
    const saldoPagado = puedeSaldo && r() < 0.55
    // Y unos cuantos con el cupón emitido y SIN pagar: es el estado ámbar, el
    // que no se puede leer como plata que entró.
    const saldoEmitido = puedeSaldo && !saldoPagado && r() < 0.3

    // ── El upsell ──
    // Un producto que se le agregó al pedido DESPUÉS de cobrar el adelanto: en
    // el chat, o armándolo en logística. El total sube y el adelanto, que no
    // cambió, deja de ser la mitad — así que el anillo de esos pedidos se ve en
    // fracciones raras (150 de 230), que es justo como se ve en la tienda real.
    // Sin ninguno, el anillo parecería tener solo tres posiciones.
    //
    // Solo sobre pedidos sin saldo en juego: el saldo se cobra contra el total
    // del momento, y mezclar las dos cosas en un dato de ejemplo enseñaría una
    // cuenta que no cuadra.
    const upsell = cruzado && !saldoPagado && !saldoEmitido && r() < 0.12 ? elige(r, CATALOGO) : null
    const valorPedido = prod.precio + (upsell?.precio ?? 0)

    const miembro = elige(r, EQUIPO)
    const faseAt = t.fase ? new Date(ahora - entre(r, 0, 6) * DIA).toISOString() : null
    // Cuándo entró cada cobro. Se calcula UNA vez y se usa en los dos sitios
    // —las columnas y la lista de `cobros`— por dos razones que van juntas:
    //
    //  · cada `r()` corre el generador entero, así que una tirada de más acá le
    //    cambia el azar a todos los pedidos de abajo (ver el aviso en CLAUDE.md);
    //  · y si la lista dijera una fecha y la columna otra, el demo enseñaría un
    //    pedido que no cuadra consigo mismo — justo lo que la mudanza al bloque
    //    §36 existe para que no pase.
    const cobradoEl = cruzado ? new Date(ahora - entre(r, 0, 8) * DIA).toISOString() : null
    const saldoCobradoEl = saldoPagado ? new Date(ahora - entre(r, 0, 4) * DIA).toISOString() : null

    const p: StoreOrder = {
      id: `demo-ped-${i}`,
      // Mismo formato que el de verdad (`ORD-<milisegundo>`): es lo que se
      // recorta para el código corto que se ve en la cabecera y en la ficha.
      order_id: `ORD-${17563450000000 + i * 7919}`,
      token: `demo-${i}`,
      store_id: 'demo',
      buyer_id: persona.id,
      buyer_name: persona.nombre,
      buyer_phone: persona.phone,
      // El DNI viaja embebido igual que en la respuesta real: sin él el
      // buscador del panel encontraría por nombre en el demo y por nombre y DNI
      // en producción, o sea que el demo enseñaría de menos.
      buyers: { document_number: persona.document_number },
      product_id: prod.id,
      product_name: prod.nombre,
      // El TOTAL del pedido, no el precio de un producto: con upsell son dos.
      // Es lo mismo que hace el servidor —`order-manage` reescribe
      // `product_price` con la suma del carrito— y lo que hace que el anillo se
      // mida contra el total de hoy.
      product_price: valorPedido,
      pack_name: elige(r, ['Pack 1', 'Pack 2', 'Pack 3']),
      // Cancelado ≠ anulado: el primero fue una venta que se perdió (y pesa en
      // la conversión), el segundo nunca fue una venta —una prueba, un dedazo—.
      // Los dos existen en cualquier tienda real y el tablero los separa.
      status: r() < 0.04 ? 'cancelado' : r() < 0.03 ? 'anulado' : 'active',
      stage: t.stage,
      // Las cuatro etiquetas que existen (order-chips.ts). Con solo dos, la
      // fila de etiquetas del panel se enseñaba a medias.
      nota: r() < 0.18 ? elige(r, ['no_contesta', 'reprogramado', 'datos_incompletos', 'recuperado']) : null,
      dispatch_type: r() < 0.35 ? 'AGENCIA_LIMA' : 'AGENCIA_PROVINCIA',
      agency_name: ruta.courier,
      agency_branch_id: ruta.destinoId,
      advance_amount: adelanto,
      payment_verification: cruzado ? 'MATCHED' : 'PENDING',
      saldo_amount: saldoPagado || saldoEmitido ? falta : null,
      saldo_verification: saldoPagado ? 'MATCHED' : saldoEmitido ? 'PENDING' : null,
      // Con qué se sigue cada cobro. Son DOS rastros porque son dos operaciones
      // —otro cupón, otra operación bancaria, otra fecha—, igual que en la
      // tienda real (bloque §31 del esquema).
      payment_trace: rastroDemo(r, i, cruzado),
      payment_matched_at: cobradoEl,
      saldo_trace: saldoPagado || saldoEmitido ? rastroDemo(r, i + 5000, saldoPagado) : null,
      saldo_matched_at: saldoCobradoEl,
      // La tienda de ejemplo COBRA EN LÍNEA. Sin esta línea `puedePagarSaldo`
      // daba false en todo el demo, así que ni el comprador veía su botón de
      // pagar el saldo ni el vendedor el de mandarle la tarjeta: dos funciones
      // enteras invisibles justo donde se enseñan.
      payment_provider: '360PAY',
      // Los cobros como LISTA (bloque §36), que es lo que lee el panel desde la
      // mudanza. Se generan a partir de los mismos datos que las columnas de
      // arriba: si el demo armara una lista distinta de sus propias columnas,
      // enseñaría un pedido que no cuadra consigo mismo.
      cobros: [
        { id: `demo-cob-${i}-a`, tipo: 'adelanto' as const, monto: adelanto,
          estado: cruzado ? 'MATCHED' : 'PENDING', matched_at: cobradoEl,
          ...comisionDemo(adelanto, cruzado),
          created_at: new Date(ahora - 9 * DIA).toISOString() },
        ...(saldoPagado || saldoEmitido ? [{
          id: `demo-cob-${i}-s`, tipo: 'saldo' as const, monto: falta,
          estado: saldoPagado ? 'MATCHED' : 'PENDING', matched_at: saldoCobradoEl,
          ...comisionDemo(falta, saldoPagado),
          created_at: new Date(ahora - 2 * DIA).toISOString(),
        }] : []),
        // Y uno de cada diecisiete lleva un cobro EXTRA sin pagar —un flete—,
        // para que el tercer cobro y su botón de dar de baja se vean sin tener
        // que crearlos: lo que no aparece solo, en una demo no se enseña.
        //
        // Del ÍNDICE, nunca de `r()`, y el monto también: una tirada de más acá
        // le corre el azar a todos los pedidos de abajo (aviso de CLAUDE.md).
        // Y PENDIENTE siempre, que además lo deja fuera de la caja: un extra
        // cobrado movería lo que el tablero suma.
        ...(i % 17 === 3 ? [{
          id: `demo-cob-${i}-x`, tipo: 'extra' as const, monto: 10 + (i % 4) * 5,
          estado: 'PENDING', concepto: 'Flete a provincia',
          created_at: new Date(ahora - 1 * DIA).toISOString(),
        }] : []),
      ],
      // Y uno de cada cinco cupones de saldo está VENCIDO. Es lo que hace
      // visible el otro camino —"venció · generar otro código"—, que si no
      // habría que esperar un mes para verlo una vez.
      //
      // Sale del ÍNDICE y no de `r()`, y no es un capricho: **cada tirada corre
      // el generador entero**. Este archivo es determinista a propósito, así que
      // una tirada de más acá le cambia el azar a TODOS los pedidos de abajo.
      // Se descubrió así — una prueba dejó de encontrar pedidos `no_entregado`,
      // que no tenían nada que ver con los cupones.
      pay360_saldo_coupon_expires_at: saldoEmitido && !saldoPagado
        ? new Date(ahora + (i % 5 === 0 ? -(1 + i % 4) : 3 + (i % 26)) * DIA).toISOString()
        : null,
      tracking_courier: conGuia ? ruta.courier : null,
      tracking_numero: conGuia ? String(entre(r, 100000, 999999)) : null,
      tracking_phase: t.fase,
      tracking_phase_at: faseAt,
      // La demora es rara y por eso importa: un tablero donde todo está en rojo
      // no enseña a mirar el rojo.
      tracking_demora_at: t.fase === 'EN_TRANSITO' && r() < 0.08
        ? new Date(ahora - entre(r, 1, 3) * DIA).toISOString() : null,
      // Cobrado y sin guía porque el proveedor rechazó el registro. Pasa de
      // verdad y es el atasco más caro del tablero: sin un par de estos en el
      // demo, la alerta que existe para verlo no se ve nunca.
      // Solo en pedidos SHALOM: `shalom_order_status` lo escribe `shalom-order`,
      // que descarta los de Olva antes de reclamar nada — un FAILED de Shalom
      // en un pedido Olva es un estado que la tienda real no puede producir.
      // ⚠️ La tirada se evalúa EXACTAMENTE cuando antes (solo en confirmado,
      // por el cortocircuito): mover el filtro de courier adentro del ternario
      // y no alrededor de `r()` es lo que mantiene el azar idéntico.
      shalom_order_status: t.stage === 'confirmado' && r() < 0.18
        ? (ruta.courier === 'OLVA' ? null : 'FAILED')
        : conGuia && ruta.courier !== 'OLVA' ? 'CREATED' : null,
      shalom_order_reason: null,
      assigned_seller_id: miembro.auth_user_id,
      seller_name: miembro.nombre,
      seller_role: miembro.role_label,
      created_at: new Date(ahora - entre(r, 0, 9) * DIA - entre(r, 0, 23) * 3_600_000).toISOString(),
      // Uno de cada cuatro ya está cerrado a mano: se le llamó, se le contestó
      // por WhatsApp, o era un "gracias". Sin alguno así, el estado "respondido"
      // tampoco se vería nunca.
      answered_at: r() < 0.25 ? new Date(ahora - entre(r, 0, 5) * 3_600_000).toISOString() : null,
    }

    // Los identificadores que faltaban de la guía Shalom, DERIVADOS del número
    // ya sorteado — cero tiradas nuevas (aviso de CLAUDE.md): el código del
    // voucher, que viaja por el chat, y la clave de retiro, que se queda en el
    // panel del vendedor hasta que el saldo se pague. Olva no lleva ninguno.
    if (p.tracking_numero && ruta.courier !== 'OLVA') {
      p.tracking_codigo = codigoDemoDeGuia(p.tracking_numero)
      p.shalom_pickup_code = claveDemoDeRecojo(p.tracking_numero)
    }

    // La conversación se arma DESPUÉS del literal para poder contarle del
    // envío ya registrado (la guía vive en `p.tracking_numero`, que un literal
    // no puede leerse a sí mismo). `chat_messages` era el último campo, así que
    // el orden de las tiradas queda EXACTAMENTE igual que antes.
    p.chat_messages = conversacion(
      r, ahora, `demo-ped-${i}`, persona.nombre, prod.nombre, miembro.nombre, t,
      conGuia && p.tracking_numero
        ? { courier: ruta.courier === 'OLVA' ? 'OLVA' : 'SHALOM', numero: p.tracking_numero,
            codigo: p.tracking_codigo ?? null, clave: p.shalom_pickup_code ?? null,
            // El saldo DE ESE MOMENTO, contra el TOTAL de ese momento
            // (`valorPedido`, upsell incluido): el upsell viaja EN el paquete,
            // así que existía antes de registrar la guía. Con el precio base
            // acá, a quien pagó el total base y llevaba upsell la guía le decía
            // "ya pagaste el total" y le soltaba la clave — con el panel
            // cobrándole un saldo. Es la captura de "Luis Núñez": la clave
            // entregada a quien todavía debe.
            saldo: Math.max(0, valorPedido - adelanto),
            // Y si este hilo YA pagó su saldo, el acuse y la clave que el
            // webhook habría escrito entonces, con su comprobante.
            pagado: saldoPagado
              ? { cobroId: `demo-cob-${i}-s`, monto: falta, total: valorPedido }
              : null }
        : null,
    )
    return p
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  // ── El catálogo, con lo vendido de cada uno ──
  const vendidosPorProducto = new Map<string, number>()
  for (const h of historial) vendidosPorProducto.set(
    String(h.product_price),
    (vendidosPorProducto.get(String(h.product_price)) ?? 0) + 1,
  )
  const productos: ProductoDemo[] = CATALOGO.map(p => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    activo: true,
    images: [],
    packs: [
      { nombre: 'Pack 1', precio: p.precio },
      { nombre: 'Pack 2', precio: Math.round(p.precio * 1.7) },
      { nombre: 'Pack 3', precio: Math.round(p.precio * 2.3) },
    ],
    vendidos: vendidosPorProducto.get(String(p.precio)) ?? 0,
  }))

  // Uno de cada seis compradores de la ventana viva está mirando la app. Sale
  // del mismo azar sembrado que todo lo demás, así que no parpadea al cambiar
  // de pantalla.
  const enLinea = [...new Set(pedidos.filter(() => r() < 0.17).map(p => p.buyer_id ?? ''))].filter(Boolean)

  return { pedidos, rutas, historial, enLinea, clientes, productos, equipo: EQUIPO, origenPorProducto }
}

/**
 * La ficha de una persona de ejemplo: sus datos y TODOS sus pedidos.
 *
 * Sin esto la ficha del demo decía "No se pudo cargar": pedía `list-clients`,
 * que consulta la base de verdad y no sabe nada de un `demo-cli-7`. Un demo que
 * enseña la libreta pero se rompe al abrir a una persona es peor que no
 * tenerla — justo ahí es donde se ve la recompra, que es medio Loyalty.
 *
 * Junta las dos mitades —la ventana viva y el historial entregado—, del más
 * nuevo al más viejo. Las dos se abren igual: un pedido viejo es un pedido, no
 * un renglón de resumen.
 */
export async function fichaDemoDeCliente(
  buyerId: string,
): Promise<{ cliente: Cliente; pedidos: PedidoDeCliente[] } | null> {
  const t = await tiendaDemo()
  const cliente = t.clientes.find(c => c.id === buyerId)
  if (!cliente) return null

  const vivos: PedidoDeCliente[] = t.pedidos
    .filter(p => p.buyer_id === buyerId)
    .map(p => ({
      id: p.id,
      token: p.token ?? null,
      product_name: p.product_name ?? null,
      pack_name: p.pack_name ?? null,
      product_price: p.product_price ?? null,
      stage: p.stage ?? null,
      status: p.status ?? null,
      created_at: p.created_at ?? null,
      tracking_phase: p.tracking_phase ?? null,
    }))

  const entregados: PedidoDeCliente[] = t.historial
    .filter(h => h.buyer_id === buyerId)
    .map((h, i) => ({
      id: `demo-hist-${buyerId}-${i}`,
      token: h.token,
      product_name: h.product_name,
      pack_name: null,
      product_price: h.product_price,
      stage: 'entregado',
      status: 'active',
      created_at: h.created_at,
      tracking_phase: 'ENTREGADO',
    }))

  return {
    cliente,
    pedidos: [...vivos, ...entregados].sort(
      (a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
    ),
  }
}

/** El pedido de ejemplo detrás de un token (`demo-42`), o `null` si no es uno.
 *  Lo usa la pantalla del pedido para abrir el chat completo sin consultar. */
export async function pedidoDemoPorToken(token: string | undefined): Promise<StoreOrder | null> {
  if (!token || !esTokenDemo(token)) return null
  const t = await tiendaDemo()
  const viejo = /^demo-h-(\d+)$/.exec(token)
  if (viejo) return pedidoHistorico(t, Number(viejo[1]))
  const p = t.pedidos.find(x => x.token === token)
  // Con lo que se haya tocado enseñando: la etapa que se avanzó, el producto que
  // se agregó, los mensajes que se escribieron. Se aplica ACÁ y no en cada
  // pantalla para que el chat y el tablero lean lo mismo.
  return p ? conCambios(p) : null
}

/**
 * Un pedido entregado de hace meses, armado al abrirlo.
 *
 * Sale entero —con su conversación, su guía y su adelanto cruzado— porque eso
 * es lo que es: un pedido como cualquier otro, solo que viejo. Su azar va
 * sembrado con el índice, así que abrirlo dos veces da lo mismo.
 */
function pedidoHistorico(t: TiendaDemo, i: number): StoreOrder | null {
  const h = t.historial[i]
  if (!h) return null
  const r = azar(770000 + i)
  const cliente = t.clientes.find(c => c.id === h.buyer_id)
  const ruta = elige(r, t.rutas)
  const miembro = elige(r, EQUIPO)
  const nombre = cliente?.nombre ?? 'Comprador'
  const cerrado = { stage: 'entregado', fase: 'ENTREGADO' }

  return {
    id: `demo-hist-${i}`,
    order_id: h.order_id,
    token: h.token,
    store_id: 'demo',
    buyer_id: h.buyer_id,
    buyer_name: nombre,
    buyer_phone: cliente?.phone ?? null,
    buyers: { document_number: cliente?.document_number ?? null },
    product_name: h.product_name,
    product_price: h.product_price,
    pack_name: elige(r, ['Pack 1', 'Pack 2', 'Pack 3']),
    status: 'active',
    stage: 'entregado',
    nota: null,
    dispatch_type: r() < 0.35 ? 'AGENCIA_LIMA' : 'AGENCIA_PROVINCIA',
    agency_name: ruta.courier,
    agency_branch_id: ruta.destinoId,
    advance_amount: Math.round(h.product_price / 2),
    payment_verification: 'MATCHED',
    // También los viejos: un pedido de hace meses es el caso donde MÁS falta el
    // rastro —el reclamo llega tarde— y era el que salía sin nada.
    payment_trace: rastroDemo(r, 9000 + i, true),
    payment_matched_at: h.created_at,
    tracking_courier: ruta.courier,
    tracking_numero: String(entre(r, 100000, 999999)),
    tracking_phase: 'ENTREGADO',
    tracking_phase_at: h.created_at,
    tracking_demora_at: null,
    assigned_seller_id: miembro.auth_user_id,
    seller_name: miembro.nombre,
    seller_role: miembro.role_label,
    created_at: h.created_at,
    chat_messages: conversacion(
      r, Date.parse(h.created_at), `demo-hist-${i}`, nombre, h.product_name, miembro.nombre, cerrado,
    ),
  }
}

/**
 * Marca un pedido de ejemplo como respondido.
 *
 * Escribe sobre la tienda generada —que está cacheada por sesión— en vez de
 * llamar a `order-manage`: en el demo no hay base a la que escribir, y sin esto
 * el botón se vería pero no haría nada, que es peor que no tenerlo.
 */
export async function marcarRespondidoDemo(sessionId: string): Promise<string | null> {
  const t = await tiendaDemo()
  if (!t.pedidos.some(x => x.id === sessionId)) return null
  // Se anota como cualquier otro cambio del demo en vez de mutar el generador:
  // así sobrevive a recargar la página y se va al apagar el demo, igual que
  // mover de etapa o cambiar una cantidad.
  const answered_at = new Date().toISOString()
  guardarCambio(sessionId, { answered_at })
  return answered_at
}

/** Los tokens de ejemplo se reconocen por la forma, sin consultar nada: así la
 *  pantalla del pedido sabe a quién preguntarle antes de preguntar. */
export function esTokenDemo(token: string | null | undefined): boolean {
  return !!token && /^demo-(\d+|h-\d+)$/.test(token)
}

/**
 * Lo mismo, preguntando por el ID del pedido.
 *
 * Hace falta porque no todas las pantallas tienen el token a mano: el detalle
 * del pedido trabaja con `OrderSession`, que no lo lleva. Y la respuesta tiene
 * que ser la misma en las dos —de esto depende si el cambio se le pide al
 * servidor o se guarda en el dispositivo—, así que las dos formas viven juntas.
 */
export function esPedidoDemo(id: string | null | undefined): boolean {
  return !!id && /^demo-(ped|hist)-/.test(id)
}

/**
 * Los CURIOSOS de la tienda de ejemplo: dejaron DNI y WhatsApp y no siguieron.
 *
 * Se arman aparte de la ventana viva porque no son pedidos —no tienen etapa, ni
 * chat, ni vendedor— y meterlos en `pedidos` los haría contar en cada total del
 * panel. Son leads, y el tablero los enseña en su propia columna.
 *
 * Se reparten por `last_step`: la mayoría se cae temprano y unos pocos llegan
 * hasta el pago. Es la forma que tiene un embudo de verdad, y es la que hace
 * útil la columna — el área comercial llama primero a los que llegaron lejos.
 */
export async function curiososDemo(): Promise<Curioso[]> {
  const t = await tiendaDemo()
  const r = azar(880725)
  const ahora = Date.now()
  const DISTRITOS = [
    'San Juan de Lurigancho', 'Comas', 'Villa El Salvador', 'Ate', 'Los Olivos',
    'San Martín de Porres', 'Trujillo', 'Arequipa', 'Chiclayo', 'Huancayo',
  ]

  return Array.from({ length: 14 }, (_, i) => {
    const prod = elige(r, t.productos)
    // Hasta el paso 2 no se pregunta la ubicación: quien se fue antes no la
    // dejó, y la columna tiene que decirlo en vez de inventarla.
    const paso = entre(r, 2, 4)
    const conZona = paso >= 3
    return {
      order_id: `demo-draft-${i}`,
      store_id: 'demo',
      phone: `519${entre(r, 10000000, 99999999)}`,
      buyer_name: `${elige(r, NOMBRES).split(' ')[0]} ${elige(r, APELLIDOS)}`,
      document_number: String(entre(r, 10000000, 79999999)),
      product_id: prod.id,
      pack_name: elige(r, ['Pack 1', 'Pack 2', 'Pack 3']),
      location_type: conZona ? (r() < 0.55 ? 'LIMA' : 'PROVINCIA') : null,
      district: conZona ? elige(r, DISTRITOS) : null,
      last_step: paso,
      created_at: new Date(ahora - entre(r, 1, 14) * DIA).toISOString(),
      updated_at: new Date(ahora - entre(r, 0, 5) * DIA - entre(r, 0, 23) * 3_600_000).toISOString(),
    }
  }).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
}

/**
 * Las ENTREGAS de la tienda de ejemplo, repartidas por el país.
 *
 * El mapa de la libreta pregunta dónde se está entregando, y el historial del
 * demo —2.200 pedidos entregados— no guardaba dónde: se generaba con el precio
 * y la fecha, que es lo que pedía el LTV. Acá se le da geografía, sobre las
 * sedes REALES de Shalom y Olva: los puntos caen donde caerían de verdad.
 *
 * El reparto tiene la forma que tiene el país —Lima concentra, y la cola es
 * larga— porque un mapa con los mismos pedidos en cada distrito no enseña nada:
 * lo que se mira en un mapa así es justamente el desbalance.
 *
 * Una parte va por dirección escrita en vez de sede, y una porción de esa parte
 * NO se puede ubicar. Es a propósito: es lo que pasa de verdad con las entregas
 * a domicilio, y sin ella el renglón de "sin ubicar" —que existe para no mentir
 * con el total— nunca se vería.
 */
export async function entregasDemo(): Promise<{ grupos: GrupoEntrega[]; entregados: number; truncado: boolean }> {
  const t = await tiendaDemo()
  const r = azar(660412)

  const [sh, ol] = await Promise.all([
    import('../../data/agencies/shalom.json'),
    import('../../data/agencies/olva.json'),
  ])
  const de = (m: { default: unknown }, courier: string) =>
    (m.default as { branches: { id: string; department: string; lat?: number; lng?: number }[] }).branches
      .filter(b => b.lat != null && b.lng != null)
      .map(b => ({ id: b.id, courier, department: b.department }))

  // Lima primero: con la elección sesgada de abajo, eso la convierte en el
  // grueso del mapa sin tener que codificar porcentajes a mano.
  const todas = [...de(sh, 'SHALOM'), ...de(ol, 'OLVA')]
  const esLima = (d: string) => d.toUpperCase().includes('LIMA') || d.toUpperCase().includes('CALLAO')
  const orden = [...todas.filter(b => esLima(b.department)), ...todas.filter(b => !esLima(b.department))]
  const sedes = orden.filter((_, i) => i % 7 === 0).slice(0, 70)
  if (!sedes.length) return { grupos: [], entregados: 0, truncado: false }

  // Direcciones escritas: dos que el padrón sí resuelve y una que no —le falta
  // el departamento y "Miraflores" existe en Lima y en Arequipa—.
  const DIRECCIONES = [
    'Chimbote, Santa, Ancash',
    'Av. Grau 455, Los Olivos, Lima',
    'Av. Larco 123, Miraflores',
  ]

  const porClave = new Map<string, GrupoEntrega>()
  const suma = (g: Omit<GrupoEntrega, 'pedidos' | 'valor'>, valor: number) => {
    const clave = `${g.courier ?? ''}|${g.branch_id ?? ''}|${g.address ?? ''}|${g.product_id ?? ''}`
    const ya = porClave.get(clave)
    if (ya) { ya.pedidos += 1; ya.valor += valor }
    else porClave.set(clave, { ...g, pedidos: 1, valor })
  }

  for (const h of t.historial) {
    const prod = t.productos.find(p => p.nombre === h.product_name)
    const base = { product_id: prod?.id ?? null, product_name: h.product_name }

    if (r() < 0.05) {
      suma({ ...base, courier: null, branch_id: null, address: elige(r, DIRECCIONES) }, h.product_price)
      continue
    }
    // Sesgo hacia la cabeza de la lista: unas pocas sedes concentran, como en
    // cualquier operación real.
    const sede = sedes[Math.min(sedes.length - 1, Math.floor(Math.pow(r(), 2.2) * sedes.length))]
    suma({ ...base, courier: sede.courier, branch_id: sede.id, address: null }, h.product_price)
  }

  return { grupos: [...porClave.values()], entregados: t.historial.length, truncado: false }
}
