// ─── Olva LAT · armar el envío que REGISTRA la guía (puro, sin Deno) ─────────
// El gemelo de `shalom-orders.ts` para el segundo riel de Olva. Mismas dos
// razones para que sea puro: es la única pieza cuya forma la manda un tercero
// —cuando cambie un nombre de campo se toca ESTE archivo y nada más— y emitir
// una guía cuesta plata, así que el payload se valida gratis en `npm test`.
//
// ✅ Contrato leído de la doc de Olva LAT (`POST /account/register`). Lo que
// conviene tener presente, porque NO se comporta como Shalom:
//
//   · **El REMITENTE sí va en el body.** En Shalom lo pone la cuenta
//     autenticada (las credenciales Shalom Pro de la marca); acá los endpoints
//     de «cuenta» corren sobre el OAuth2 GLOBAL del proveedor, así que el
//     `sender` es un dato que Kross tiene que mandar. Consecuencia práctica y
//     no menor: la guía nace en la cuenta Olva del proveedor, no en una cuenta
//     de la marca — y quién factura el flete es una conversación comercial, no
//     un campo. Por eso el interruptor por marca arranca APAGADO.
//   · **`agencyCode` no es nuestro id de sede.** Olva LAT identifica agencias
//     con un código propio (`LIM-MIR-01`); `src/data/agencies/olva.json` guarda
//     el id interno del buscador de Olva ("579"). Son llaves distintas del mismo
//     mundo: el código se resuelve al emitir contra `GET /agencies`
//     (`resolveAgencyCode`), igual que Shalom resuelve su `product_id` contra
//     `GET /v1/products` porque los ids son por cuenta.
//   · **No hay `pickup_code`.** La clave de retiro la elige Shalom porque su API
//     la acepta; acá no existe el campo. El pedido queda sin clave automática y
//     el chat se comporta como con una guía Olva registrada a mano.
//   · **No hay endpoint para LISTAR envíos.** Ver `esReconciliable` abajo: es la
//     diferencia que más pesa en el diseño de la Edge Function.

/** Servicios que acepta el proveedor. `REGULAR` es el único de la doc. */
export const LAT_SERVICES = ['REGULAR', 'EXPRESS'] as const
export type LatService = typeof LAT_SERVICES[number]

export const isLatService = (v: unknown): v is LatService =>
  typeof v === 'string' && (LAT_SERVICES as readonly string[]).includes(v)

/**
 * ⚠️ Olva LAT **no documenta un `GET` de envíos registrados**, y tampoco una
 * clave de idempotencia. O sea: si `POST /account/register` no responde, no hay
 * forma de preguntar "¿se creó?".
 *
 * Shalom sí la tiene (`GET /v1/orders`) y `shalom-order` la usa como su tercera
 * defensa: reconciliar antes que reintentar. Acá esa defensa **no existe**, así
 * que la Edge Function no puede reintentar NI siquiera un 5xx: un timeout se
 * cierra en FAILED y la verificación la hace una persona en el panel de Olva
 * antes de emitir otra. Es peor servicio y es a propósito — pagar dos veces el
 * mismo flete, o mandar dos paquetes, cuesta más que una guía hecha a mano.
 *
 * Es una constante y no un comentario para que el día que el proveedor publique
 * ese endpoint, el cambio tenga un sitio evidente donde entrar.
 */
export const esReconciliable = false

const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()

const limpio = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const digitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

// ─── Resolver el código de agencia ───────────────────────────────────────────

/** Una agencia tal como la lista `GET /agencies`. */
export interface LatAgency {
  code: string
  name: string
  department: string
  province: string
  district: string
}

/** La sede como la conoce el pedido: el rótulo que guardó el checkout. */
export interface SedeBuscada {
  name?: string | null
  district?: string | null
  province?: string | null
  department?: string | null
}

