// ─── Olva LAT · armar el envío que REGISTRA la guía (puro, sin Deno) ─────────
// El gemelo de `shalom-orders.ts` para el riel de Olva. Mismas dos razones para
// que sea puro: es la única pieza cuya forma la manda un tercero —cuando cambie
// un nombre de campo se toca ESTE archivo y nada más— y emitir una guía cuesta
// plata, así que el payload se valida gratis en `npm test`.
//
// ✅ Contrato leído de la doc de Olva LAT, versión `POST /shipments`
// (16-set-2026; reemplaza al `POST /account/register` de la primera doc). Lo
// que conviene tener presente, porque NO se comporta como Shalom:
//
//   · **Una sola llamada.** La API orquesta el flujo entero de Olva
//     (remitente → origen → pago → ítem → tarifa → confirmación → rótulo) y
//     devuelve el costo, el `registrationNumber` y el rótulo en PDF (base64).
//   · **La guía NO nace con el registro.** `registrationNumber` es el número
//     con el que Olva registra el envío (sirve para reclamar y para el rótulo);
//     el número de GUÍA lo asigna Olva cuando ADMITE el paquete en la sede, y
//     recién ahí se puede rastrear. Por eso el registro deja el pedido en
//     CREATED sin `tracking_numero`, y el barrido (`olva-tracking-sync`) le
//     pregunta por `GET /shipments/:id` hasta que aparezca (`leerDetalleLat`).
//   · **Hay `Idempotency-Key`.** Un reintento con la misma clave no crea una
//     guía duplicada. Es lo que antes no existía y lo que permite reintentar
//     un timeout: la clave se deriva del pedido Y del payload
//     (`claveDeIdempotencia`), así el mismo envío repetido no duplica y un
//     envío corregido no se choca con la respuesta vieja.
//   · **Sigue sin haber cómo buscar por NUESTRO código.** `GET /shipments`
//     lista lo que registró la cuenta, pero su `q` busca por `trackingNumber`
//     (nulo hasta la admisión) y el body no lleva referencia nuestra. La
//     defensa contra el duplicado es la clave de idempotencia, no la lista.
//   · **El remitente se valida contra Olva por su documento.** Nombres y
//     celular salen del lookup de Olva; solo se mandan si la marca los
//     configuró (sobrescriben).
//   · **La clave de recojo SÍ existe** (`pin`, 4 dígitos): la mandamos
//     nosotros, como el `pickup_code` de Shalom, y Olva la devuelve en
//     `securityPin`. Se guarda en `shalom_pickup_code` —el nombre es histórico;
//     es LA clave de recojo del pedido, del courier que sea— y el chat la
//     suelta cuando el saldo se paga, igual que siempre.
//   · **`origin.headquarterId` no es una agencia.** Es la SEDE de origen del
//     catálogo `/catalog/headquarters` (un id como `43`), distinta del
//     `agencyCode` de destino (`/agencies`). Se guarda en
//     `products.olva_origin_agency_code` (nombre histórico de la columna).

/**
 * ⚠️ Olva LAT **no permite buscar un envío por nuestro código**: `GET /shipments`
 * existe, pero filtra por `trackingNumber` (nulo hasta que Olva admite el
 * paquete) y el body del registro no lleva ninguna referencia nuestra. O sea:
 * si `POST /shipments` no responde, no hay forma de preguntar "¿se creó?".
 *
 * Lo que SÍ hay desde la doc de set-2026 es `Idempotency-Key`: reintentar con la
 * misma clave devuelve el mismo envío en vez de crear otro. Es la defensa que
 * `olva-order` usa para reintentar un timeout o un 5xx (`esIdempotente`).
 *
 * Son dos constantes y no un comentario para que el día que el proveedor
 * publique una búsqueda por referencia, el cambio tenga un sitio evidente.
 */
export const esReconciliable = false
export const esIdempotente = true

/** Quién paga el flete, según la doc: `ONLINE` (tarjeta/CIP en el checkout de
 *  Olva — deja el envío en PENDING_PAYMENT, inservible para registrar solo),
 *  `DESTINATION` (lo paga el comprador al recoger) o `STORE` (lo paga la marca
 *  en la sede de origen). Kross cobra el pedido completo antes de despachar, así
 *  que el default es la marca. */
