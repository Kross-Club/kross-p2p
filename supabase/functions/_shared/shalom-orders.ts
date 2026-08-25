// ─── Shalom · armar el pedido que EMITE la guía ──────────────────────────────
// El pendiente #3 (generador de envíos). Este módulo es a propósito PURO —sin
// Deno, sin red, sin base— por dos razones:
//
//  1. Es la única pieza cuya forma la manda un tercero. Cuando el proveedor
//     cambie un nombre de campo, se toca ESTE archivo y nada más: la función
//     que orquesta, el candado de idempotencia y los avisos no se enteran.
//  2. Se puede probar sin llamar a nadie. Emitir una guía cuesta plata y no
//     tiene sandbox; el payload, en cambio, se valida gratis en `npm test`.
//
// ✅ Contrato VERIFICADO contra la doc de Shalom API Perú (POST /v1/orders).
// Lo que conviene tener presente al leer esto:
//   · El REMITENTE no va en el body: Shalom lo toma de la cuenta autenticada
//     (las credenciales Shalom Pro de la marca). Un `sender` suelto se ignora.
//   · `origin_terminal_id` / `destiny_terminal_id` son ids de agencia
//     (`GET /v1/agencies`) — el MISMO `ter_id` que ya guarda
//     `src/data/agencies/shalom.json` (su fuente es el CSV de sedes de Shalom,
//     cuya primera columna es literalmente `ter_id`).
//   · `product_id` NO es un tamaño en texto: es el id del producto dentro de la
//     cuenta del cliente (Sobre · Caja Paquete XXS…L · Otra Medida) y cambia de
//     cuenta en cuenta. Por eso se guarda el TAMAÑO y se resuelve el id contra
//     `GET /v1/products` al emitir.
//   · `declaracion_jurada` es obligatorio y Shalom lo imprime en la guía.
//   · `pickup_code` lo elegimos nosotros: es la clave con la que el comprador
//     retira en agencia. Ojo con dónde termina — ver `nuevoPickupCode`.

// ─── Tamaño del paquete ──────────────────────────────────────────────────────
// El catálogo real de la cuenta Shalom Pro. No es una escala inventada: son los
// productos que la API lista, y el precio del envío sale de cuál se elige.
export const SHALOM_SIZES = ['SOBRE', 'XXS', 'XS', 'S', 'M', 'L', 'OTRA_MEDIDA'] as const
export type ShalomSize = typeof SHALOM_SIZES[number]

export const isShalomSize = (v: unknown): v is ShalomSize =>
  typeof v === 'string' && (SHALOM_SIZES as readonly string[]).includes(v)

/** Cómo se llama cada tamaño en el catálogo del proveedor. Es la llave del
 *  match: los ids son por cuenta, los títulos son del catálogo. */
export const SIZE_TITLES: Record<ShalomSize, string> = {
  SOBRE: 'Sobre',
  XXS: 'Caja Paquete XXS',
  XS: 'Caja Paquete XS',
  S: 'Caja Paquete S',
  M: 'Caja Paquete M',
  L: 'Caja Paquete L',
  OTRA_MEDIDA: 'Otra Medida',
}

/** Etiqueta para la gente, con el límite que hace elegir bien. */
export const SIZE_HINTS: Record<ShalomSize, string> = {
  SOBRE: 'Sobre · hasta 0.5 kg',
  XXS: 'Caja XXS · lo más chico',
  XS: 'Caja XS',
  S: 'Caja S',
  M: 'Caja M',
  L: 'Caja L · lo más grande del catálogo',
  OTRA_MEDIDA: 'Otra medida · fuera de catálogo',
}

