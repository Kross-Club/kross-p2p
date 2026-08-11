// ─── DATOS DEL COMERCIO (web pública de krossclub.app) ───────────────────────
//
// Todo lo que Culqi, INDECOPI y el comprador tienen que poder leer sale de AQUÍ.
// Un solo archivo: si mañana cambia el número de atención o el domicilio fiscal,
// se cambia una vez y se actualiza el footer, la página de contacto, los
// términos, la política de devoluciones y la hoja del Libro de Reclamaciones.
//
// ⚠️ CAMPOS PENDIENTES
// Los que están en blanco ('') NO se inventan: un RUC o un domicilio fiscal
// falso en una página legal es peor que no tenerla. Mientras estén vacíos:
//   · la web los oculta en producción (no muestra filas a medias), y
//   · en desarrollo sale un aviso en pantalla listando lo que falta.
// Complétalos antes de mandar la web a revisión de Culqi.

export interface RedSocial {
  /** Nombre visible de la red. */
  nombre: string
  /** URL de la cuenta REAL. Culqi rechaza iconos que no llevan a ningún lado. */
  url: string
  /** Clave del icono en `RedIcon`. */
  icono: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'youtube' | 'whatsapp'
}

export interface Empresa {
  /** Nombre comercial (el que ve el público). */
  marca: string
  /** Razón social inscrita en SUNARP/SUNAT. */
  razonSocial: string
  /** RUC de 11 dígitos. */
  ruc: string
  /** Domicilio fiscal completo (calle, número, distrito, provincia, país). */
  domicilioFiscal: string
  /** Teléfono de atención en formato internacional: +51 1 xxx xxxx. */
  telefono: string
  /** Solo dígitos con código de país, para el enlace wa.me: 51XXXXXXXXX. */
  whatsapp: string
  /** Correo de atención al cliente. */
  email: string
  /** Correo al que llegan las hojas del Libro de Reclamaciones. */
  emailReclamos: string
  /** Horario de atención, en texto. */
  horario: string
  /** Dominio público, con https. */
  web: string
  redes: RedSocial[]
}

export const EMPRESA: Empresa = {
  marca: 'Kross',
  razonSocial: '',            // ⚠️ COMPLETAR — p. ej. "KROSS CLUB S.A.C."
  ruc: '',                    // ⚠️ COMPLETAR — 11 dígitos
  domicilioFiscal: '',        // ⚠️ COMPLETAR — dirección fiscal completa
  telefono: '',               // ⚠️ COMPLETAR — p. ej. "+51 1 700 0000"
  whatsapp: '',               // ⚠️ COMPLETAR — solo dígitos, p. ej. "51987654321"
  email: '',                  // ⚠️ COMPLETAR — p. ej. "hola@krossclub.app"
  emailReclamos: '',          // ⚠️ COMPLETAR — p. ej. "reclamos@krossclub.app"
  horario: 'Lunes a viernes de 9:00 a 18:00 h · Sábados de 9:00 a 13:00 h',
  web: 'https://krossclub.app',
  redes: [
    // ⚠️ COMPLETAR con las cuentas REALES y borrar las que no existan.
    // Un icono de red que no lleva a la cuenta es observación directa de Culqi.
    // { nombre: 'Instagram', url: 'https://instagram.com/…', icono: 'instagram' },
    // { nombre: 'TikTok',    url: 'https://tiktok.com/@…',   icono: 'tiktok' },
  ],
}

/** Plazo legal de respuesta del Libro de Reclamaciones (Ley 29571, art. 24). */
export const PLAZO_RESPUESTA_HABILES = 15

/** Etiquetas legibles de cada campo, para el aviso de "falta completar". */
const ETIQUETAS: Record<string, string> = {
  razonSocial: 'Razón social',
  ruc: 'RUC',
  domicilioFiscal: 'Domicilio fiscal',
  telefono: 'Teléfono de atención',
  whatsapp: 'WhatsApp',
  email: 'Correo de atención',
  emailReclamos: 'Correo de reclamaciones',
}

/**
 * Campos obligatorios que siguen en blanco. La web los usa para no pintar filas
 * vacías y, en desarrollo, para avisar en pantalla qué falta antes de la
 * revisión de Culqi.
 */
export function camposPendientes(): string[] {
  const faltan = Object.keys(ETIQUETAS)
    .filter((k) => !EMPRESA[k as keyof Empresa])
    .map((k) => ETIQUETAS[k])
  if (EMPRESA.redes.length === 0) faltan.push('Redes sociales')
  return faltan
}

/** Enlace de WhatsApp con mensaje inicial, o null si aún no hay número. */
export function whatsappLink(mensaje?: string): string | null {
  if (!EMPRESA.whatsapp) return null
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''
  return `https://wa.me/${EMPRESA.whatsapp}${texto}`
}