export function parseLatAgencies(json: unknown): LatAgency[] {
  const lista = Array.isArray(json)
    ? json
    : (json as { agencies?: unknown; data?: unknown })?.agencies
      ?? (json as { data?: unknown })?.data
  if (!Array.isArray(lista)) return []
  const out: LatAgency[] = []
  for (const a of lista) {
    const it = a as Record<string, unknown>
    const code = limpio(it?.code)
    if (!code) continue
    out.push({
      code,
      name: limpio(it?.name),
      department: limpio(it?.department),
      province: limpio(it?.province),
      district: limpio(it?.district),
    })
  }
  return out
}

/**
 * Del rótulo de la sede al `agencyCode` del proveedor.
 *
 * Se exige que el DISTRITO calce —es lo que de verdad ubica una agencia— y
 * entre las de ese distrito gana la de nombre más parecido. Si hay una sola en
 * el distrito, esa es: pedirle además que el nombre calce dejaría sin guía a un
 * pedido cuyo destino no tiene ninguna ambigüedad.
 *
 * Devuelve `null` en cuanto hay DUDA (varias candidatas y ningún nombre que las
 * separe): mandar un paquete a la agencia equivocada de la ciudad correcta es un
 * pedido perdido con tracking normal, que es la peor forma de perderlo.
 */
export function resolveAgencyCode(agencies: LatAgency[], sede: SedeBuscada): string | null {
  const distrito = norm(sede.district)
  if (!distrito) return null
  const provincia = norm(sede.province)
  const departamento = norm(sede.department)

  let candidatas = agencies.filter(a => norm(a.district) === distrito)
  // El mismo nombre de distrito se repite en el país (hay un Miraflores en Lima
  // y otro en Arequipa): se desambigua con lo que venga, sin exigirlo.
  if (provincia && candidatas.some(a => norm(a.province) === provincia)) {
    candidatas = candidatas.filter(a => norm(a.province) === provincia)
  }
  if (departamento && candidatas.some(a => norm(a.department) === departamento)) {
    candidatas = candidatas.filter(a => norm(a.department) === departamento)
  }
  if (candidatas.length === 0) return null
  if (candidatas.length === 1) return candidatas[0].code

  const nombre = norm(sede.name)
  if (!nombre) return null
  const exacta = candidatas.filter(a => norm(a.name) === nombre)
  if (exacta.length === 1) return exacta[0].code
  // Contención: el rótulo del checkout suele traer más texto que el nombre del
  // proveedor ("TIENDA MIRAFLORES - AV. LARCO 345" vs "MIRAFLORES").
  const contiene = candidatas.filter(a => {
    const n = norm(a.name)
    return n.length >= 4 && (nombre.includes(n) || n.includes(nombre))
  })
  return contiene.length === 1 ? contiene[0].code : null
}

// ─── El envío ────────────────────────────────────────────────────────────────

export interface LatParty {
  name: string
  document: string
  phone: string
}

export interface LatShipmentRequest {
  /** La marca, que es quien despacha y quien paga el flete. */
  sender: Partial<LatParty>
  /** El comprador. */
  recipient: Partial<LatParty>
  originAgencyCode: string | null
  destinationAgencyCode: string | null
  weightKg: number | null
  description: string | null
  service?: string | null
}

export type LatBuildResult =
  | { ok: true; body: Record<string, unknown> }
  /** `faltan` se le enseña a Logística tal cual: es la lista de cosas por
   *  completar para que el próximo pedido salga solo. */
  | { ok: false; faltan: string[] }

/** Un DNI (8) o un RUC (11): la marca despacha con RUC casi siempre. */
const documentoOk = (d: string): boolean => /^\d{8}$/.test(d) || /^\d{11}$/.test(d)

/**
 * Valida y arma. Devuelve TODO lo que falta de una vez —no el primer error—
 * porque quien lo lee está por completar un formulario.
 */