const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Resuelve el `product_id` de ESTA cuenta a partir del tamaño configurado en el
 * producto, contra la respuesta de `GET /v1/products`. Se hace por título y no
 * por posición porque los ids son por cuenta (en la doc, "Sobre" es 3 y "Otra
 * Medida" 1098) y el orden del catálogo no está garantizado.
 */
export function resolveProductId(products: unknown, size: ShalomSize): number | null {
  const lista = (products as { products?: unknown })?.products
  if (!Array.isArray(lista)) return null
  const buscado = norm(SIZE_TITLES[size])
  for (const p of lista) {
    const item = p as { id?: unknown; title?: unknown }
    if (norm(item?.title) === buscado && Number.isFinite(Number(item?.id))) return Number(item.id)
  }
  return null
}

// ─── Declaración jurada ──────────────────────────────────────────────────────
// Obligatoria en toda orden y sale impresa en la guía. Son los cuatro alias
// cortos que acepta la API; el texto largo lo pone Shalom.
export const DECLARED_CONTENTS = ['docs', 'ropa', 'art', 'electro'] as const
export type DeclaredContent = typeof DECLARED_CONTENTS[number]

export const isDeclaredContent = (v: unknown): v is DeclaredContent =>
  typeof v === 'string' && (DECLARED_CONTENTS as readonly string[]).includes(v)

export const CONTENT_LABELS: Record<DeclaredContent, string> = {
  docs: 'Documentos',
  ropa: 'Ropa',
  art: 'Artículos de uso personal',
  electro: 'Electrodomésticos',
}

// ─── Clave de retiro ─────────────────────────────────────────────────────────

/**
 * ⚠️ La clave con la que el destinatario RETIRA el paquete en la agencia. Quien
 * la tiene se lleva el pedido, así que **no puede viajar al chat**: en Kross la
 * clave se entrega recién contra el saldo pagado (02 §El saldo de agencia), y
 * `get-session?viewer=seller` es alcanzable con el token del comprador — un
 * mensaje "solo vendedores" con la clave adentro se la estaría regalando.
 *
 * Shalom rechaza las repetidas (1111…9999) y las consecutivas (1234…6789). Se
 * descartan también las consecutivas descendentes: no están en la doc, cuestan
 * 8 códigos de 9000 y una guía rechazada cuesta mucho más que eso.
 */
export function esPickupCodeValido(code: string): boolean {
  if (!/^\d{4}$/.test(code)) return false
  const d = [...code].map(Number)
  if (d.every(n => n === d[0])) return false
  if (d.every((n, i) => i === 0 || n === d[i - 1] + 1)) return false
  if (d.every((n, i) => i === 0 || n === d[i - 1] - 1)) return false
  return true
}

/** Genera una clave válida. `rnd` entra por parámetro para poder probarlo. */
export function nuevoPickupCode(rnd: () => number = Math.random): string {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(rnd() * 10000)).padStart(4, '0')
    if (esPickupCodeValido(code)) return code
  }
  return '2415' // Inalcanzable en la práctica; válido y determinista por si acaso.
}

// ─── El pedido ───────────────────────────────────────────────────────────────

export interface GuideReceiver {
  /** `person_id` de Shalom Pro, si ya lo conocemos (`GET /v1/persons/search`).
   *  Con él no hacen falta los nombres — y evita el 409 por documento repetido. */
  id?: number | null
  dni: string
  /** Nombres y apellidos. Obligatorios SOLO si la persona aún no existe en la
   *  cuenta; con `id` sobran. Vienen de RENIEC, no de partir un nombre en dos:
   *  registrar mal a alguien en la cuenta del cliente no se deshace. */
  name?: string | null
  lastName?: string | null
  surName?: string | null
  phone: string
}

export interface GuideRequest {
  /** Ids de agencia (`ter_id`): de dónde sale y dónde recoge el comprador. */
  originTerminalId: string | number
  destinyTerminalId: string | number
  /** Id del producto EN ESTA CUENTA, ya resuelto con `resolveProductId`. */
  productId: number | null
  receiver: GuideReceiver
  declaredContent: string | null | undefined
  pickupCode: string
}

export type BuildResult =
  | { ok: true; body: Record<string, unknown> }
  /** `faltan` se le muestra a Logística tal cual: son las cosas que hay que
   *  completar para que el pedido pueda generar su guía. */
  | { ok: false; faltan: string[] }

const entero = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : null
}
const limpio = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const digitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

/**
 * Valida y arma. Devuelve TODO lo que falta de una sola vez —no el primer
 * error— porque quien lo lee está por completar un formulario: decirle un
 * campo por intento convierte una corrección en cuatro.
 */
