// ─── El catálogo de integraciones y cómo se anota lo que falla ───────────────
// Kross se apoya en una docena de APIs de terceros. Hasta hoy, cuando una
// fallaba, el error terminaba en un `console.error` que solo se leía entrando
// al dashboard de Supabase y buscando a mano — sin un identificador que
// enseñarle al dueño de esa API, y sin forma de responder la pregunta que
// importa: *"¿desde cuándo está fallando, y con qué error exactamente?"*.
//
// Este módulo es la mitad PURA de la respuesta: qué integraciones existen, cómo
// se llama cada una, de quién es, y cómo se convierte un fallo en un renglón
// legible. Sin Deno y sin red: lo importan las Edge Functions (que anotan) y el
// panel (que lo muestra), y así las dos mitades dicen exactamente lo mismo.
//
// La otra mitad —escribir en `api_events`— vive en `_shared/api-eventos.ts`.

/** Cada API de terceros de la que Kross depende. El id es el que se guarda. */
export const PROVEEDORES = [
  'SHALOM_PE', 'SHALOM_LAT', 'OLVA',
  'PAY360', 'FLOW',
  'WHATSAPP', 'META_CAPI', 'TIKTOK_CAPI',
  'LIVEKIT', 'ELEVENLABS', 'DECOLECTA', 'RESEND', 'WEB_PUSH', 'NOMINATIM',
] as const
export type Proveedor = typeof PROVEEDORES[number]

export const esProveedor = (v: unknown): v is Proveedor =>
  typeof v === 'string' && (PROVEEDORES as readonly string[]).includes(v)

/** Cómo terminó una llamada. Se anota lo que NO salió bien; el `OK` se guarda
 *  solo como latido (una vez por barrido o por chequeo del panel), para que la
 *  tabla cuente una línea de tiempo sin crecer con cada request. */
export type Resultado =
  /** El proveedor contestó y todo bien (latido). */
  | 'OK'
  /** Contestó, pero rechazando: 4xx. Casi siempre es NUESTRO error o config. */
  | 'RECHAZO'
  /** Contestó mal: 5xx, o una respuesta que no se puede leer. Es de ellos. */
  | 'FALLO'
  /** No contestó: timeout, red caída, DNS. También es de ellos. */
  | 'SIN_RESPUESTA'

export interface Integracion {
  id: Proveedor
  nombre: string
  /** Para qué la usa Kross, en una línea. */
  que: string
  /** De quién hay que reclamar cuando falla. */
  dueno: string
  host: string
  /**
   * `plataforma` = una sola llave de Kross para todas las marcas.
   * `marca` = cada marca trae la suya (y puede estar sin configurar sin que eso
   * sea un problema de la plataforma).
   */
  alcance: 'plataforma' | 'marca'
  /** El secret que la enciende. Se muestra el NOMBRE, jamás el valor. */
  secreto: string | null
  /** Si se cae, ¿se frena vender o despachar? Ordena la lista por urgencia. */
  critico: boolean
  /** Si tiene un suplente que la cubre, cuál. */
  suplente?: Proveedor
}

