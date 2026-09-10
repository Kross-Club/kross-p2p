// ─── En qué dirección vive una tienda — PURO ─────────────────────────────────
//
// Una marca vive en `<slug>.krossclub.app` y, desde el 09-set-2026, puede
// además tener su DOMINIO PROPIO (§50) apuntando un CNAME a nuestro hosting.
//
// Vive acá, en `_shared`, y NO en `src/lib`, porque las dos mitades tienen que
// contestar lo mismo: el navegador arma enlaces relativos, pero los que viajan
// por WhatsApp y SMS los escribe el servidor, y si cada lado decidiera por su
// cuenta un comprador podría recibir un enlace a un host y encontrarse la marca
// en otro. `src/lib/dominio.ts` lo reexporta; el precedente es `alcance.ts`.

/** El dominio de la plataforma. Todo lo que cuelgue de acá es NUESTRO. */
export const APEX = 'krossclub.app'

/** Lo que una marca escribe puede venir de cualquier forma. */
export interface DominioValido { ok: true; dominio: string }
export interface DominioInvalido { ok: false; motivo: string }
export type Dominio = DominioValido | DominioInvalido

const ETIQUETA = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^[a-z]{2,}$/

/**
 * Normaliza y valida lo que se tecleó en el panel.
 *
 * Acepta lo que la gente pega de verdad —`https://monoshop.pe/`, con espacios,
 * en mayúsculas, con el punto final del FQDN— y devuelve el host a secas.
 */
export function normalizarDominio(crudo: string): Dominio {
  let d = String(crudo ?? '').trim().toLowerCase()
  if (!d) return { ok: false, motivo: 'Escribe el dominio.' }
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')  // protocolo
  d = d.split('/')[0].split('?')[0].split('#')[0]
  d = d.split('@').pop() ?? d                    // por si pegaron un correo
  d = d.split(':')[0]                            // puerto
  d = d.replace(/\.+$/, '')                      // el punto final del FQDN
  if (!d) return { ok: false, motivo: 'Escribe el dominio.' }
  if (d.length > 253) return { ok: false, motivo: 'Ese dominio es demasiado largo.' }
  // Sin IDN: convertir a punycode acá sería adivinar. Se pide en su forma
  // `xn--`, que es la que el registrador ya sabe dar. Solo caracteres de
  // verdad NO ASCII — un espacio o un guion bajo son otro error y merecen
  // otro mensaje, más abajo.
  if (/[^\x00-\x7f]/.test(d)) {
    return { ok: false, motivo: 'Usa solo letras sin tildes ni ñ. Si tu dominio las lleva, escribe su forma «xn--».' }
  }
  // Los hosts reservados van ANTES de mirar la forma: `localhost` es una sola
  // etiqueta, y contestarle «falta la terminación» manda a arreglar lo que no
  // está mal.
  if (d === APEX || d.endsWith(`.${APEX}`)) {
    return { ok: false, motivo: `Ese es el dominio de Kross. Tu subdominio de ${APEX} se cambia arriba, en la dirección de la tienda.` }
  }
  if (d.endsWith('vercel.app') || d === 'localhost' || d.endsWith('.localhost')) {
    return { ok: false, motivo: 'Ese dominio es del hosting, no puede ser el de una tienda.' }
  }
  if (/^\d+(\.\d+)*$/.test(d)) return { ok: false, motivo: 'Eso es una dirección IP, no un dominio.' }
  const partes = d.split('.')
  if (partes.length < 2) return { ok: false, motivo: 'Falta la terminación: escríbelo completo, como monoshop.pe.' }
  if (!partes.every(p => ETIQUETA.test(p))) {
    return { ok: false, motivo: 'Solo letras, números y guiones, y ninguna parte puede empezar o terminar en guion.' }
  }
  if (!TLD.test(partes[partes.length - 1])) return { ok: false, motivo: 'La terminación no parece válida.' }
  return { ok: true, dominio: d }
}