export const WHO_PAYS = ['STORE', 'DESTINATION'] as const
export type WhoPays = typeof WHO_PAYS[number]
export const isWhoPays = (v: unknown): v is WhoPays =>
  typeof v === 'string' && (WHO_PAYS as readonly string[]).includes(v)

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

export interface LatShipmentRequest {
  /** La marca, que despacha y paga el flete. Solo el documento es obligatorio:
   *  Olva completa nombres y celular con su lookup, y lo demás sobrescribe. */
  sender: { document?: string | null; phone?: string | null; email?: string | null }
  /** El comprador. */
  recipient: { name?: string | null; document?: string | null; phone?: string | null; email?: string | null }
  /** La SEDE de origen (`/catalog/headquarters`), no una agencia. */
  originHeadquarterId: string | null
  /** El código de agencia de destino (`/agencies`). */
  destinationAgencyCode: string | null
  weightKg: number | null
  description: string | null
  /** Valor declarado en soles: el precio del pedido. Opcional para Olva. */
  declaredValue?: number | null
  /** `LxAxH` en cm, si el producto lo tiene. Con dimensiones el envío va como
   *  PAQUETE (`shipmentType: 2`); sin ellas no se declara tipo y Olva aplica su
   *  default —un `2` sin dimensiones es un 422 seguro. */
  dimsCm?: string | null
  whoPays?: string | null
  /** La clave de recojo, 4 dígitos. La elegimos nosotros (`nuevoPickupCode`). */
  pin: string
}

export type LatBuildResult =
  | { ok: true; body: Record<string, unknown> }
  /** `faltan` se le enseña a Logística tal cual: es la lista de cosas por
   *  completar para que el próximo pedido salga solo. */
  | { ok: false; faltan: string[] }

/** Un DNI (8) o un RUC (11): la marca despacha con RUC casi siempre. */
const documentoOk = (d: string): boolean => /^\d{8}$/.test(d) || /^\d{11}$/.test(d)
const tipoDeDocumento = (d: string): 'dni' | 'ruc' => (d.length === 11 ? 'ruc' : 'dni')
const emailOk = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/** `20x15x10` → tres lados en cm, o `null` si no tiene esa forma. Acepta
 *  `×`, `*` y espacios; no acepta un lado en cero ni uno de dos metros. */
export function parseDimsCm(v: unknown): { lengthCm: number; widthCm: number; heightCm: number } | null {
  const partes = String(v ?? '').toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, '').split('x')
  if (partes.length !== 3) return null
  const n = partes.map(Number)
  if (n.some(x => !Number.isFinite(x) || x <= 0 || x > 200)) return null
  const [lengthCm, widthCm, heightCm] = n.map(x => Math.round(x * 10) / 10)
  return { lengthCm, widthCm, heightCm }
}

/** Las dimensiones normalizadas como texto (`20x15x10`), para guardar. */
export const dimsCmTexto = (v: unknown): string | null => {
  const d = parseDimsCm(v)
  return d ? `${d.lengthCm}x${d.widthCm}x${d.heightCm}` : null
}

/**
 * Valida y arma. Devuelve TODO lo que falta de una vez —no el primer error—
 * porque quien lo lee está por completar un formulario.
 */
