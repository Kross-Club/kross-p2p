// ─── Las reglas del acceso del comprador — PURAS ────────────────────────────
//
// Hasta el 09-set-2026, entrar a «Mis pedidos» era teclear un DNI y nada más.
// `buyer-login` respondía con la ficha entera de la persona Y el `token` de
// cada pedido, y ese token abre el chat, la guía, la sede de recojo y —desde
// este mismo PR— la clave con la que se retira el paquete del mostrador. En
// Perú el DNI está en cada boleta y en cada formulario: no es una contraseña y
// nunca lo fue. Quien supiera un DNI se llevaba el paquete.
//
// Ahora se entra con un CÓDIGO de 6 dígitos que llega al WhatsApp **ya
// guardado** para ese DNI. Un código y no un enlace mágico, y la razón es la
// PWA: un enlace tocado dentro de WhatsApp abre su navegador interno, la sesión
// se crearía ahí, y el comprador que después abre su app instalada seguiría
// deslogueado. El código se lee en WhatsApp y se teclea donde la persona está.
//
// Acá viven solo las REGLAS —cuántos dígitos, cuánto duran, cuántos intentos—
// para poder probarlas sin red y sin Deno (`src/lib/acceso-comprador.test.ts`).
// El envío y la base viven en `buyer-code-request` y `buyer-code-verify`.

/** Dígitos del código. Seis es lo que la gente copia de un vistazo. */
export const CODIGO_LARGO = 6

/** Cuánto vive un código. Corto: es el margen que tiene un atacante. */
export const VIGENCIA_MIN = 10

/** Intentos por código antes de quemarlo. Sin tope, seis dígitos se rompen
 *  probando un millón de veces; con cinco, la probabilidad es 5 en 10^6. */
export const INTENTOS_MAX = 5

/** Códigos que un mismo comprador puede pedir dentro de la ventana. Cada uno
 *  cuesta un mensaje de plantilla, o sea plata, y es el único gasto que un
 *  desconocido puede provocarnos desde afuera. */
export const PEDIDOS_MAX = 3
export const VENTANA_MIN = 15

/** Cuánto dura la sesión antes de volver a pedir código. */
export const SESION_DIAS = 30

/** El DNI peruano: ocho dígitos, ni uno más. */
export function esDniValido(v: unknown): boolean {
  return /^\d{8}$/.test(String(v ?? '').trim())
}

/** El código tecleado, normalizado. `null` si no tiene la forma esperada —así
 *  un espacio de más no cuenta como intento fallido contra el tope. */
export function normalizarCodigo(v: unknown): string | null {
  const limpio = String(v ?? '').replace(/\D/g, '')
  return limpio.length === CODIGO_LARGO ? limpio : null
}

/**
 * Un código nuevo, con la fuente de azar que le den.
 *
 * `azar` devuelve enteros de 0 a 255 (en el servidor, `crypto.getRandomValues`).
 * Se toma el resto entre 10 con rechazo del último tramo incompleto: sin eso,
 * los dígitos 0 a 5 saldrían un poco más seguido que el resto, y un sesgo en un
 * código de acceso es exactamente lo que no debe tener.
 */
export function generarCodigo(azar: () => number): string {
  let out = ''
  while (out.length < CODIGO_LARGO) {
    const b = azar() & 0xff
    if (b >= 250) continue // 250..255 rompería el reparto parejo
    out += String(b % 10)
  }
  return out
}

/** El teléfono como lo quiere WhatsApp: 51 + nueve dígitos. `null` si no cuadra. */
export function telefonoWhatsApp(phone: unknown): string | null {
  const d = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '')
  const con51 = d.length === 9 ? `51${d}` : d
  return /^51\d{9}$/.test(con51) ? con51 : null
}

/**
 * El teléfono enmascarado, para que su dueño lo reconozca sin que lo lea nadie
 * más. ⚠️ NO se enseña antes de verificar: decir «te mandamos el código al ***
 * 241» a quien teclea un DNI ajeno confirma que esa persona compra acá y le
 * regala tres dígitos. Va en el perfil, ya adentro.
 */
export function enmascararTelefono(phone: unknown): string | null {
  const num = telefonoWhatsApp(phone)
  if (!num) return null
  return `+51 ••• ••• ${num.slice(-3)}`
}

export interface FilaDeCodigo {
  expires_at: string
  attempts?: number | null
  used_at?: string | null
}

export type EstadoDeCodigo = 'usable' | 'vencido' | 'usado' | 'agotado'

/** Si un código guardado todavía sirve. Se mira ANTES de comparar nada. */
export function estadoDeCodigo(fila: FilaDeCodigo | null | undefined, ahora: Date): EstadoDeCodigo {
  if (!fila) return 'vencido'
  if (fila.used_at) return 'usado'
  if (Number(fila.attempts ?? 0) >= INTENTOS_MAX) return 'agotado'
  return new Date(fila.expires_at).getTime() <= ahora.getTime() ? 'vencido' : 'usable'
}

/** Cuándo vence un código pedido ahora. */
export const venceEn = (ahora: Date): Date => new Date(ahora.getTime() + VIGENCIA_MIN * 60_000)

/** Desde cuándo cuentan los pedidos para el tope. */
export const desdeLaVentana = (ahora: Date): Date => new Date(ahora.getTime() - VENTANA_MIN * 60_000)

/** Cuándo vence una sesión abierta ahora. */
export const venceLaSesion = (ahora: Date): Date => new Date(ahora.getTime() + SESION_DIAS * 86_400_000)

/**
 * ¿Esta tienda puede mandar códigos?
 *
 * Configurar la plantilla ES encender la seguridad: en cuanto la marca la tiene
 * aprobada, la puerta del DNI a secas se cierra sola (`buyer-login` la rechaza).
 * No hay un interruptor aparte que alguien pueda olvidarse de mover.
 *
 * ⚠️ Y al revés: mientras la marca NO la tenga, esa puerta sigue abierta. Es el
 * precio de no dejar sin «Mis pedidos» a una tienda que todavía no configuró
 * WhatsApp, y está anotado como deuda en `ESTADO-OPERATIVO.md`.
 */
export function puedeMandarCodigo(store: {
  wa_enabled?: boolean | null
  wa_phone_number_id?: string | null
  wa_codigo_template?: string | null
} | null | undefined, hayToken: boolean): boolean {
  if (!store || !hayToken) return false
  return !!store.wa_enabled
    && !!String(store.wa_phone_number_id ?? '').trim()
    && !!String(store.wa_codigo_template ?? '').trim()
}
