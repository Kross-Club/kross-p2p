// ─── El href que de verdad abre la app de Yape ───────────────────────────────
// El servidor arma el universal link `https://www.yape.com.pe/...` (pay360.ts,
// `yapeDeeplink`) y ese enlace ES correcto: tocado en un navegador normal,
// Android e iOS abren la app. Pero el primer pedido real desde la PWA
// INSTALADA enseñó que ahí no alcanza:
//
// · En una PWA instalada (modo standalone), todo enlace externo sale por una
//   Custom Tab, y Android NO resuelve App Links para la URL inicial de una
//   Custom Tab — la app que la lanza pidió explícitamente esa URL, así que se
//   carga tal cual. Resultado: el comprador aterriza en la página WEB de Yape,
//   que no cobra nada, con la app instalada a un toque de distancia.
// · `target="_blank"` empeora lo mismo en navegador: la navegación de pestaña
//   nueva tampoco se entrega a la app de forma confiable.
//
// La salida en Android es el esquema `intent://`: le dice al sistema "abre
// ESTA app con esta URL", funciona igual desde Chrome, Custom Tabs y WebViews,
// y si Yape no está instalada cae en `browser_fallback_url` — el mismo
// universal link, que ahí sí degrada a la web como último recurso.
//
// En iOS no existe equivalente: el universal link queda tal cual, que es lo
// mejor disponible. Y esto vive en el CLIENTE, no en `pay360-coupon`: el
// servidor no sabe desde qué dispositivo se va a tocar el botón. La conversión
// es mecánica sobre el enlace que el servidor ya mandó — el front sigue sin
// conocer los GUID de Yape.

/** Package Android de Yape (BCP) en el Play Store. */
export const YAPE_ANDROID_PACKAGE = 'com.bcp.innovacxion.yapeapp'

export function isAndroid(userAgent: string): boolean {
  return /android/i.test(userAgent)
}

/**
 * El `href` del botón de pago según el dispositivo.
 *
 * Android → `intent://` apuntado al package de Yape, con el universal link
 * original como fallback si la app no está instalada. Cualquier otro
 * dispositivo, o un enlace que no sea el `https://` esperado, → el enlace del
 * servidor sin tocar: ante la duda, degradar a la web de Yape sigue cobrando
 * (tecleando el código), un intent mal armado no.
 */
export function yapeHref(deeplink: string, userAgent: string): string {
  if (!isAndroid(userAgent)) return deeplink
  let url: URL
  try {
    url = new URL(deeplink)
  } catch {
    return deeplink
  }
  if (url.protocol !== 'https:') return deeplink
  return `intent://${url.host}${url.pathname}${url.search}`
    + `#Intent;scheme=https;package=${YAPE_ANDROID_PACKAGE}`
    + `;S.browser_fallback_url=${encodeURIComponent(deeplink)};end`
}
