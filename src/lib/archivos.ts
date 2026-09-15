// ─── Los archivos, servidos por NUESTRO dominio ──────────────────────────────
//
// La hoja de guía de un pedido vivía en
// `https://<ref>.supabase.co/storage/v1/object/public/shalom-guias/…`, y ese
// enlace es el que el comprador abre en una pestaña y el que viaja por
// WhatsApp. O sea: la marca manda a su cliente a un dominio que no es suyo ni
// nuestro, con el identificador de nuestro proyecto a la vista.
//
// ⚠️ Esto NO es una medida de seguridad, y conviene no confundirlo: la URL y la
// llave anónima de Supabase están en el bundle a propósito —lo que protege los
// datos es RLS—, y quien mire la pestaña de red las encuentra igual. Lo que se
// arregla acá es de marca blanca: la dirección que la persona VE.
//
// El truco no tiene runtime. `vercel.json` reescribe `/archivos/*` contra el
// storage, así que el archivo se sirve desde el host por el que entró —el
// dominio propio de la marca o su subdominio— sin pasar por una función.
//
// Sin React ni DOM, para poder probarse.

import { baseDeLaTienda } from './dominio'
import type { TiendaConDominio } from './dominio'

/** El prefijo que atiende la reescritura del hosting. */
export const RUTA_ARCHIVOS = '/archivos'

const PUBLICO = '/storage/v1/object/public/'

/**
 * Una URL pública de NUESTRO storage, como ruta de nuestro dominio.
 *
 * Cualquier otra cosa se devuelve intacta, y esa es la parte que importa: el
 * PDF de una guía puede ser nuestro o del propio courier —Olva sirve su rótulo
 * desde su dominio—, y reescribir el de un tercero lo rompería.
 */
export function rutaDeArchivo(url: string | null | undefined): string | null {
  const crudo = String(url ?? '').trim()
  if (!crudo) return null
  let u: URL
  try {
    u = new URL(crudo)
  } catch {
    return crudo   // ya es relativa: nada que reescribir
  }
  if (!/\.supabase\.co$/i.test(u.hostname)) return crudo
  const i = u.pathname.indexOf(PUBLICO)
  if (i < 0) return crudo
  return `${RUTA_ARCHIVOS}/${u.pathname.slice(i + PUBLICO.length)}${u.search}`
}

/** ¿La tienda ya sabe dónde vive? Sin slug ni dominio (el contexto aún no
 *  cargó) no hay base que armar, y `https://krossclub.app/...` —la raíz de la
 *  plataforma— es justo la dirección que NUNCA debe salir en un enlace. */
const conDireccion = (t: TiendaConDominio | null | undefined): boolean =>
  !!(String(t?.slug ?? '').trim() || String(t?.custom_domain ?? '').trim())

/**
 * El enlace de un archivo nuestro, ABSOLUTO y por el dominio de la tienda:
 * su dominio propio si está verificado, si no su subdominio. Es lo que se
 * copia, se reenvía y se abre en otra pestaña —desde el pedido del comprador
 * y desde el panel del vendedor por igual—, y en el panel el vendedor puede
 * estar en un host que no es el de la marca (15-set-2026): un enlace relativo
 * saldría por ese host. Un archivo de un tercero (el rótulo de Olva) se
 * devuelve intacto; sin tienda resuelta, la ruta relativa de siempre.
 */
export function enlaceDeArchivoDeTienda(tienda: TiendaConDominio | null | undefined, url: string | null | undefined): string | null {
  const ruta = rutaDeArchivo(url)
  if (!ruta) return null
  if (!ruta.startsWith(`${RUTA_ARCHIVOS}/`)) return ruta
  return conDireccion(tienda) ? `${baseDeLaTienda(tienda)}${ruta}` : ruta
}

/** Un enlace relativo de la app (`/guia/<token>`, `/comprobante/<id>`),
 *  absoluto por el dominio de la tienda. Misma regla que el archivo. */
export function enlaceDeTienda(tienda: TiendaConDominio | null | undefined, ruta: string): string {
  return conDireccion(tienda) && ruta.startsWith('/') ? `${baseDeLaTienda(tienda)}${ruta}` : ruta
}
