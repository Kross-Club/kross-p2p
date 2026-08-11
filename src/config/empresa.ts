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
  // Un solo número atiende llamada y WhatsApp. Se declara en los dos campos a
  // propósito: la web ofrece las dos acciones (marcar y escribir) sobre él.
  telefono: '+51 925 951 393',
  whatsapp: '51925951393',
  email: 'equipo@kross.club',
  // No hay buzón aparte para reclamos: llegan al mismo correo del equipo. Si
  // mañana se abre uno dedicado, se cambia aquí y se actualiza la hoja del
  // Libro de Reclamaciones sin tocar nada más.
  emailReclamos: 'equipo@kross.club',
  horario: 'Lunes a viernes de 9:00 a 18:00 h · Sábados de 9:00 a 13:00 h',
  web: 'https://krossclub.app',
  redes: [
    { nombre: 'Instagram', url: 'https://www.instagram.com/krossclub.app/', icono: 'instagram' },
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

/** 51925951393 → "+51 925 951 393". Un número pegado es de los detalles que
 *  hacen ver improvisada una página de contacto. */
export function formatoTelefono(digitos: string): string {
  const d = (digitos ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 && d.startsWith('51')) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  return `+${d}`
}

/** Enlace de WhatsApp con mensaje inicial, o null si aún no hay número. */
export function whatsappLink(mensaje?: string): string | null {
  if (!EMPRESA.whatsapp) return null
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''
  return `https://wa.me/${EMPRESA.whatsapp}${texto}`
}
