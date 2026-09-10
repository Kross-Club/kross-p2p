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
