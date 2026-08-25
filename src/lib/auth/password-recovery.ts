// Recuperación de contraseña del panel (vendedores y admins).
//
// El equipo entra con Supabase Auth (`sellers.auth_user_id`). Hasta ahora, quien
// olvidaba su contraseña solo podía pedirle a un admin de la marca que le creara
// otra cuenta: si el que olvidaba era el único admin, la marca se quedaba fuera
// de su propio panel. Este módulo es la lógica pura del flujo — el correo con el
// enlace y la pantalla que fija la contraseña nueva — para poder probarla sin
// navegador.
//
// El comprador NO pasa por acá: entra por DNI/teléfono y no tiene contraseña.

/** Ruta donde aterriza el enlace del correo. */
export const RECOVERY_PATH = '/nueva-contrasena'

/** Mínimo de la contraseña que la persona elige para sí misma. */
export const MIN_PASSWORD = 8

/**
 * A dónde vuelve el enlace del correo. Siempre al MISMO origen desde el que se
 * pidió: el panel es multi-tenant por subdominio (`marca.krossclub.app`) y
 * mandar a todos a un host fijo sacaría al vendedor de su marca.
 *
 * Requiere que el proyecto de Supabase tenga `https://*.krossclub.app/**` en
 * "Additional Redirect URLs"; si no, Auth ignora el `redirectTo` y devuelve al
 * Site URL. Está anotado en `docs/00-CORE-ARCHITECTURE.md`.
 */
export function recoveryRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${RECOVERY_PATH}`
}

/** El correo se guarda en minúsculas y sin espacios: se escribe a mano y en móvil. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type RecoveryLink =
  /** Flujo implícito (el de por defecto): el enlace trae la sesión en el hash. */
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  /** Flujo PKCE: hay que canjear el `code` por la sesión. */
  | { kind: 'code'; code: string }
  /** Plantilla con `token_hash`: se verifica como OTP (sirve entre dispositivos). */
  | { kind: 'otp'; tokenHash: string; type: 'recovery' | 'invite' }
  /** Auth rebotó el enlace (vencido, ya usado, mal formado). */
  | { kind: 'expired'; message: string }
  /** No hay nada en la URL: se llegó a la pantalla sin enlace. */
  | { kind: 'none' }

function linkErrorMessage(code: string): string {
  // `otp_expired` es de lejos el caso común: el enlace vence (1 h por defecto) o
  // ya se usó una vez. Decirlo con el siguiente paso evita el reintento a ciegas.
  if (/expired|used/i.test(code)) return 'El enlace ya venció o se usó. Pide uno nuevo.'
  if (/access_denied|unauthorized/i.test(code)) return 'El enlace no es válido. Pide uno nuevo.'
  return 'No pudimos validar el enlace. Pide uno nuevo.'
}

/**
 * Lee el enlace al que aterrizó el correo. Supabase manda los datos en el hash
 * (`#access_token=…`) o en la query (`?code=…`, `?token_hash=…`) según la
 * plantilla y el flujo, así que se miran los dos.
 */
export function parseRecoveryLink(href: string): RecoveryLink {
  let url: URL
  try { url = new URL(href) } catch { return { kind: 'none' } }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const get = (k: string) => hash.get(k) ?? url.searchParams.get(k)

  const errorCode = get('error_code') ?? get('error')
  if (errorCode) return { kind: 'expired', message: linkErrorMessage(errorCode) }

  const accessToken = get('access_token')
  const refreshToken = get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }

  const tokenHash = get('token_hash')
  if (tokenHash) return { kind: 'otp', tokenHash, type: get('type') === 'invite' ? 'invite' : 'recovery' }

  const code = get('code')
  if (code) return { kind: 'code', code }

  return { kind: 'none' }
}

/**
 * El enlace, pero solo si abrió **la pantalla de recuperación**. Otras páginas
 * llegan con su propio `?code=` en la URL y no tienen nada que ver con esto.
 */
export function linkFromLocation(pathname: string, href: string): RecoveryLink {
  const clean = pathname.replace(/\/+$/, '') || '/'
  return clean === RECOVERY_PATH ? parseRecoveryLink(href) : { kind: 'none' }
}

// Foto de la URL al cargar el módulo. supabase-js limpia el hash apenas
// arranca (`detectSessionInUrl`), así que leerlo dentro de un efecto llega
// tarde: para entonces la URL ya no tiene el token. Los imports son síncronos y
// esa limpieza es asíncrona, así que acá el enlace todavía está entero.
const initialLink: RecoveryLink = typeof window === 'undefined'
  ? { kind: 'none' }
  : linkFromLocation(window.location.pathname, window.location.href)

/** El enlace con el que se abrió la pestaña, ya sin depender de la URL actual. */
export function openedWithLink(): RecoveryLink { return initialLink }

/** Qué le falta a la contraseña nueva, o `null` si está bien. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`
  if (password !== confirm) return 'Las dos contraseñas no coinciden.'
  return null
}

/**
 * Mensaje para cuando Auth NO aceptó el envío del correo. Se llama solo si hubo
 * error, y siempre devuelve algo: un fallo de red trae `status: 0`, y tratar
 * eso como "salió bien" deja al vendedor esperando un correo que nunca se envió.
 *
 * Nunca decimos si el correo existe o no: quien pide el enlace ve siempre la
 * misma pantalla de "revisa tu correo". Lo único que sí hay que contar es el
 * límite de envíos, porque el reintento inmediato tampoco va a funcionar.
 */
export function sendErrorMessage(status?: number, code?: string): string {
  if (status === 429 || /rate.?limit/i.test(code ?? '')) {
    return 'Ya enviamos un correo hace poco. Espera un minuto antes de pedir otro.'
  }
  return 'No pudimos enviar el correo. Intenta de nuevo en un momento.'
}
