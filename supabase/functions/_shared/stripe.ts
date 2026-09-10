// ─── Stripe: leer lo que dice, sin creerle a cualquiera ──────────────────────
//
// Stripe cobra el plan mensual del comercio ($67/mes) y **eso es todo lo que
// hace en Kross**. No paga comisiones, no mueve soles y no conoce a los
// afiliados: lo único que aporta al programa es UN dato —qué meses pagó cada
// tienda— y ese dato entra por el webhook.
//
// Este archivo es la mitad PURA: verificar la firma y leer los campos que
// interesan de cada evento. Sin APIs de Deno y sin SDK —la verificación es un
// HMAC-SHA256 con Web Crypto, que existe igual en Deno y en vitest—, así que se
// puede probar de verdad en vez de confiar en que la librería hace lo suyo.
//
// La otra mitad —escribir en `store_subscriptions` y `subscription_periods`—
// vive en la Edge Function `stripe-webhook`.
//
// ⚠️ **No se importa `npm:stripe`.** El SDK sirve para LLAMAR a Stripe, y acá
// nadie llama: el webhook solo escucha. Traerlo por una función de verificación
// de 20 líneas metería medio megabyte de dependencia en el arranque en frío del
// único endpoint que tiene que contestar rápido o Stripe lo reintenta.

// ─── La firma ────────────────────────────────────────────────────────────────
//
// Stripe manda la cabecera `Stripe-Signature`:
//
//   t=1699999999,v1=5257a869e7…,v1=otra
//
// y la firma es HMAC-SHA256 de `${t}.${cuerpo}` con el secreto del endpoint
// (`whsec_…`). Hay dos reglas que parecen detalles y no lo son:
//
//   1. **El cuerpo CRUDO, tal como llegó.** Parsear y re-serializar cambia el
//      orden de las llaves y los espacios, y rompe la firma de un evento
//      legítimo. Es el mismo orden de defensas que `pay360-webhook`.
//   2. **La ventana de replay.** Sin mirar el `t`, una petición firmada
//      capturada hoy sigue siendo válida para siempre: cualquiera que la
//      reenvíe vuelve a marcar un mes como pagado.

export interface CabeceraDeFirma {
  /** Segundos unix del momento en que Stripe firmó. */
  t: number
  /** Puede venir más de una durante una rotación de secreto. */
  v1: string[]
}

export function leerCabeceraDeFirma(header: string | null): CabeceraDeFirma | null {
  if (!header) return null
  let t = NaN
  const v1: string[] = []
  for (const parte of header.split(',')) {
    const i = parte.indexOf('=')
    if (i < 0) continue
    const clave = parte.slice(0, i).trim()
    const valor = parte.slice(i + 1).trim()
    if (clave === 't') t = Number(valor)
    else if (clave === 'v1' && valor) v1.push(valor)
  }
  if (!Number.isFinite(t) || v1.length === 0) return null
  return { t, v1 }
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre un hash se corta en el primer byte distinto, y ese "cuánto
 * tardó" es medible: con suficientes intentos se adivina la firma byte por
 * byte. Es un ataque teórico sobre una red pública y aun así no cuesta nada
 * cerrarlo.
 */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

/** Cuántos segundos de desfase se toleran. El de Stripe por defecto. */
export const TOLERANCIA_SEG = 300

/**
 * ¿Este cuerpo lo firmó Stripe, y hace poco?
 *
 * `ahoraSeg` entra por parámetro para poder probar la ventana sin esperar cinco
 * minutos. La tolerancia es simétrica: un reloj adelantado en nuestro servidor
 * rechazaría eventos legítimos igual que uno atrasado.
 */
export async function firmaValida(
  cuerpo: string, header: string | null, secreto: string,
  ahoraSeg = Math.floor(Date.now() / 1000), tolerancia = TOLERANCIA_SEG,
): Promise<boolean> {
  if (!secreto) return false
  const cab = leerCabeceraDeFirma(header)
  if (!cab) return false
  if (Math.abs(ahoraSeg - cab.t) > tolerancia) return false

  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const firma = hex(await crypto.subtle.sign(
    'HMAC', llave, new TextEncoder().encode(`${cab.t}.${cuerpo}`),
  ))
  return cab.v1.some(v => igualesEnTiempoConstante(v, firma))
}

// ─── Leer el evento ──────────────────────────────────────────────────────────
//
// Los objetos de Stripe son grandes y solo interesan cinco campos. Se leen con
// acceso defensivo y no con un tipo del SDK a propósito: la API de Stripe
// versiona, y un campo que se mueve tiene que degradar a `null` —una
// suscripción sin `current_period_end` es una fila con una columna vacía— y no
// tumbar el webhook, que es lo que haría un desestructurado.

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v && typeof v === 'object' ? v as Json : {})
const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Segundos unix → ISO, o `null`. Stripe manda TODAS sus fechas en segundos;
 *  pasarlas a `new Date()` sin multiplicar da 1970 y nadie lo nota hasta que
 *  una suscripción figura vencida desde hace 56 años. */