/** Un host servido por la plataforma: el apex, sus subdominios y el desarrollo. */
export function esHostDePlataforma(host: string): boolean {
  const h = String(host ?? '').toLowerCase().split(':')[0].replace(/\.+$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (/^\d+(\.\d+)*$/.test(h)) return true
  if (h.endsWith('vercel.app')) return true
  return h === APEX || h.endsWith(`.${APEX}`)
}

/**
 * El host y su gemelo con o sin `www`.
 *
 * Un dominio raíz y su `www` son hosts DISTINTOS para el DNS y para nosotros,
 * pero la misma tienda para cualquier persona. Y cuál de los dos termina
 * sirviendo la app no lo decide el panel: lo decide el hosting, que redirige
 * uno al otro según cuál se marcó como principal. Guardar `monoshop.fit` y que
 * el hosting sirva `www.monoshop.fit` dejaba al comprador en la marca genérica
 * de Kross — la tienda existía y no se encontraba.
 *
 * Así que se buscan los dos y da igual cuál se haya escrito. Es una sola
 * consulta con `IN`, no dos viajes.
 */
export function variantesDeDominio(host: string): string[] {
  const h = String(host ?? '').toLowerCase().split(':')[0].replace(/\.+$/, '')
  if (!h) return []
  return h.startsWith('www.') ? [h, h.slice(4)] : [h, `www.${h}`]
}

/** Cómo hay que buscar la tienda de este host. */
export type Resolucion =
  | { por: 'slug'; valor: string }
  | { por: 'dominio'; valor: string }
  | null

/**
 * De un host a la forma de encontrar su marca.
 *
 * `null` es la plataforma: `krossclub.app`, `www`, el desarrollo y los previews
 * del hosting. Todo host que NO es nuestro se busca como dominio propio — no se
 * puede saber de antemano cuál pertenece a quién, y quien no exista cae en la
 * marca genérica igual que hoy.
 */
export function comoResolver(host: string, storeParam?: string | null): Resolucion {
  const forzado = String(storeParam ?? '').trim()
  if (forzado) return { por: 'slug', valor: forzado }
  const h = String(host ?? '').toLowerCase().split(':')[0].replace(/\.+$/, '')
  if (!h) return null
  if (/^\d+(\.\d+)*$/.test(h)) return null
  if (h === 'localhost') return null
  // `<slug>.localhost`: el desarrollo con subdominio.
  if (h.endsWith('.localhost')) return { por: 'slug', valor: h.split('.')[0] }
  if (h.endsWith('vercel.app')) return null
  if (h === APEX || h === `www.${APEX}`) return null
  if (h.endsWith(`.${APEX}`)) {
    const sub = h.slice(0, -(APEX.length + 1))
    // `a.b.krossclub.app` no es de nadie; y `www`/`app` son de la plataforma.
    if (sub.includes('.') || ['www', 'app'].includes(sub)) return null
    return { por: 'slug', valor: sub }
  }
  return { por: 'dominio', valor: h }
}

/** Lo mínimo que hace falta para saber dónde vive una tienda. */
export interface TiendaConDominio {
  slug?: string | null
  custom_domain?: string | null
  custom_domain_verified?: boolean | null
}

/**
 * La dirección pública de una marca, sin barra final.
 *
 * ⚠️ El dominio propio manda **solo si está verificado**. Lo que se arma con
 * esto son enlaces que viajan por WhatsApp y SMS y se abren horas después:
 * mandar a un DNS que todavía no resuelve —o a un host sin certificado— pierde
 * al comprador, y eso es peor que no ofrecer la función. Mientras tanto, el
 * subdominio de siempre, que nunca deja de atender.
 */
export function baseDeLaTienda(tienda: TiendaConDominio | null | undefined): string {
  const propio = String(tienda?.custom_domain ?? '').trim()
  if (propio && tienda?.custom_domain_verified) return `https://${propio}`
  const slug = String(tienda?.slug ?? '').trim()
  return slug ? `https://${slug}.${APEX}` : `https://${APEX}`
}
