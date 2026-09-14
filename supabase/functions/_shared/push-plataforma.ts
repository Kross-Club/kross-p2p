// ─── De qué plataforma es una suscripción de push ────────────────────────────
// Dos hechos, de dos fuentes distintas, porque ninguna sola alcanza:
//
//  · La PLATAFORMA sale del user-agent de la petición que creó la suscripción
//    (el mismo truco que `register-buyer` usa para la atribución del anuncio).
//    El endpoint no sirve para esto: Chrome de Android y Chrome de escritorio
//    usan el MISMO servicio (FCM) y son indistinguibles por la URL.
//  · El SERVICIO de push sale del host del endpoint. Es lo único que se puede
//    rellenar a las filas viejas, que no guardaron el user-agent.
//
// Sin APIs de Deno a propósito: se importa también desde vitest.

export type PlataformaDePush = 'ios' | 'android' | 'desktop' | 'otro'
export type ServicioDePush = 'apple' | 'fcm' | 'mozilla' | 'wns' | 'otro'

export function plataformaPorUserAgent(ua: string | null | undefined): PlataformaDePush {
  if (!ua) return 'otro'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'otro'
}

export function servicioPorEndpoint(endpoint: string | null | undefined): ServicioDePush {
  if (!endpoint) return 'otro'
  let host: string
  try { host = new URL(endpoint).host.toLowerCase() } catch { return 'otro' }
  if (host === 'web.push.apple.com') return 'apple'
  if (host === 'fcm.googleapis.com' || host.endsWith('.googleapis.com')) return 'fcm'
  if (host.endsWith('push.services.mozilla.com')) return 'mozilla'
  if (host.endsWith('.notify.windows.com')) return 'wns'
  return 'otro'
}

/** Las dos cosas juntas, como se guardan en `push_subscriptions` (§57). */
export function plataformaDePush(ua: string | null | undefined, endpoint: string | null | undefined): {
  platform: PlataformaDePush
  push_service: ServicioDePush
} {
  return { platform: plataformaPorUserAgent(ua), push_service: servicioPorEndpoint(endpoint) }
}

/** `true` si el navegador dijo que corre como app instalada; `null` cuando el
 *  cliente no lo mandó (un `push.ts` de antes de §57). Nunca se inventa. */
export function standaloneDelBody(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}
