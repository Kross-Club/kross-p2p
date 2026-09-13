// ─── Darse de alta solo: las reglas ──────────────────────────────────────────
//
// La mitad PURA del alta automática (§54). Qué subdominio le toca a una marca,
// qué token identifica una intención de compra, y qué se acepta de un
// formulario que llena un desconocido. Sin Deno y sin base: lo importan las
// Edge Functions, la landing y vitest, y así el subdominio que se le PROMETE al
// comerciante en la pantalla es exactamente el que se le CREA.
//
// Que las dos mitades coincidan no es cosmético: el visitante ve
// «monoshop.krossclub.app» antes de pagar, y si el servidor derivara otro, lo
// primero que pasa después de cobrarle $67 es que su tienda no está donde le
// dijimos.

// ─── El subdominio ───────────────────────────────────────────────────────────

/** Lo que no se puede tomar: son partes de nuestro propio espacio. Es la misma
 *  lista que `manage-store` ya enforzaba; vive acá para que la landing pueda
 *  rechazarlo antes de cobrar en vez de después. */
export const SLUGS_RESERVADOS = new Set([
  'www', 'app', 'api', 'admin', 'kross', 'krossclub', 'mail', 'assets',
  // Rutas de la propia web que un subdominio homónimo volvería ambiguas.
  'u', 'bienvenido', 'empezar', 'afiliado', 'vendedor', 'pedido', 'comprobante',
])

/**
 * El subdominio que le toca a una marca.
 *
 * **Sin guiones**: «Mono Shop» → `monoshop`, no `mono-shop`. Un subdominio se
 * dicta por teléfono y se escribe en una bio de Instagram; los guiones se
 * pierden en las dos. El precio es que los choques son más probables, y eso ya
 * está resuelto —`slugLibre` le pone sufijo— mientras que un guion mal dictado
 * no lo resuelve nadie.
 */
export function slugDeLaMarca(nombre: string): string {
  return (nombre ?? '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // fuera tildes
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40)
}

/** ¿Sirve como subdominio? Tres caracteres es el piso, igual que el código de
 *  un afiliado: con dos, dos marcas parecidas se pisan. */
export function esSlugValido(slug: string): boolean {
  return /^[a-z0-9]{3,40}$/.test(slug) && !SLUGS_RESERVADOS.has(slug)
}

/**
 * El primer subdominio libre a partir de una marca.
 *
 * `tomado` entra por parámetro —lo responde la base— para que esto siga siendo
 * puro y probable. Devuelve `null` cuando el nombre no da ni para un slug
 * válido (una marca escrita solo con símbolos, por ejemplo).
 *
 * **Por qué hay sufijo y no un error.** Esto corre DESPUÉS de que el
 * comerciante pagó: entre que reservó su subdominio y que Stripe terminó de
 * cobrar pueden pasar minutos, y en ese hueco otro pudo tomarlo. Devolverle un
 * error a alguien que ya pagó no es una opción; `monoshop2` sí.
 */
export function slugLibre(
  nombre: string, tomado: (slug: string) => boolean, maxIntentos = 50,
): string | null {
  const base = slugDeLaMarca(nombre)
  if (!/^[a-z0-9]{3,40}$/.test(base)) return null
  if (!SLUGS_RESERVADOS.has(base) && !tomado(base)) return base
  for (let n = 2; n <= maxIntentos; n++) {
    // Se recorta la base para que el sufijo quepa: un slug de 40 caracteres más
    // un `12` daría 42, y ahí el que se corta es el sufijo — dos marcas
    // distintas terminarían con el mismo subdominio.
    const cand = `${base.slice(0, 40 - String(n).length)}${n}`
    if (!SLUGS_RESERVADOS.has(cand) && !tomado(cand)) return cand
  }
  return null
}

// ─── El token de la intención ────────────────────────────────────────────────
//
// Entre «quiero una tienda» y «la tienda existe» hay un viaje a Stripe y de
// vuelta, y algo tiene que atravesarlo llevando quién es esta persona, qué
// marca pidió y quién la trajo. Eso es una fila de `signups`, y su token es
// cómo se la encuentra.
//
// ⚠️ **El token es una LLAVE**: quien lo tiene puede ponerle la contraseña al
// primer administrador de la tienda que se cree. Es el mismo modelo que el
// token de un pedido —quien tiene el enlace tiene el pedido— pero con más en
// juego, así que además es de UN SOLO USO (`password_set_at`) y caduca.

/** El prefijo que lo distingue de un `store_id`. El webhook mira esto para
 *  saber si le toca CREAR una tienda o enlazar una que ya existía. */
export const PREFIJO_ALTA = 'sg_'

export const esTokenDeAlta = (v: unknown): v is string =>
  typeof v === 'string' && /^sg_[0-9a-f]{32}$/.test(v)

/**
 * Un token nuevo.
 *
 * 128 bits de `crypto.getRandomValues`, no `Math.random()`: esto abre una
 * tienda. `Math.random()` es predecible a partir de unas cuantas salidas, y
 * acá eso significaría poder reclamar la tienda de otro.
 */
export function nuevoTokenDeAlta(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return PREFIJO_ALTA + [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// ─── Lo que llega de un formulario público ───────────────────────────────────

export interface DatosDeAlta {
  marca: string
  nombre: string
}

export type AltaInvalida =
  | 'marca_corta' | 'marca_sin_letras' | 'nombre_corto' | 'slug_reservado'

/**
 * ¿Se puede empezar un alta con esto?
 *
 * Devuelve el motivo o `null` si está bien. **Las mismas reglas en la landing y
 * en el servidor**: la landing las usa para no ofrecer un botón que va a
 * rebotar, y el servidor para no fiarse de la landing.
 *
 * Cuánto se valida es una decisión, no un descuido. Un nombre de persona no se
 * puede comprobar —«Jhoann» y «asdf» se ven igual para un programa— así que se
 * pide largo mínimo y nada más. Lo que sí se comprueba es lo que TIENE
 * consecuencias: que la marca dé un subdominio usable.
 */
export function revisarAlta(d: DatosDeAlta): AltaInvalida | null {
  const marca = (d.marca ?? '').trim()
  const nombre = (d.nombre ?? '').trim()
  if (marca.length < 2) return 'marca_corta'
  if (nombre.length < 2) return 'nombre_corto'
  const slug = slugDeLaMarca(marca)
  if (slug.length < 3) return 'marca_sin_letras'
  if (SLUGS_RESERVADOS.has(slug)) return 'slug_reservado'
  return null
}

/** Lo que se le dice a la persona. En su idioma y accionable: un código de
 *  error en pantalla no le dice a nadie qué corregir. */
export const MOTIVO_DE_ALTA: Record<AltaInvalida, string> = {
  marca_corta: 'Escribe el nombre de tu marca.',
  marca_sin_letras: 'El nombre de tu marca necesita al menos 3 letras o números.',
  nombre_corto: 'Escribe tu nombre.',
  slug_reservado: 'Ese nombre de marca no está disponible. Prueba con otro.',
}
