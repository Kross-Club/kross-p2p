// ─── Eva Courier · la regla pura (sin Deno, sin red) ─────────────────────────
//
// El courier tercero que reparte A DOMICILIO en Lima y Callao (§60 puso la
// bandera; §64 lo conecta). Es la única pieza cuya FORMA la manda un tercero:
// cuando Eva cambie un nombre de campo se toca este archivo y nada más, y como
// emitir un pedido en Eva es mandar un motorizado a una puerta, el payload se
// valida gratis en `npm test` antes de que cueste plata.
//
// Contrato leído de sus tres manuales (Fly Express, «EVA 3.0», jul-2026):
//
//   · **Integración API v1.1** — `POST /api/v1/orders/` con `Authorization:
//     Api-Key <llave>`, devuelve `tracking_id`. `GET /api/v1/orders/{id}/` da
//     estado + `tracks`. Sandbox en `api-test.evacourier.pe`.
//   · **Rótulos v1.0** — `POST /api/v1/integration/shipping-labels/` con
//     `{ids, format}` devuelve el PDF BINARIO (no JSON). Formato `sticker`
//     (A7, ticketera) o `A4`.
//   · **Webhooks v1.0** — `POST` firmado con `X-EVA-Signature` = HMAC-SHA256
//     hex del BODY CRUDO con el secret. Eventos `order.status_updated` y
//     `test.ping`. Eva NO reintenta si respondemos 4xx/5xx o tardamos >10 s.
//
// Lo que conviene tener presente, porque NO se comporta como Shalom:
//
//   · **No hay endpoint para BUSCAR un pedido por nuestro `code`.** Solo por
//     `tracking_id`, que es justo lo que no tenemos si la llamada murió sin
//     respuesta. Así que —igual que Olva LAT— un timeout se cierra en FAILED y
//     una persona mira en app.evacourier.pe antes de reintentar. Nunca se
//     reintenta a ciegas: dos pedidos en Eva son dos motorizados en la puerta.
//   · **El distrito es un NOMBRE EXACTO de SU lista** (65, con tildes y Ñ como
//     ellos los escriben), no el del INEI: «Lima» es «CERCADO DE LIMA»,
//     «Pachacamac» lleva tilde en la suya. `distritoEva` traduce; lo que no
//     traduce, no se emite.
//   · **Es cliente tipo RECOJO**: Eva pasa por el local de la marca a recoger.
//     Por eso `product` y `packages` son obligatorios y el rótulo es para el
//     VENDEDOR (se pega al paquete), no para el comprador —que no necesita
//     documento alguno: le llega a la puerta—.
//   · **`code` es nuestro `ORD-…`** y viaja como idempotencia de lectura: Eva
//     lo guarda y lo devuelve, pero NO rechaza un duplicado (lo dice su doc).
//     La idempotencia real es nuestro candado en la base (`eva_order_status`).

// ─── Dónde vive ──────────────────────────────────────────────────────────────

export const EVA_BASE_PROD = 'https://api.evacourier.pe'
export const EVA_BASE_TEST = 'https://api-test.evacourier.pe'

/** La base según el entorno. `EVA_API_BASE` la pisa entera (para el sandbox
 *  basta con `EVA_API_BASE=https://api-test.evacourier.pe`). */