export function buildLatShipment(r: LatShipmentRequest): LatBuildResult {
  const faltan: string[] = []

  const armaParte = (p: Partial<LatParty> | undefined, quien: string): LatParty | null => {
    const name = limpio(p?.name).toUpperCase()
    const document = digitos(p?.document)
    const phone = digitos(p?.phone).slice(-9)
    if (!name) faltan.push(`nombre del ${quien}`)
    if (!documentoOk(document)) faltan.push(`documento del ${quien} (DNI 8 o RUC 11 dígitos)`)
    if (!/^9\d{8}$/.test(phone)) faltan.push(`celular del ${quien} (9 dígitos)`)
    return name && documentoOk(document) && /^9\d{8}$/.test(phone) ? { name, document, phone } : null
  }

  const sender = armaParte(r.sender, 'remitente (la marca)')
  const recipient = armaParte(r.recipient, 'destinatario')

  const origen = limpio(r.originAgencyCode)
  const destino = limpio(r.destinationAgencyCode)
  if (!origen) faltan.push('agencia Olva de origen del producto')
  if (!destino) faltan.push('sede de recojo del pedido en el catálogo de Olva')

  // El peso decide la tarifa: un envío sin peso no es un envío barato, es un
  // envío que el mostrador vuelve a pesar y a cobrar.
  const peso = Number(r.weightKg)
  if (!Number.isFinite(peso) || peso <= 0 || peso > 100) faltan.push('peso del paquete (kg)')

  const descripcion = limpio(r.description)
  if (!descripcion) faltan.push('contenido declarado del producto')

  const service = isLatService(r.service) ? r.service : 'REGULAR'

  if (faltan.length || !sender || !recipient) return { ok: false, faltan }

  return {
    ok: true,
    body: {
      sender: { name: sender.name, document: sender.document, phone: sender.phone },
      recipient: { name: recipient.name, document: recipient.document, phone: recipient.phone },
      origin: { agencyCode: origen },
      destination: { agencyCode: destino },
      package: { weightKg: Math.round(peso * 100) / 100, description: descripcion },
      service,
    },
  }
}

// ─── La respuesta ────────────────────────────────────────────────────────────

export interface LatShipmentResult {
  /** El número de guía con el que se rastrea (6–15 dígitos, típicamente 8). */
  numero: string | null
  /** El id del envío dentro del proveedor, si lo devuelve. Informativo. */
  orderId: string | null
  /** El documento de la guía, si la respuesta trae una URL. */
  pdfUrl: string | null
}

export const GUIA_OLVA = /^\d{6,15}$/

/**
 * La doc **no publica la forma de la respuesta** de `POST /account/register`.
 * Por eso se busca a cualquier profundidad en vez de asumir la raíz: la
 * alternativa es una guía emitida —cobrada— que el pedido no registra y nadie
 * puede rastrear. Lo que no tiene forma de guía se descarta; escribir basura en
 * `tracking_numero` es peor que no escribir nada.
 */
export function parseLatShipment(json: unknown): LatShipmentResult {
  const found = new Map<string, string>()
  const urls: { key: string; val: string }[] = []

  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '')
      if (typeof raw === 'string' || typeof raw === 'number') {
        const val = String(raw).trim()
        if (val && !found.has(key)) found.set(key, val)
        if (/^https?:\/\//i.test(val)) urls.push({ key, val })
      } else visit(raw, depth + 1)
    }
  }
  visit(json, 0)

  const first = (keys: string[], test?: RegExp): string | null => {
    for (const k of keys) {
      const v = found.get(k)
      if (v && (!test || test.test(v))) return v
    }
    return null
  }

  return {
    numero: first(['trackingnumber', 'ordernumber', 'guia', 'numero', 'nroguia', 'tracking'], GUIA_OLVA),
    orderId: first(['orderid', 'shipmentid', 'id']),
    pdfUrl: urls.find(u => /\.pdf([?#]|$)/i.test(u.val))?.val
      ?? urls.find(u => /(pdf|rotulo|etiqueta|label|guia|comprobante)/.test(u.key))?.val
      ?? null,
  }
}

/** Una guía sirve si se puede RASTREAR. En Olva eso es el número, a secas. */
export const esRastreable = (g: LatShipmentResult): boolean => !!g.numero