export function buildLatShipment(r: LatShipmentRequest): LatBuildResult {
  const faltan: string[] = []

  const docRemitente = digitos(r.sender?.document)
  if (!documentoOk(docRemitente)) faltan.push('documento del remitente (la marca): DNI 8 o RUC 11 dígitos')
  const telRemitente = digitos(r.sender?.phone).slice(-9)
  const emailRemitente = limpio(r.sender?.email).toLowerCase()

  const nombre = limpio(r.recipient?.name).toUpperCase()
  const docDestinatario = digitos(r.recipient?.document)
  const telDestinatario = digitos(r.recipient?.phone).slice(-9)
  const emailDestinatario = limpio(r.recipient?.email).toLowerCase()
  if (!nombre) faltan.push('nombre del destinatario')
  if (!documentoOk(docDestinatario)) faltan.push('documento del destinatario (DNI 8 o RUC 11 dígitos)')
  if (!/^9\d{8}$/.test(telDestinatario)) faltan.push('celular del destinatario (9 dígitos)')

  const origen = limpio(r.originHeadquarterId)
  const destino = limpio(r.destinationAgencyCode)
  if (!origen) faltan.push('sede Olva de origen del producto')
  if (!destino) faltan.push('sede de recojo del pedido en el catálogo de Olva')

  // El peso decide la tarifa: un envío sin peso no es un envío barato, es un
  // envío que el mostrador vuelve a pesar y a cobrar.
  const peso = Number(r.weightKg)
  if (!Number.isFinite(peso) || peso <= 0 || peso > 100) faltan.push('peso del paquete (kg)')

  const descripcion = limpio(r.description)
  if (!descripcion) faltan.push('contenido declarado del producto')

  if (!/^\d{4}$/.test(r.pin ?? '')) faltan.push('clave de recojo (4 dígitos)')

  if (faltan.length) return { ok: false, faltan }

  const dims = parseDimsCm(r.dimsCm)
  const valor = Number(r.declaredValue)
  const pkg: Record<string, unknown> = {
    weightKg: Math.round(peso * 100) / 100,
    description: descripcion,
    declaredValue: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : 0,
    insuranceAccepted: false,
    ...(dims ? { shipmentType: 2, ...dims } : {}),
  }

  return {
    ok: true,
    body: {
      sender: {
        documentType: tipoDeDocumento(docRemitente),
        documentNumber: docRemitente,
        ...(/^9\d{8}$/.test(telRemitente) ? { phone: telRemitente } : {}),
        ...(emailOk(emailRemitente) ? { email: emailRemitente } : {}),
      },
      recipient: {
        documentType: tipoDeDocumento(docDestinatario),
        documentNumber: docDestinatario,
        fullName: nombre,
        phone: telDestinatario,
        ...(emailOk(emailDestinatario) ? { email: emailDestinatario } : {}),
      },
      origin: { headquarterId: origen },
      destination: { agencyCode: destino },
      package: pkg,
      whoPays: isWhoPays(r.whoPays) ? r.whoPays : 'STORE',
      deliveryType: 'O',
      pin: r.pin,
      confirm: true,
    },
  }
}

// ─── La clave de idempotencia ────────────────────────────────────────────────

/** FNV-1a de 32 bits, en hex. No es criptografía: es una huella corta y
 *  determinista del payload, para que la clave cambie si el envío cambió. */