export function baseEva(env: { EVA_API_BASE?: string | null } = {}): string {
  const v = String(env.EVA_API_BASE ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(v) ? v : EVA_BASE_PROD
}

export const rutaDePedidos = (base: string) => `${base}/api/v1/orders/`
export const rutaDePedido = (base: string, trackingId: string) => `${base}/api/v1/orders/${encodeURIComponent(trackingId)}/`
export const rutaDeRotulos = (base: string) => `${base}/api/v1/integration/shipping-labels/`

/** El header de auth, tal cual lo pide el manual: `Api-Key`, no `Bearer`. */
export const cabeceraEva = (apiKey: string): Record<string, string> =>
  ({ Authorization: `Api-Key ${apiKey}`, 'Content-Type': 'application/json' })

/**
 * ¿La llave puede ir en un header? Devuelve el problema con palabras, o null.
 *
 * La primera prueba real (16-set-2026) murió con «'headers' … is not a valid
 * ByteString»: el secret llevaba un carácter fuera de ASCII —un `…` copiado
 * de un comando de ejemplo, o unas comillas tipográficas al pegar— y `fetch`
 * revienta ANTES de salir, sin decir cuál. Un header no admite nada fuera de
 * Latin-1, y una API key de verdad es ASCII imprimible sin espacios: se exige
 * eso y se nombra el culpable, para que el arreglo sea «vuelve a pegar la
 * llave» y no una tarde de logs.
 */
export function problemaDeApiKey(key: unknown): string | null {
  const k = String(key ?? '')
  if (!k.trim()) return 'la API Key está vacía'
  if (/[\u2026]/.test(k)) return 'la API Key trae puntos suspensivos («…»): se copió el marcador del ejemplo en vez de la llave'
  if (/[\u2018\u2019\u201C\u201D"']/.test(k)) return 'la API Key trae comillas: pégala sin comillas'
  if (/\s/.test(k)) return 'la API Key trae espacios o saltos de línea'
  const raro = [...k].find(c => { const n = c.charCodeAt(0); return n < 0x21 || n > 0x7e })
  if (raro) return `la API Key trae un carácter que no puede ir en un header (U+${raro.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
  return null
}

// ─── Los distritos: del INEI al nombre exacto de Eva ─────────────────────────

/**
 * Los 65 de cobertura, COPIADOS del anexo A del manual, con sus tildes y su Ñ
 * tal como Eva los escribe: «los nombres son sensibles a mayúsculas, tildes y
 * espacios». Las entradas `PROVINCIA*` y los anexos de Jicamarca son zonas
 * internas de Eva; están porque están en la lista, pero ningún distrito del
 * INEI traduce a ellas.
 */
export const DISTRITOS_EVA: readonly string[] = [
  'ANCON', 'ATE', 'BARRANCO', 'BELLAVISTA', 'BREÑA', 'CAJAMARQUILLA', 'CALLAO', 'CARABAYLLO',
  'CARAPONGO', 'CARMEN DE LA LEGUA REYNOSO', 'CERCADO DE LIMA', 'CHACLACAYO', 'CHORRILLOS',
  'CHOSICA', 'CIENEGUILLA', 'COMAS', 'EL AGUSTINO', 'HUACHIPA', 'HUAYCAN', 'INDEPENDENCIA',
  'JESUS MARIA', 'JICAMARCA', 'JICAMARCA - ANEXO 22SJL', 'JICAMARCA - ANEXO 8 HUACHIPA',
  'LA MOLINA', 'LA PERLA', 'LA PUNTA', 'LA VICTORIA', 'LINCE', 'LOS OLIVOS', 'LURIGANCHO',
  'LURIN', 'MAGDALENA DEL MAR', 'MANCHAY', 'MARQUEZ - CALLAO', 'MI PERÚ', 'MIRAFLORES',
  'PACHACÁMAC', 'PROVINCIA', 'PROVINCIA MARVISUR', 'PROVINCIA OLVA', 'PROVINCIA SHALOM',
  'PUEBLO LIBRE', 'PUENTE PIEDRA', 'PUNTA NEGRA', 'RICARDO PALMA', 'RIMAC', 'SALAMANCA ATE',
  'SAN BORJA', 'SAN ISIDRO', 'SAN JUAN DE LURIGANCHO', 'SAN JUAN DE MIRAFLORES', 'SAN LUIS',
  'SAN MARTIN DE PORRES', 'SAN MIGUEL', 'SANTA ANITA', 'SANTA CLARA - ATE', 'SANTA EULALIA',
  'SANTA MARIA DEL MAR', 'SANTA ROSA', 'SANTIAGO DE SURCO', 'SURQUILLO', 'VENTANILLA',
  'VILLA EL SALVADOR', 'VILLA MARIA DEL TRIUNFO',
]

/** Mayúsculas, sin tildes en las vocales, con la Ñ intacta (Eva escribe
 *  «BREÑA»). Espacios colapsados. */
export function normalizarParaEva(s: unknown): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Donde el INEI y Eva no coinciden. El INEI llama «Lima» al Cercado; Eva
 * escribe dos con tilde (y solo esas dos) y hay que devolvérselas así.
 */
const EXCEPCIONES_EVA: Record<string, string> = {
  LIMA: 'CERCADO DE LIMA',
  'CERCADO DE LIMA': 'CERCADO DE LIMA',
  PACHACAMAC: 'PACHACÁMAC',
  'MI PERU': 'MI PERÚ',
  // Un apodo que la gente escribe y que Eva sí conoce: se respeta el nombre
  // del distrito (LURIGANCHO), que es como lo guarda el padrón.
  'LURIGANCHO-CHOSICA': 'LURIGANCHO',
  'LURIGANCHO CHOSICA': 'LURIGANCHO',
}

const DISTRITOS_EVA_NORM = new Map(DISTRITOS_EVA.map(d => [normalizarParaEva(d), d]))

/** El nombre EXACTO de Eva para un distrito del INEI, o `null` si Eva no lo
 *  cubre (Pucusana, San Bartolo, Punta Hermosa…). Lo que devuelve es lo que
 *  se manda, letra por letra. */
export function distritoEva(inei: unknown): string | null {
  const n = normalizarParaEva(inei)
  if (!n) return null
  const exc = EXCEPCIONES_EVA[n]
  if (exc) return exc
  return DISTRITOS_EVA_NORM.get(n) ?? null
}

/** Lo que Nominatim cuelga después del distrito y NO es dirección. Solo se
 *  descarta cuando ya se encontró el distrito: «CALLAO» es ruido detrás de
 *  «BELLAVISTA» y es EL distrito cuando va solo. */
const esRuidoDeGeocoder = (seg: string): boolean => {
  const n = normalizarParaEva(seg)
  return /^\d{4,6}$/.test(n)
    || ['LIMA', 'LIMA METROPOLITANA', 'PERU', 'CALLAO', 'PROVINCIA CONSTITUCIONAL DEL CALLAO',
        'PROV. CONST. DEL CALLAO', 'REGION LIMA', 'MUNICIPALIDAD METROPOLITANA DE LIMA'].includes(n)
}

/**
 * Parte la dirección del pedido en calle + distrito de Eva.
 *
 * `order_sessions.address` llega en DOS formas y hay que aguantar las dos:
 *   · del checkout: «Av. Larco 1234, Dpto 502, Miraflores» (la calle, y el
 *     distrito al final — `OrderService.addressOf`);
 *   · tras verificar por GPS: el `display_name` de Nominatim, «Av. Larco 1234,
 *     Miraflores, Lima, Lima Metropolitana, 15074, Perú».
 *
 * Se recorre DESDE EL PRINCIPIO y gana el primer segmento que es un distrito de
 * Eva. Desde el final no sirve: en la forma de Nominatim, «Lima» (la provincia)
 * traduce a CERCADO DE LIMA y se llevaría por delante a Miraflores. La calle es
 * lo que hay ANTES del distrito; si no hay nada antes, lo que hay después
 * menos el ruido del geocoder.
 */
export function partirDireccionLima(address: unknown): { calle: string; distrito: string } | null {
  const segs = String(address ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (segs.length === 0) return null
  const i = segs.findIndex(s => distritoEva(s) !== null)
  if (i < 0) return null
  const distrito = distritoEva(segs[i])!
  const antes = segs.slice(0, i)
  const despues = segs.slice(i + 1).filter(s => !esRuidoDeGeocoder(s))
  const calle = (antes.length ? antes : despues).join(', ').slice(0, 300)
  return { calle: calle || segs.join(', ').slice(0, 300), distrito }
}

// ─── El teléfono, el cobro, el producto ──────────────────────────────────────

/** Solo dígitos, sin el +51 que WhatsApp pega delante. `null` si no queda un
 *  número con el que llamar: Eva pide «idealmente 9 dígitos», y un motorizado
 *  sin teléfono es una entrega que no ocurre. */
export function telefonoEva(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('051')) d = d.slice(3)
  return d.length >= 6 && d.length <= 15 ? d : null
}

/**
 * Cómo cobra el motorizado en la puerta. Es UNA decisión y vive acá para que
 * cambiarla sea una línea:
 *
 *   · sin saldo (pagó todo por Flow) → `SOLO ENTREGAR`, monto 0;
 *   · con saldo (producto que permite la mitad, §56) → `EFECTIVO` por el saldo.
 *
 * `EFECTIVO` y no `TRANSFERENCIA / YAPE` porque el saldo que se paga por la app
 * ya no es saldo cuando el pedido sale (`saldoOf` lo descuenta); lo que queda
 * es lo que el comprador eligió pagar AL RECIBIR, y eso en la puerta es
 * efectivo. Eva lo recauda y lo liquida al cliente de su cuenta — quién es ese
 * cliente (Kross o la marca) es conversación comercial, no un campo.
 */
export const METODO_DE_COBRO_DEL_SALDO = 'EFECTIVO'
export function cobroEva(saldo: unknown): { payment_method: string; amount: number } {
  const s = Number(saldo)
  if (!(s > 0)) return { payment_method: 'SOLO ENTREGAR', amount: 0 }
  return { payment_method: METODO_DE_COBRO_DEL_SALDO, amount: Math.round(s * 100) / 100 }
}

/** La descripción que va en el rótulo y que lee el motorizado. Cliente RECOJO
 *  la exige. Máximo 300 (el manual). */
export function productoEva(
  items: { nombre?: string | null; qty?: number | null; pack_name?: string | null }[] | null | undefined,
  productName: string | null | undefined,
  packName: string | null | undefined,
): string {
  const lineas = (items ?? [])
    .map(it => {
      const nombre = String(it.nombre ?? '').trim()
      if (!nombre) return ''
      const qty = Number(it.qty) > 1 ? `${Number(it.qty)}× ` : ''
      const pack = String(it.pack_name ?? '').trim()
      return `${qty}${nombre}${pack ? ` · ${pack}` : ''}`
    })
    .filter(Boolean)
  const texto = lineas.length
    ? lineas.join('; ')
    : [productName, packName].map(v => String(v ?? '').trim()).filter(Boolean).join(' · ') || 'Pedido'
  return texto.slice(0, 300)
}

// ─── El pedido, como lo quiere Eva ───────────────────────────────────────────

export interface PedidoParaEva {
  orderId: string | null
  buyerName: string | null
  buyerPhone: string | null
  address: string | null
  referencia?: string | null
  lat?: number | null
  lng?: number | null
  verificada?: boolean | null
  /** Lo que falta pagar. 0 si pagó todo. */
  saldo: number
  items?: { nombre?: string | null; qty?: number | null; pack_name?: string | null }[] | null
  productName?: string | null
  packName?: string | null
  /** El nombre de la marca: va en `observations` para que el motorizado sepa
   *  de quién es el paquete cuando la cuenta de Eva es de la plataforma. */
  tienda?: string | null
}

/** El body de `POST /api/v1/orders/`, campo por campo del manual. */
export interface EvaOrderBody {
  code: string
  name: string
  phone: string
  district: string
  address: string
  reference?: string
  gps?: string
  payment_method: string
  amount: number
  service_type: 1 | 2
  product: string
  packages: number
  observations?: string
}

export type PedidoArmado =
  | { ok: true; body: EvaOrderBody }
  | { ok: false; faltan: string[] }

/**
 * Arma el pedido o dice QUÉ le falta, con nombre y apellido: es lo que se le
 * enseña al vendedor para que lo corrija («distrito sin cobertura de Eva»,
 * «teléfono inválido»), no un «faltan datos».
 */
export function armarPedidoEva(p: PedidoParaEva): PedidoArmado {
  const faltan: string[] = []
  const name = String(p.buyerName ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!name) faltan.push('el nombre del comprador')
  const phone = telefonoEva(p.buyerPhone)
  if (!phone) faltan.push('un teléfono válido del comprador')
  const dir = partirDireccionLima(p.address)
  if (!dir) {
    const crudo = String(p.address ?? '').trim()
    faltan.push(crudo
      ? `un distrito con cobertura de Eva (la dirección dice «${crudo.slice(0, 80)}»)`
      : 'la dirección de entrega')
  }
  if (faltan.length || !dir) return { ok: false, faltan }

  const cobro = cobroEva(p.saldo)
  const body: EvaOrderBody = {
    code: String(p.orderId ?? '').slice(0, 50),
    name,
    phone: phone!,
    district: dir.distrito,
    address: dir.calle,
    payment_method: cobro.payment_method,
    amount: cobro.amount,
    service_type: 1,
    product: productoEva(p.items, p.productName, p.packName),
    packages: 1,
  }
  const ref = String(p.referencia ?? '').replace(/\s+/g, ' ').trim()
  if (ref) body.reference = ref.slice(0, 300)
  if (p.verificada === true && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))) {
    body.gps = `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`
  }
  const tienda = String(p.tienda ?? '').replace(/\s+/g, ' ').trim()
  if (tienda) body.observations = `Tienda: ${tienda}`.slice(0, 400)
  return { ok: true, body }
}

// ─── Lo que contesta ─────────────────────────────────────────────────────────

export type RespuestaDeOrden =
  | { ok: true; trackingId: string; dispatchDate: string | null }
  | { ok: false; mensaje: string; reintentable: boolean }

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Un error de Eva (`{"district": ["…no encontrado…"]}`, `{"detail": "…"}`) en
 *  una línea legible. Sin secretos: el body nunca los trae. */
export function mensajeDeErrorEva(json: unknown, status: number): string {
  if (esObj(json)) {
    const partes = Object.entries(json).map(([k, v]) => {
      const texto = Array.isArray(v) ? v.map(String).join(' ') : String(v ?? '')
      return k === 'detail' ? texto : `${k}: ${texto}`
    }).filter(Boolean)
    // 600 y no 300: el primer rechazo real de Eva fue una LISTA de lo que
    // faltaba en la cuenta (contacto, dirección de recojo, billetera, cuenta
    // bancaria con CCI) y a 300 se cortaba antes de la cuenta bancaria. El
    // vendedor actúa sobre esa lista: tiene que verla entera en el chat.
    if (partes.length) return partes.join(' · ').slice(0, 600)
  }
  if (status === 401) return 'Eva rechazó la API Key (401)'
  if (status === 403) return 'La API Key no está habilitada o no está asociada a un cliente (403)'
  if (status === 404) return 'Eva no encuentra ese recurso (404)'
  if (status === 429) return 'Demasiadas peticiones a Eva (429)'
  if (status >= 500) return `Eva falló (${status})`
  return `Eva respondió ${status}`
}

/**
 * Lee la respuesta de `POST /api/v1/orders/`. `reintentable` dice si tiene
 * sentido volver a intentar SIN mirar antes en app.evacourier.pe: un 4xx es un
 * rechazo (el pedido NO se creó, corrige y reintenta); un 5xx o 429 NO se sabe,
 * y ahí manda la regla de arriba: mirar antes de reintentar.
 */
export function leerRespuestaDeOrden(json: unknown, status: number): RespuestaDeOrden {
  if (status === 201 || status === 200) {
    const id = esObj(json) ? String(json.tracking_id ?? '').trim() : ''
    if (id) {
      const dd = esObj(json) && typeof json.dispatch_date === 'string' ? json.dispatch_date : null
      return { ok: true, trackingId: id, dispatchDate: dd }
    }
    return { ok: false, mensaje: 'Eva contestó OK pero sin tracking_id', reintentable: false }
  }
  return { ok: false, mensaje: mensajeDeErrorEva(json, status), reintentable: status >= 500 || status === 429 }
}

// ─── Los estados y qué significan para nosotros ──────────────────────────────

/** Los del manual (§9), tal cual. */
export const ESTADOS_EVA = [
  'REGISTRADO', 'EN ALMACEN', 'ASIGNADO MOTORIZADO', 'EN RUTA', 'PUNTO VISITADO', 'INCIDENCIA',
  'REPROGRAMAR', 'AUSENTE', 'ENTREGADO', 'NO ENTREGADO', 'DEVUELTO', 'CANCELADO', 'RECOJO EN RUTA',
] as const
export type EstadoEva = typeof ESTADOS_EVA[number]

export const normalizarEstadoEva = (v: unknown): string => normalizarParaEva(v)

/**
 * La fase NUESTRA (`tracking_phase`) que refleja cada estado. Solo dos y a
 * propósito: en un domicilio el comprador tiene tres pasos —preparando, en
 * camino, entrega— y lo único que los mueve es que el motorizado SALIÓ y que
 * ENTREGÓ. «En almacén» o «asignado» siguen siendo «preparando» para él; al
 * vendedor se le enseña el estado crudo.
 *
 * `null` = no mueve la fase (pero puede mover otra cosa: demora, cierre).
 */
export function faseDeEva(estado: unknown): 'EN_TRANSITO' | 'ENTREGADO' | null {
  const e = normalizarEstadoEva(estado)
  if (e === 'EN RUTA') return 'EN_TRANSITO'
  if (e === 'ENTREGADO') return 'ENTREGADO'
  return null
}

/** El motorizado pasó y no entregó, o Eva lo reprogramó: es la DEMORA de un
 *  domicilio, y se le dice al comprador porque él es quien puede arreglarla
 *  (estar, corregir la dirección). */
export function esDemoraEva(estado: unknown): boolean {
  return ['PUNTO VISITADO', 'AUSENTE', 'REPROGRAMAR', 'INCIDENCIA'].includes(normalizarEstadoEva(estado))
}

/** El envío se cerró SIN entregar. No es una fase: la persona decide qué
 *  hacer con el pedido, y el pipeline no se mueve solo. */
export function esCierreSinEntregaEva(estado: unknown): boolean {
  return ['NO ENTREGADO', 'DEVUELTO', 'CANCELADO'].includes(normalizarEstadoEva(estado))
}

/** Cómo se lee cada estado en el panel. Eva lo escribe en mayúsculas de sistema. */
export function nombreDeEstadoEva(estado: unknown): string {
  const e = normalizarEstadoEva(estado)
  const nombres: Record<string, string> = {
    REGISTRADO: 'Registrado en Eva', 'EN ALMACEN': 'En almacén de Eva', 'ASIGNADO MOTORIZADO': 'Motorizado asignado',
    'EN RUTA': 'En ruta', 'PUNTO VISITADO': 'Pasó y no entregó', INCIDENCIA: 'Incidencia',
    REPROGRAMAR: 'Reprogramado', AUSENTE: 'Destinatario ausente', ENTREGADO: 'Entregado',
    'NO ENTREGADO': 'No entregado', DEVUELTO: 'Devuelto', CANCELADO: 'Cancelado', 'RECOJO EN RUTA': 'Recojo en ruta',
  }
  return nombres[e] ?? (e ? e.charAt(0) + e.slice(1).toLowerCase() : '—')
}

/**
 * Qué se le dice a cada lado en cada estado. El comprador solo oye lo que le
 * sirve; el equipo oye todo lo que Eva dijo (motivo y comentarios del
 * motorizado), porque es quien llama si hace falta.
 */
export function mensajesDeEva(
  estado: unknown,
  d: { motivo?: string | null; comentarios?: string | null; fotos?: string[] } = {},
): { comprador: string | null; equipo: string | null } {
  const e = normalizarEstadoEva(estado)
  const motivo = String(d.motivo ?? '').trim()
  const comentarios = String(d.comentarios ?? '').trim()
  const detalle = [motivo, comentarios].filter(Boolean).join(' · ')
  const foto = (d.fotos ?? [])[0]

  if (e === 'EN RUTA') return {
    comprador: '🛵 ¡Tu pedido va en camino! El motorizado de Eva te llama al llegar — ten tu celular a la mano.',
    equipo: `🛵 Eva: el motorizado salió con el pedido.${detalle ? ` ${detalle}` : ''}`,
  }
  if (e === 'ENTREGADO') return {
    comprador: '🎉 ¡Tu pedido fue entregado! Gracias por tu compra — cualquier cosa, por aquí seguimos.',
    equipo: `✅ Eva marca el pedido como ENTREGADO${detalle ? ` (${detalle})` : ''}. Confirmar la entrega en el pipeline para que cuente en la tasa.${foto ? ` Foto: ${foto}` : ''}`,
  }
  if (e === 'ASIGNADO MOTORIZADO') return {
    comprador: null,
    equipo: '🛵 Eva asignó motorizado: el pedido sale en el próximo despacho.',
  }
  if (e === 'EN ALMACEN') return { comprador: null, equipo: '📦 Eva ya tiene el paquete en su almacén.' }
  if (e === 'INCIDENCIA') return {
    comprador: null,
    equipo: `⚠️ Eva reporta INCIDENCIA${detalle ? `: ${detalle}` : ''}. Eva se comunica con el cliente; revisar el pedido.`,
  }
  if (esDemoraEva(e)) return {
    comprador: `📦 El motorizado pasó y no pudo entregar${motivo ? ` (${motivo.toLowerCase()})` : ''}. Eva lo reintenta pronto; si algo cambió en tu dirección o tu horario, escríbenos por aquí.`,
    equipo: `⚠️ Eva: ${nombreDeEstadoEva(e)}${detalle ? ` — ${detalle}` : ''}. Llamar al comprador si no responde por el chat.`,
  }
  if (esCierreSinEntregaEva(e)) return {
    comprador: null,
    equipo: `⛔ Eva cerró el envío: ${nombreDeEstadoEva(e)}${detalle ? ` — ${detalle}` : ''}. El paquete vuelve al local; decidir con el comprador y marcar el pedido.`,
  }
  return { comprador: null, equipo: null }
}

// ─── El webhook ──────────────────────────────────────────────────────────────

/** Las fotos llegan como lista o como CSV: el manual enseña las dos. */
export function fotosDeEva(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(Boolean)
  return String(v ?? '').split(',').map(s => s.trim()).filter(s => /^https?:\/\//.test(s))
}

export interface EventoEva {
  event: string
  trackingId: string | null
  estado: string | null
  motivo: string | null
  comentarios: string | null
  fotos: string[]
  gps: string | null
  fechahora: string | null
}

/** Lee el payload del webhook con búsqueda defensiva: lo que no está, es null. */
export function leerWebhookEva(json: unknown): EventoEva | null {
  if (!esObj(json)) return null
  const event = String(json.event ?? '').trim()
  if (!event) return null
  const data = esObj(json.data) ? json.data : {}
  const s = (k: string): string | null => {
    const v = data[k]
    const t = v == null ? '' : String(v).trim()
    return t ? t : null
  }
  return {
    event,
    trackingId: s('tracking_id'),
    estado: s('estado'),
    motivo: s('motivo'),
    comentarios: s('comentarios'),
    fotos: fotosDeEva(data.fotos),
    gps: s('coordenada_gps'),
    fechahora: s('fechahora'),
  }
}

/**
 * `X-EVA-Signature` = HMAC-SHA256(secret, body crudo) en hex minúsculas. Se
 * calcula sobre los BYTES tal como llegaron —no sobre el JSON re-serializado,
 * que cambia el hash con un espacio— y se compara en tiempo constante.
 * Web Crypto, que existe igual en Deno y en Node (por eso se prueba).
 */
export async function firmaEvaValida(raw: string, header: string | null | undefined, secret: string): Promise<boolean> {
  const recibida = String(header ?? '').trim().toLowerCase()
  if (!recibida || !secret) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const esperada = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  if (esperada.length !== recibida.length) return false
  let diff = 0
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i)
  return diff === 0
}

/** Para los tests y para firmar de prueba: la firma que Eva mandaría. */
export async function firmarComoEva(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── El rótulo ───────────────────────────────────────────────────────────────

/** `A4` por defecto: la marca imprime en la impresora de la oficina. Quien
 *  tenga ticketera cambia esto a `sticker`. Una constante y no un campo por
 *  marca hasta que haga falta. */
export const FORMATO_DE_ROTULO = 'A4' as const

export const cuerpoDeRotulos = (ids: string[], format: 'A4' | 'sticker' = FORMATO_DE_ROTULO) =>
  ({ ids: ids.slice(0, 50), format })

/** ¿Lo que volvió es un PDF? Por content-type O por la firma `%PDF-`: el
 *  manual avisa que un error viene como JSON con `detail`. */
export function esPdf(contentType: string | null | undefined, bytes: Uint8Array): boolean {
  if (String(contentType ?? '').toLowerCase().includes('application/pdf')) return true
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

/** Cómo se nombra el courier donde se nombre. */
export const NOMBRE_EVA = 'Eva Courier'