// Ordenado por lo que duele: primero cobrar, después despachar, después hablar.
export const INTEGRACIONES: Integracion[] = [
  {
    id: 'PAY360', nombre: '360pay', que: 'Cobra el adelanto y el saldo por Yape (riel por defecto)',
    dueno: '360pay', host: 'api.360pay.pe', alcance: 'marca', secreto: null, critico: true,
  },
  {
    id: 'FLOW', nombre: 'Flow Pagos', que: 'Checkout alojado para los montos bajos (el segundo riel)',
    dueno: 'Flow', host: 'flow.cl', alcance: 'marca', secreto: null, critico: true,
  },
  {
    id: 'SHALOM_PE', nombre: 'Shalom PE', que: 'Rastreo y emisión de guías Shalom — el proveedor titular',
    dueno: 'Shalom API Perú (tercero, no es Shalom)', host: 'api.shalom-api-peru.com',
    alcance: 'plataforma', secreto: 'SHALOM_API_KEY', critico: true, suplente: 'SHALOM_LAT',
  },
  {
    id: 'SHALOM_LAT', nombre: 'Shalom LAT', que: 'Lo mismo que el titular, cuando el titular no responde',
    dueno: 'Shalom API LAT (tercero, no es Shalom)', host: 'api.shalom-api.lat',
    alcance: 'plataforma', secreto: 'SHALOM_LAT_API_KEY', critico: true,
  },
  {
    id: 'OLVA', nombre: 'Olva', que: 'Rastreo de guías Olva (sin webhook: solo barrido)',
    dueno: 'Olva API Perú (tercero, no es Olva)', host: 'api.olva-api-peru.com',
    alcance: 'plataforma', secreto: 'OLVA_API_KEY', critico: true,
  },
  {
    id: 'WHATSAPP', nombre: 'WhatsApp Cloud API', que: 'Plantillas de recojo, campañas e invitaciones',
    dueno: 'Meta', host: 'graph.facebook.com', alcance: 'plataforma', secreto: 'WHATSAPP_TOKEN', critico: false,
  },
  {
    id: 'DECOLECTA', nombre: 'Decolecta (RENIEC)', que: 'Nombre y apellidos por DNI, en el checkout y en la guía',
    dueno: 'Decolecta', host: 'api.decolecta.com', alcance: 'plataforma', secreto: 'DECOLECTA_TOKEN', critico: true,
  },
  {
    id: 'LIVEKIT', nombre: 'LiveKit', que: 'Llamadas de voz del vendedor y sus grabaciones',
    dueno: 'LiveKit', host: 'livekit.cloud', alcance: 'plataforma', secreto: 'LIVEKIT_API_KEY', critico: false,
  },
  {
    id: 'META_CAPI', nombre: 'Meta CAPI', que: 'Eventos del embudo al Events Manager de cada marca',
    dueno: 'Meta', host: 'graph.facebook.com', alcance: 'marca', secreto: null, critico: false,
  },
  {
    id: 'TIKTOK_CAPI', nombre: 'TikTok Events API', que: 'Lo mismo que Meta CAPI, en TikTok',
    dueno: 'TikTok', host: 'business-api.tiktok.com', alcance: 'marca', secreto: null, critico: false,
  },
  {
    id: 'ELEVENLABS', nombre: 'ElevenLabs', que: 'La voz del closer de IA',
    dueno: 'ElevenLabs', host: 'api.elevenlabs.io', alcance: 'plataforma', secreto: 'ELEVENLABS_API_KEY', critico: false,
  },
  {
    id: 'WEB_PUSH', nombre: 'Web Push (VAPID)', que: 'Los avisos que llegan al celular con la app cerrada',
    dueno: 'El navegador de cada persona (FCM, APNs, Mozilla)', host: 'varios',
    alcance: 'plataforma', secreto: 'VAPID_PRIVATE_KEY', critico: false,
  },
  {
    id: 'RESEND', nombre: 'Resend', que: 'El correo del Libro de Reclamaciones',
    dueno: 'Resend', host: 'api.resend.com', alcance: 'plataforma', secreto: 'RESEND_API_KEY', critico: false,
  },
  {
    id: 'NOMINATIM', nombre: 'Nominatim (OSM)', que: 'Convierte el pin del comprador en una dirección escrita',
    dueno: 'OpenStreetMap', host: 'nominatim.openstreetmap.org',
    alcance: 'plataforma', secreto: null, critico: false,
  },
]

export const integracionDe = (id: string): Integracion | undefined =>
  INTEGRACIONES.find(i => i.id === id)

// ─── La referencia que se le enseña al proveedor ─────────────────────────────
// Un fallo sin identificador no se puede reclamar: "ayer nos falló" no es un
// reporte. Cada evento nace con una `ref` corta, legible por teléfono y sin
// caracteres que se confundan (Crockford: sin I, L, O ni U). Va con prefijo
// KX- para que se reconozca como nuestra en el hilo de soporte del proveedor.

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `rnd` entra por parámetro para poder probarla. */
export function nuevaRef(rnd: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += ALFABETO[Math.floor(rnd() * ALFABETO.length)]
  return `KX-${s}`
}

export const esRef = (v: unknown): v is string =>
  typeof v === 'string' && /^KX-[0-9A-HJKMNP-TV-Z]{6}$/.test(v)

// ─── Sanear lo que se guarda ─────────────────────────────────────────────────
// El detalle crudo del proveedor es LO ÚTIL de un reporte de error, y por eso se
// guarda. Pero una respuesta de error puede traer de vuelta lo que le mandamos
// —y lo que le mandamos incluye llaves, tokens y contraseñas de terceros—. La
// regla del repo es que un secreto no se escribe en ningún lado; una tabla que
// el panel muestra no es una excepción, es el peor sitio posible.

