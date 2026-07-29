// ─── SALES ENGINE · Reglas de negocio del Checkout ───────────────────────────
// TODA regla de negocio del checkout vive aquí: montos, umbrales, textos, modos
// de cobertura. Cero números mágicos en el JSX. Cambiar el adelanto de S/10 a
// S/15 debe ser editar UNA línea de este archivo.
//
// Lo que NO vive aquí: los precios y las imágenes de los packs. Kross es
// multi-tenant y cada marca tiene los suyos — vienen de `products.packs` en la
// BD. Aquí solo están las REGLAS sobre esos packs (cuál se preselecciona, qué
// badge lleva, cómo se calcula el ahorro).

import type { CoverageMode } from './types'

// ─── Adelanto ────────────────────────────────────────────────────────────────

/** Lima paga 100 % contraentrega: sin adelanto, el flujo más corto. */
export const ADVANCE_LIMA_PEN = 0

/** Provincia adelanta el flete por Yape; el saldo se paga al recibir/recoger. */
export const ADVANCE_PROVINCIA_PEN = 10

// ─── Cobertura ───────────────────────────────────────────────────────────────

/**
 * Modo de cobertura por región. Ambas van por DISTRITO, y es una decisión
 * medida, no una simplificación.
 *
 * Se comparó el veredicto por distrito contra los polígonos del courier usando
 * las 487 sedes de Shalom como muestra de dónde hay gente: **coinciden en el
 * 94,9 % de los casos**. Cobrarle un paso de mapa al 100 % de los compradores
 * para ganar precisión en el 5 % restante cambia conversión por exactitud, y
 * aquí gana la conversión.
 *
 * Los polígonos NO se descartan: se evalúan en silencio cuando existe una
 * coordenada (dirección guardada del comprador, o el pin que captura
 * `AddressBar` en el chat DESPUÉS de cerrar la venta) y su resultado se guarda
 * en el pedido. Sirven para enrutar logística y para negociar cobertura, sin
 * costar un tap.
 */
export const COVERAGE_MODE: Record<'LIMA' | 'PROVINCIA', CoverageMode> = {
  LIMA: 'DISTRICT',
  PROVINCIA: 'DISTRICT',
}

/**
 * Ciudades que van SIEMPRE a agencia aunque el courier declare cobertura a
 * domicilio. Es una palanca operativa: si una ciudad empieza a fallar entregas,
 * se agrega aquí y deja de prometerse domicilio, sin tocar código.
 *
 * Vacío a propósito. La data ya resuelve por sí sola los tres casos que se
 * habían identificado como riesgosos: Tumbes no figura en el tarifario (queda
 * como no cubierto), y los 13 distritos de visita semanal de Cusco se degradan
 * solos por `weekly`. Blacklistear ciudades enteras encima de eso sería
 * castigar compradores que sí reciben en casa.
 */
export const AGENCY_ONLY_CITIES: string[] = []

/**
 * Un punto dentro de zona pero a menos de esta distancia del borde se trata como
 * BORDERLINE. Solo aplica al análisis por polígono (post-venta), no al checkout.
 */
export const BORDERLINE_THRESHOLD_M = 500

// ─── Packs ───────────────────────────────────────────────────────────────────

/**
 * Índice del pack preseleccionado al abrir, contando desde el más caro (0 = el
 * más caro). El anclaje en el pack de 2 unidades es lo que mueve el ticket.
 */
export const DEFAULT_PACK_FROM_TOP = 0

/** Badge del pack recomendado. Configurable por marca más adelante. */
export const BEST_PACK_BADGE = '⭐ MÁS ELEGIDO · MEJOR PRECIO'

/** Muestra el ahorro explícito vs. comprar N unidades sueltas. */
export const SHOW_PACK_SAVINGS = true

// ─── Yape ────────────────────────────────────────────────────────────────────

export const YAPE = {
  /** Deep link móvil. En desktop no existe → se cae a número + copiar + QR. */
  deepLink: 'yape://',
  copiedFeedbackMs: 1500,
} as const

// ─── Verificación del adelanto ───────────────────────────────────────────────

/**
 * Si a los 20 s la verificación sigue PENDING, se deja de bloquear la UI y pasa
 * a validación humana. El comprador no espera más que eso, y el pedido ya está
 * registrado — puede cerrar la ventana sin perderlo.
 */
export const VERIFICATION_TIMEOUT_MS = 20_000

/** Backoff del polling mientras se espera el match (ms). */
export const VERIFICATION_POLL_MS = [1000, 2000, 3000, 5000, 5000] as const

// ─── Comprobante ─────────────────────────────────────────────────────────────

export const VOUCHER = {
  /** El comprador está en 4G y las fotos pesan 4 MB: se comprime en el cliente. */
  maxWidthPx: 1600,
  jpegQuality: 0.8,
  maxBytes: 8 * 1024 * 1024,
  accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
  bucket: 'vouchers',
} as const

// ─── Persistencia ────────────────────────────────────────────────────────────

export const DRAFT_STORAGE_PREFIX = 'kross_checkout:'

/** Un borrador vive 24 h: alcanza para volver del anuncio, no para confundir. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

// ─── Validación ──────────────────────────────────────────────────────────────

export const DNI_LENGTH = 8
export const PHONE_LENGTH_PE = 9
export const PHONE_COUNTRY_CODE_PE = '51'

// ─── Textos ──────────────────────────────────────────────────────────────────
// Centralizados para poder ajustar copy sin tocar componentes. El copy es parte
// de la conversión, así que se versiona igual que el código.

export const COPY = {
  step2Title: '¡Genial! ¿Quién recibe el pedido?',
  dniWhy: 'Para crear tu cuenta y que puedas seguir tu pedido.',
  referencePlaceholder: 'Portón negro, frente a la bodega',

  inZone: '¡Sí llegamos a tu puerta!',
  outOfZone: 'En tu zona la entrega es en agencia.',
  outOfZoneBenefit: 'Recoges cuando quieras, y pagas el resto ahí.',
  agencyNeutral: 'Elige tu agencia de recojo',
  retryDomicilio: 'Prefiero intentar entrega a domicilio',

  advanceHeadsUp: `Para envíos a provincia se paga un adelanto de S/${ADVANCE_PROVINCIA_PEN} y el resto al recibir.`,
  advanceHeadsUpShort: 'El resto lo pagas al recibir tu pedido.',
  voucherRequired: 'Sube tu comprobante para terminar',

  verifying: 'Estamos verificando tu pago…',
  verifyingCanClose: 'Puedes cerrar esta ventana: tu pedido ya está registrado.',
  verifyMatched: '¡Pago confirmado! Tu pedido está en camino.',
  verifyUnmatched: 'Recibimos tu comprobante, un asesor lo está validando.',

  olvaQuestion: '¿En qué agencia Olva vas a recoger?',
  olvaFinderUrl: 'https://www.olvacourier.com/agencias/',
} as const