function huella(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * `Idempotency-Key` del registro: el pedido MÁS la huella del payload.
 *
 * Solo el pedido dejaría pegada la respuesta vieja a un envío que Logística
 * corrigió (otro peso, otra sede); solo el payload haría que dos pedidos con
 * el mismo producto y el mismo comprador compartieran clave. Con los dos, un
 * reintento del MISMO envío no duplica, y un envío corregido es otro envío.
 */
export function claveDeIdempotencia(orderId: string, body: Record<string, unknown>): string {
  const id = limpio(orderId).replace(/[^A-Za-z0-9_-]/g, '') || 'sin-pedido'
  return `kross-${id}-${huella(JSON.stringify(body))}`
}

// ─── La respuesta ────────────────────────────────────────────────────────────

/** Los estados que la doc enseña para un envío recién registrado. */
export const LAT_SHIPMENT_STATUSES = ['REGISTERED', 'PENDING_PAYMENT', 'DRAFT'] as const

export interface LatShipmentResult {
  /** `REGISTERED` es el único que sirve: hay guía por venir y correos enviados.
   *  `PENDING_PAYMENT` es un `whoPays: ONLINE` (no lo mandamos) y `DRAFT` un
   *  `confirm: false`. Cualquier otro texto se conserva para el log. */
  status: string | null
  /** El número con el que Olva registra el envío: para reclamar y para el
   *  rótulo. NO es la guía. */
  registrationNumber: string | null
  /** El id interno del proveedor: la llave de `GET /shipments/:id`. */
  id: string | null
  /** La guía, si por excepción ya viniera. Normalmente `null` hasta la admisión. */
  trackingNumber: string | null
  cost: number | null
  /** La clave de recojo que Olva confirmó (la nuestra, o una generada). */
  securityPin: string | null
  /** El rótulo en base64 y su nombre, si vino. */
  labelBase64: string | null
  labelFilename: string | null
}

export const GUIA_OLVA = /^\d{6,15}$/

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** La respuesta trae el envío en `data` (la doc); se acepta también pelado. */
function envioDe(json: unknown): Record<string, unknown> | null {
  if (!esObj(json)) return null
  if (esObj(json.data)) return json.data
  if (esObj(json.shipment)) return json.shipment
  return json
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t ? t : null
}
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Lee la respuesta de `POST /shipments`. El `trackingNumber` solo entra si tiene
 * forma de guía: escribir basura en `tracking_numero` es peor que no escribir.
 */
export function parseLatShipment(json: unknown): LatShipmentResult {
  const d = envioDe(json)
  const label = d && esObj(d.label) ? d.label : null
  const tn = d ? texto(d.trackingNumber) : null
  return {
    status: d ? texto(d.status)?.toUpperCase() ?? null : null,
    registrationNumber: d ? texto(d.registrationNumber) : null,
    id: d ? texto(d.id) : null,
    trackingNumber: tn && GUIA_OLVA.test(tn) ? tn : null,
    cost: d ? numero(d.cost) : null,
    securityPin: (() => { const p = d ? texto(d.securityPin) : null; return p && /^\d{4}$/.test(p) ? p : null })(),
    labelBase64: label ? texto(label.pdfBase64) : null,
    labelFilename: label ? texto(label.filename) : null,
  }
}

/** Un registro sirve si Olva lo dio por REGISTRADO y le puso número de registro. */
export const esRegistrado = (r: LatShipmentResult): boolean =>
  r.status === 'REGISTERED' && !!r.registrationNumber

/** Una guía sirve si se puede RASTREAR. En Olva eso es el número, a secas. */
export const esRastreable = (r: { trackingNumber: string | null }): boolean => !!r.trackingNumber

// ─── El detalle (`GET /shipments/:id`): esperar la guía ──────────────────────

export interface LatShipmentDetail {
  trackingNumber: string | null
  status: string | null
  registrationNumber: string | null
}

/**
 * Lee `GET /shipments/:id`. La doc no fija la forma —solo dice que
 * `trackingNumber` "sigue en null hasta que Olva asigna la guía" y que el
 * registro viaja en `responsePayload.registrationNumber`—, así que se busca a
 * profundidad acotada en vez de asumir la raíz.
 */
export function leerDetalleLat(json: unknown): LatShipmentDetail {
  const found = new Map<string, string>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 5 || !esObj(v)) return
    for (const [k, raw] of Object.entries(v)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '')
      if (typeof raw === 'string' || typeof raw === 'number') {
        const val = String(raw).trim()
        if (val && !found.has(key)) found.set(key, val)
      } else if (esObj(raw)) visit(raw, depth + 1)
    }
  }
  visit(json, 0)
  const tn = found.get('trackingnumber') ?? null
  return {
    trackingNumber: tn && GUIA_OLVA.test(tn) ? tn : null,
    status: found.get('status')?.toUpperCase() ?? null,
    registrationNumber: found.get('registrationnumber') ?? null,
  }
}

// ─── Las sedes de origen (`GET /catalog/headquarters`) ───────────────────────

export interface LatHeadquarter {
  id: string
  nombre: string
}

/** Lee el catálogo de sedes. La doc no enseña su forma: se aceptan `id` /
 *  `headquarterId` y `name` / `headquarter` / `description`, envueltos o no. */
export function parseLatHeadquarters(json: unknown): LatHeadquarter[] {
  const lista = Array.isArray(json)
    ? json
    : esObj(json) ? (Array.isArray(json.data) ? json.data : Array.isArray(json.headquarters) ? json.headquarters : null) : null
  if (!Array.isArray(lista)) return []
  const out: LatHeadquarter[] = []
  for (const it of lista) {
    if (!esObj(it)) continue
    const id = texto(it.id ?? it.headquarterId ?? it.code)
    if (!id) continue
    const partes = [texto(it.name ?? it.headquarter ?? it.description), texto(it.district ?? it.ubigeo)]
      .filter((x): x is string => !!x)
    out.push({ id, nombre: partes.join(' · ') || id })
  }
  return out
}