const REGLAS: [RegExp, string][] = [
  // `Bearer eyJ…`, `Basic …`
  [/\b(bearer|basic)\s+[\w\-._~+/=]{8,}/gi, '$1 «oculto»'],
  // Pares clave/valor en JSON: "password": "…", "api_key": "…", "token": "…"
  [/("(?:[\w-]*(?:key|token|secret|password|passwd|pwd|authorization|signature)[\w-]*)"\s*:\s*)"[^"]*"/gi, '$1"«oculto»"'],
  // Lo mismo en querystrings y formularios: api_key=…&
  [/\b([\w-]*(?:key|token|secret|password|apikey|signature)[\w-]*)=[^&\s"']+/gi, '$1=«oculto»'],
  // Un chorizo suelto que parece llave (hex o base64 largo), sin nombre que lo
  // delate. Se corta igual: un falso positivo cuesta legibilidad, y el otro
  // error cuesta un secreto publicado.
  [/\b[A-Za-z0-9_-]{40,}\b/g, '«oculto»'],
]

/** El texto que SÍ se puede guardar y mostrar, recortado a lo que se lee. */
export function sanear(texto: unknown, max = 600): string {
  let s = String(texto ?? '').replace(/\s+/g, ' ').trim()
  for (const [re, por] of REGLAS) s = s.replace(re, por)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// ─── La referencia DEL PROVEEDOR ─────────────────────────────────────────────
// Casi todos devuelven un id de request en un header. Es lo primero que pide su
// soporte, y es gratis guardarlo: sin él, un reclamo empieza por "búscalo tú".

const HEADERS_DE_REF = [
  'x-request-id', 'x-requestid', 'request-id', 'x-correlation-id',
  'x-amzn-requestid', 'x-amz-request-id', 'cf-ray', 'x-trace-id', 'traceparent',
]

/** Lee el id de request de una respuesta. `get` es la función del header, así
 *  que sirve igual con un `Headers` real o con un objeto en un test. */
export function refDelProveedor(get: (nombre: string) => string | null): string | null {
  for (const h of HEADERS_DE_REF) {
    const v = get(h)
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120)
  }
  return null
}

// ─── Cómo se lee un evento en el panel ───────────────────────────────────────

export interface EventoApi {
  ref: string
  provider: string
  op: string
  outcome: Resultado
  http_status: number | null
  error_code: string | null
  detail: string | null
  provider_ref: string | null
  store_id: string | null
  session_id: string | null
  duration_ms: number | null
  created_at: string
}

/** El estado de una integración, tal como lo pinta el panel. */
export type Salud =
  /** Responde y no hay fallos recientes. */
  | 'OPERATIVA'
  /** Responde, pero viene fallando: hay algo puntual que mostrarle al dueño. */
  | 'INESTABLE'
  /** No responde. */
  | 'CAIDA'
  /** No hay llave: no está montada. NO es lo mismo que caída. */
  | 'SIN_CONFIGURAR'
  /** No se pudo saber (no expone un chequeo barato y no hay eventos). */
  | 'DESCONOCIDA'

/**
 * El veredicto, con la misma regla en el servidor y en el panel.
 *
 * `ping` es el resultado de preguntarle al proveedor AHORA (null = no expone
 * ningún chequeo barato). `fallos` son los de las últimas 24 h. La combinación
 * importa: un proveedor que responde el ping pero acumula fallos NO está sano —
 * ese es exactamente el caso que hoy no se ve en ningún lado.
 */
export function saludDe(
  { configurado, ping, fallos }: { configurado: boolean; ping: boolean | null; fallos: number },
): Salud {
  if (!configurado) return 'SIN_CONFIGURAR'
  if (ping === false) return 'CAIDA'
  if (fallos > 0) return 'INESTABLE'
  if (ping === true) return 'OPERATIVA'
  return 'DESCONOCIDA'
}

export const ROTULO_SALUD: Record<Salud, string> = {
  OPERATIVA: 'Operativa',
  INESTABLE: 'Con fallos',
  CAIDA: 'Caída',
  SIN_CONFIGURAR: 'Sin configurar',
  DESCONOCIDA: 'Sin datos',
}

export const ROTULO_RESULTADO: Record<Resultado, string> = {
  OK: 'Respondió bien',
  RECHAZO: 'Rechazó la llamada',
  FALLO: 'Falló de su lado',
  SIN_RESPUESTA: 'No respondió',
}
