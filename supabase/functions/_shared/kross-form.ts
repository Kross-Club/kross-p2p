// ─── KROSS FORM · Lo puro del embed ──────────────────────────────────────────
// Las tres decisiones que el formulario toma sin tocar la base: si el `Origin`
// de quien llama está autorizado, qué dice el mensaje de WhatsApp y a qué URL
// se manda al comprador.
//
// Vive aparte y sin APIs de Deno a propósito, por dos razones:
//   · Lo usan DOS funciones —`embed-order` al crear el pedido y `flow-return`
//     al volver del pago (pieza 5)—, y el mensaje tiene que ser el mismo.
//   · Se importa desde vitest, así que la allowlist y el recorte del texto se
//     prueban con casos y no a ojo.
//
// Ver `docs/18-KROSS-FORM.md` §4 y §7.

/**
 * El host de un `Origin`, normalizado para comparar.
 *
 * Quita el esquema, el puerto y un `www.` de adelante, y baja todo a
 * minúsculas. Lo del `www.` es una comodidad deliberada y no un agujero: hace
 * que un comerciante que escribió `tienda.com` en su allowlist no vea fallar su
 * formulario en `www.tienda.com` —son el mismo sitio— sin abrirle la puerta a
 * ningún otro dominio.
 *
 * Devuelve `''` para cualquier cosa que no sea un origen usable. Un `''` nunca
 * empareja, ni siquiera contra un `''` de la lista: ver `dominioPermitido`.
 */
export function hostDelOrigen(origen: unknown): string {
  const raw = typeof origen === 'string' ? origen.trim() : ''
  if (!raw) return ''
  // Con esquema es un Origin de verdad; sin él, es una línea de la allowlist
  // que el comerciante escribió a mano ("tienda.com", "www.tienda.com/").
  const conEsquema = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let host: string
  try {
    host = new URL(conEsquema).hostname
  } catch {
    return ''
  }
  return host.toLowerCase().replace(/^www\./, '')
}

/**
 * Si este `Origin` puede usar esta llave.
 *
 * La `public_key` viaja en el HTML de la página del comerciante, a la vista de
 * cualquiera, así que **no es lo que autoriza**: lo que autoriza es de dónde
 * viene la petición. Una lista vacía no atiende a nadie —una llave recién
 * creada y sin configurar no debe vender— y un `Origin` ausente tampoco: el
 * navegador lo manda siempre en una petición cross-site, y una sin él no viene
 * de un formulario en una página.
 */
export function dominioPermitido(origen: unknown, permitidos: unknown): boolean {
  const host = hostDelOrigen(origen)
  if (!host || !Array.isArray(permitidos)) return false
  return permitidos.some(d => {
    const h = hostDelOrigen(d)
    return h !== '' && h === host
  })
}

/**
 * El teléfono en el formato que espera `wa.me`: solo dígitos, con código de
 * país. Un celular peruano de 9 dígitos se prefija con 51; uno que ya viene con
 * código se respeta. Devuelve `''` si no queda nada usable — quien llama decide
 * qué hacer, pero nunca se arma un `wa.me/` vacío.
 */
export function telefonoWhatsApp(telefono: unknown): string {
  const digitos = String(telefono ?? '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.length === 9) return `51${digitos}`
  return digitos
}

/** Lo que el mensaje de WhatsApp cuenta del pedido. */
export interface DatosDelMensaje {
  orderId: string
  producto: string
  pack?: string | null
  nombre: string
  telefono: string
  /** Lo que el comprador eligió, ya en palabras ("Lima · a domicilio"). */
  destino: string
  /** Dirección o sede de recojo, si la hay. */
  direccion?: string | null
  /** Precio del pedido, en soles. */
  total: number
  /** Lo que ya pagó. 0 en un pedido contraentrega. */
  adelanto: number
}

/** Tope del texto que viaja en la URL. Un `wa.me` largo se rompe en algunos
 *  navegadores, y lo que no entra ya está en el pedido: la URL es el saludo,
 *  no el registro. */
export const TOPE_MENSAJE = 900

/**
 * El mensaje que el comprador manda a la tienda, con su pedido dentro.
 *
 * Lo escribe ÉL —sale prellenado en su WhatsApp y él toca enviar—, así que
 * está en primera persona. El estado del pago va explícito: es la única duda
 * que le queda, y callarlo hace que el primer mensaje de verdad sea "¿les
 * llegó mi pago?".
 */
export function mensajeWhatsApp(d: DatosDelMensaje): string {
  const saldo = Math.max(0, Math.round(Number(d.total) || 0) - Math.round(Number(d.adelanto) || 0))
  const pago = d.adelanto > 0
    ? (saldo > 0
        ? `Ya adelanté S/${Math.round(d.adelanto)} y me queda un saldo de S/${saldo}.`
        : `Ya pagué el total: S/${Math.round(d.adelanto)}.`)
    : `Pago contraentrega: S/${Math.round(Number(d.total) || 0)} al recibirlo.`

  const lineas = [
    `Hola, acabo de hacer mi pedido ${d.orderId} 👋`,
    '',
    `📦 ${d.producto}${d.pack ? ` · ${d.pack}` : ''}`,
    `👤 ${d.nombre}`,
    `📱 ${d.telefono}`,
    `📍 ${d.destino}`,
    ...(d.direccion ? [`🏠 ${d.direccion}`] : []),
    '',
    `💳 ${pago}`,
  ]
  const texto = lineas.join('\n')
  // Se recorta por el final: lo primero —el código del pedido— es lo que el
  // vendedor necesita para encontrarlo.
  return texto.length <= TOPE_MENSAJE ? texto : `${texto.slice(0, TOPE_MENSAJE - 1)}…`
}

/**
 * El enlace al WhatsApp de la tienda con el mensaje dentro.
 *
 * Devuelve `null` sin un número usable: es mejor que el formulario diga "tu
 * pedido quedó registrado" a que abra un `wa.me/` roto.
 */
export function urlWhatsApp(numeroTienda: unknown, texto: string): string | null {
  const numero = telefonoWhatsApp(numeroTienda)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