export function fechaDeStripe(seg: unknown): string | null {
  const n = numero(seg)
  if (n === null || n <= 0) return null
  return new Date(n * 1000).toISOString()
}

/** Un id que puede venir expandido (`{id: 'sub_…'}`) o plano (`'sub_…'`). */
export function idDe(v: unknown): string | null {
  if (typeof v === 'string') return v || null
  return texto(obj(v).id)
}

/**
 * De qué tienda es este objeto de Stripe.
 *
 * Tres caminos, en orden de confianza, porque el enlace tienda↔Stripe se puede
 * establecer en tres momentos distintos y no siempre están todos:
 *
 *   1. `metadata.store_id` — lo que ponemos nosotros al crear la suscripción.
 *   2. `client_reference_id` — lo que lleva un Checkout Link, que es como se
 *      da de alta un comercio sin que nadie toque la API.
 *   3. `subscription_details.metadata.store_id` — donde Stripe copia el
 *      metadata de la suscripción en las FACTURAS. Sin esto, una `invoice.paid`
 *      llega sin saber de quién es.
 *
 * `null` no es un error: significa "hay que resolverlo por el customer", y eso
 * lo hace la Edge Function contra `store_subscriptions`.
 */
export function storeIdDe(o: unknown): string | null {
  const d = obj(o)
  return texto(obj(d.metadata).store_id)
    ?? texto(d.client_reference_id)
    ?? texto(obj(obj(d.subscription_details).metadata).store_id)
}

export interface EstadoDeSuscripcion {
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  price_usd: number | null
}

/** Lo que hace falta de un `customer.subscription.*`. */
export function suscripcionDelEvento(o: unknown): EstadoDeSuscripcion {
  const s = obj(o)
  const item = obj((obj(s.items).data as unknown[] ?? [])[0])
  const centavos = numero(obj(item.price).unit_amount)
  return {
    stripe_subscription_id: texto(s.id),
    stripe_customer_id: idDe(s.customer),
    status: texto(s.status),
    // En las APIs nuevas de Stripe el periodo vive en el ITEM, no en la
    // suscripción. Se leen los dos: el que exista gana, y así el mismo código
    // sirve antes y después de que la cuenta se actualice de versión.
    current_period_end: fechaDeStripe(s.current_period_end) ?? fechaDeStripe(item.current_period_end),
    cancel_at_period_end: s.cancel_at_period_end === true,
    price_usd: centavos === null ? null : centavos / 100,
  }
}

export interface TramoPagado {
  stripe_invoice_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  inicio: string
  fin: string
  monto_usd: number
  paid_at: string | null
}

/**
 * El tramo que cubre una factura pagada, o `null` si no cubre ninguno.
 *
 * **Es la pieza que decide la comisión.** Una transacción del comercio cuenta
 * si su fecha cae dentro de alguno de estos tramos (`cubierta()` en
 * `afiliados.ts`), así que leer mal este rango es pagarle de menos —o de más—
 * a una persona.
 *
 * El rango sale de las LÍNEAS de la factura y no de la suscripción: la factura
 * es el documento de lo que se pagó, y una factura puede cubrir un tramo
 * distinto del "periodo actual" de la suscripción (un prorrateo, un cambio de
 * plan a mitad de mes, un mes cobrado por adelantado). Se toma el rango
 * ENVOLVENTE de todas las líneas: la que abre primero y la que cierra último.
 *
 * `null` para una factura de importe cero o sin periodo — que existe: un cupón
 * del 100 %, un ajuste. Guardar un tramo por una factura que no cobró nada
 * regalaría un mes de comisión que el comercio no pagó.
 */
export function tramoDeFactura(o: unknown): TramoPagado | null {
  const f = obj(o)
  const id = texto(f.id)
  if (!id) return null

  const lineas = (obj(f.lines).data as unknown[]) ?? []
  let inicio = Infinity
  let fin = -Infinity
  for (const l of lineas) {
    const p = obj(obj(l).period)
    const a = numero(p.start); const b = numero(p.end)
    if (a === null || b === null || b <= a) continue
    if (a < inicio) inicio = a
    if (b > fin) fin = b
  }
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return null

  // Pagada de verdad. `amount_paid` en cero con un periodo válido es una
  // factura saldada por crédito o cupón: el comercio no pagó, así que ese mes
  // no comisiona.
  const centavos = numero(f.amount_paid) ?? 0
  if (centavos <= 0) return null

  return {
    stripe_invoice_id: id,
    stripe_customer_id: idDe(f.customer),
    stripe_subscription_id: idDe(f.subscription) ?? idDe(obj(obj(f.parent).subscription_details).subscription),
    inicio: new Date(inicio * 1000).toISOString(),
    fin: new Date(fin * 1000).toISOString(),
    monto_usd: centavos / 100,
    paid_at: fechaDeStripe(obj(f.status_transitions).paid_at) ?? fechaDeStripe(f.created),
  }
}
