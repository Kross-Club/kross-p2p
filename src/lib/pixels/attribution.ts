// ─── SALES ENGINE · Atribución del clic de anuncio ───────────────────────────
// Captura lo que Meta/TikTok necesitan para atar una venta a un anuncio: las
// cookies `_fbp`/`_fbc`/`_ttp` que planta el pixel y los click ids de la URL
// (`fbclid`/`ttclid`). Estos datos viajan con el pedido a `register-buyer` y se
// guardan en la orden, porque el Purchase de CAPI lo dispara el webhook cuando
// el navegador ya no está (ver docs/09-PIXELS-CAPI.md).
//
// Núcleo PURO (`parseAttribution`) + envoltorio DOM (`captureAttribution`): el
// puro se testea sin jsdom, como el resto del repo.

export interface Attribution {
  fbp: string | null
  fbc: string | null
  ttp: string | null
  ttclid: string | null
  sourceUrl: string | null
  userAgent: string | null
}

export interface AttributionInputs {
  /** `document.cookie` crudo: "a=1; b=2". */
  cookieString?: string
  /** `location.search`: "?fbclid=abc&ttclid=xyz". */
  search?: string
  /** `location.href` — va como `event_source_url`. */
  url?: string
  userAgent?: string
  /** Epoch ms para sintetizar `_fbc` desde `fbclid`. Default `Date.now()`. */
  nowMs?: number
}

export const EMPTY_ATTRIBUTION: Attribution = {
  fbp: null, fbc: null, ttp: null, ttclid: null, sourceUrl: null, userAgent: null,
}

/** "a=1; b=2" → Map. Tolera espacios y valores con `=` dentro. */
function parseCookies(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!raw) return map
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k) map.set(k, v)
  }
  return map
}

function queryParam(search: string | undefined, key: string): string | null {
  if (!search) return null
  const s = search.startsWith('?') ? search.slice(1) : search
  for (const pair of s.split('&')) {
    const eq = pair.indexOf('=')
    const k = eq === -1 ? pair : pair.slice(0, eq)
    if (decodeURIComponent(k) !== key) continue
    const v = eq === -1 ? '' : pair.slice(eq + 1)
    try { return decodeURIComponent(v) || null } catch { return v || null }
  }
  return null
}

/**
 * Arma la atribución a partir de cookies + querystring, sin tocar el DOM.
 *
 * `_fbc` es la pieza clave para atar la conversión al anuncio de Meta: si el
 * pixel aún no la plantó pero la URL trae `fbclid`, se sintetiza con el formato
 * oficial `fb.1.<timestamp>.<fbclid>`, que es exactamente lo que el pixel habría
 * guardado. TikTok usa `ttclid` directo como `callback`.
 */
export function parseAttribution(inp: AttributionInputs): Attribution {
  const cookies = parseCookies(inp.cookieString)
  const fbclid = queryParam(inp.search, 'fbclid')
  const now = inp.nowMs ?? Date.now()

  const fbc = cookies.get('_fbc')
    ?? (fbclid ? `fb.1.${now}.${fbclid}` : null)

  return {
    fbp: cookies.get('_fbp') ?? null,
    fbc: fbc ?? null,
    ttp: cookies.get('_ttp') ?? null,
    ttclid: queryParam(inp.search, 'ttclid') ?? cookies.get('_ttclid') ?? null,
    sourceUrl: inp.url ?? null,
    userAgent: inp.userAgent ?? null,
  }
}

/** Lee la atribución del navegador. Nunca lanza: si algo falla devuelve vacío. */
export function captureAttribution(): Attribution {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return EMPTY_ATTRIBUTION
    return parseAttribution({
      cookieString: document.cookie,
      search: window.location.search,
      url: window.location.href,
      userAgent: navigator.userAgent,
    })
  } catch {
    return EMPTY_ATTRIBUTION
  }
}