export function buildOrderPayload(r: GuideRequest): BuildResult {
  const faltan: string[] = []

  const origen = entero(r.originTerminalId)
  const destino = entero(r.destinyTerminalId)
  const productId = entero(r.productId)
  const dni = digitos(r.receiver?.dni)
  const telefono = digitos(r.receiver?.phone).slice(-9)
  const personId = entero(r.receiver?.id)
  const name = limpio(r.receiver?.name).toUpperCase()
  const lastName = limpio(r.receiver?.lastName).toUpperCase()
  const surName = limpio(r.receiver?.surName).toUpperCase()

  if (!origen) faltan.push('agencia de origen del producto')
  if (!destino) faltan.push('sede de recojo del pedido')
  if (!productId) faltan.push('tamaño del paquete en el producto')
  if (!isDeclaredContent(r.declaredContent)) faltan.push('contenido declarado del producto')
  if (!/^\d{8}$/.test(dni)) faltan.push('DNI del destinatario (8 dígitos)')
  if (!/^9\d{8}$/.test(telefono)) faltan.push('celular del destinatario (9 dígitos)')
  if (!esPickupCodeValido(r.pickupCode)) faltan.push('clave de retiro válida')
  // Sin person_id, Shalom REGISTRA a la persona con lo que le mandemos: los tres
  // campos tienen que venir de RENIEC o no se manda nada.
  if (!personId && !(name && lastName && surName)) {
    faltan.push('nombre y apellidos del destinatario (RENIEC)')
  }

  if (faltan.length) return { ok: false, faltan }

  const receiver: Record<string, unknown> = {
    document_type: 'DNI',
    document: dni,
    phone: Number(telefono),
  }
  if (personId) receiver.id = personId
  else Object.assign(receiver, { name, last_name: lastName, sur_name: surName })

  return {
    ok: true,
    body: {
      origin_terminal_id: origen,
      destiny_terminal_id: destino,
      product_id: productId,
      quantity: 1,
      // Paga el remitente (la marca) al despachar. NUNCA "receiver": el saldo se
      // cobra por la app, no en el mostrador (02 §El saldo de agencia), y una
      // guía contra entrega pondría a Shalom a cobrar lo que ya cobramos.
      payer: 'sender',
      declaracion_jurada: r.declaredContent,
      receiver,
      pickup_code: r.pickupCode,
      // Suscribe la guía al webhook en la misma llamada (best-effort del lado
      // del proveedor): una llamada menos y el tracking arranca al instante.
      track: true,
    },
  }
}

// ─── La respuesta ────────────────────────────────────────────────────────────

/** La guía tal como quedó, ya validada. */
export interface GuideResult {
  numero: string | null
  codigo: string | null
  oseId: string | null
  /** Prefijo del talonario. Informativo: Shalom no lo pide para rastrear. */
  serie: string | null
}

/** Las mismas reglas con las que el tracking valida una guía real. */
export const GUIA_NUMERO = /^\d{8,10}$/
export const GUIA_CODIGO = /^[A-Z0-9]{4}$/

/**
 * Lee `{ guia, serie, codigo, ose_id }`. Busca esas llaves a cualquier
 * profundidad en vez de asumir que vienen en la raíz: si el proveedor anida la
 * respuesta un nivel, la alternativa es una guía emitida —cobrada— que el
 * pedido no registra y nadie puede rastrear. Lo que NO se tolera es escribir
 * basura: lo que no tiene forma de guía se descarta.
 */
export function parseOrderResponse(json: unknown): GuideResult {
  const found = new Map<string, string>()

  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '')
      if (typeof raw === 'string' || typeof raw === 'number') {
        const val = String(raw).trim()
        if (val && !found.has(key)) found.set(key, val)
      } else visit(raw, depth + 1)
    }
  }
  visit(json, 0)

  const first = (keys: string[], test?: RegExp): string | null => {
    for (const k of keys) {
      const v = found.get(k)
      if (v && (!test || test.test(v.toUpperCase()))) return v
    }
    return null
  }

  const codigo = first(['codigo', 'clave', 'codigoguia'], GUIA_CODIGO)
  return {
    numero: first(['guia', 'numero', 'numeroguia', 'nroguia'], GUIA_NUMERO),
    codigo: codigo ? codigo.toUpperCase() : null,
    oseId: first(['oseid', 'ose'], /^\d+$/),
    serie: first(['serie']),
  }
}

/** Una guía sirve si se puede RASTREAR: numero+codigo juntos, o el ose_id.
 *  Es la misma regla que exige `set_tracking`, escrita una sola vez. */
export const esRastreable = (g: GuideResult): boolean =>
  !!((g.numero && g.codigo) || g.oseId)

/**
 * Busca en `GET /v1/orders` una guía ya emitida para este DNI. Es la respuesta
 * a la advertencia más seria de la doc: un timeout NO significa que la orden no
 * se creó, y la API no tiene clave de idempotencia. Antes de dar por perdido un
 * envío —o peor, de emitir otro— se pregunta si ya está ahí.
 */
export function buscarOrdenPorDni(json: unknown, dni: string): (GuideResult & { orderId: string | null }) | null {
  const lista = (json as { orders?: unknown })?.orders
  if (!Array.isArray(lista)) return null
  const buscado = digitos(dni)
  for (const o of lista) {
    const orden = o as Record<string, unknown>
    const receiver = orden?.receiver as Record<string, unknown> | undefined
    if (digitos(receiver?.document) !== buscado) continue
    const g = parseOrderResponse(orden)
    if (esRastreable(g)) {
      const id = orden?.id
      return { ...g, orderId: id == null ? null : String(id) }
    }
  }
  return null
}
