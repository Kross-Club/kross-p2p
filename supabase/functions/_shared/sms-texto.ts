// ─── SMS · los textos y el número — PURO ────────────────────────────────────
//
// Lo que se puede probar sin Deno ni red: cómo se normaliza un celular peruano,
// cómo se escribe un SMS para que quepa y llegue, y qué dice cada aviso. El
// envío (Twilio, `api_events`, `notifications_log`) vive en `sms.ts`.
//
// Por qué existe el riel (05-set-2026, ver `08-RECORDATORIOS-RECOJO.md` y
// `14-EVALUACION-KROSS-CLUB.md`): el comprador de provincia con poca costumbre
// digital no instala la app, no da permiso de push y no vuelve al chat. Lee
// SMS: es el canal de los avisos "oficiales" (banco, Yape, la agencia). Y a
// diferencia de WhatsApp, fija la expectativa de AVISO, no de conversación.
//
// Reglas de cada texto, y ninguna se negocia:
//   1. Empieza con el nombre de la tienda y nombra lo que solo ella sabe
//      (producto, agencia, monto). Es lo que separa el aviso del fraude: en
//      Perú el SMS es también el canal del "tu paquete esta retenido, paga
//      aqui", y el nuestro no puede parecerse.
//   2. NUNCA pide dinero ni lleva un enlace de pago. Dice el monto del saldo y
//      que se paga desde el pedido, nunca en la agencia. El enlace es siempre
//      "tu pedido", al final.
//   3. Sin la palabra "app": quien no sabe qué es una app sí sabe qué es Yape,
//      un enlace y su celular (misma regla que el ticket del checkout).
//   4. Sin tildes ni eñes: con ellas el mensaje se codifica en UCS-2 y el
//      límite por segmento baja de 160 a 70 caracteres —el doble o el triple
//      de costo—. Escribirlos sin tildes es la norma en Perú por ese motivo.

/** Un segmento GSM-7. Pasar de 160 cuesta un segundo segmento; se acepta hasta
 *  dos (306 útiles) porque un aviso con enlace no siempre cabe en uno. */
export const SMS_SEGMENTO = 160
export const SMS_MAX = 306

/**
 * Celular peruano en E.164. Acepta lo que la gente escribe: "999 111 222",
 * "+51 999111222", "0051999111222", "51999111222". Devuelve `null` si no es
 * un celular de Perú (los fijos no reciben SMS; un número extranjero no es el
 * caso de este producto).
 */
export function celularPeru(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^00/, '')
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2)
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1)
  if (d.length !== 9 || !d.startsWith('9')) return null
  return `+51${d}`
}

const REEMPLAZOS: Record<string, string> = {
  'ñ': 'n', 'Ñ': 'N', '¿': '', '¡': '', '·': '-', '—': '-', '–': '-', '…': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'", '€': 'EUR',
}

/**
 * Deja el texto en el alfabeto GSM-7 básico: sin tildes, sin eñes, sin emoji,
 * sin los caracteres que cuentan doble ([ ] { } \ ~ ^ |). Lo que no se puede
 * traducir se quita. Y colapsa espacios: un SMS no tiene párrafos.
 */
export function textoSms(s: string): string {
  let t = String(s ?? '')
  for (const [de, a] of Object.entries(REEMPLAZOS)) t = t.split(de).join(a)
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Solo ASCII imprimible: lo demás (emoji, símbolos) no viaja bien en GSM-7.
  t = t.replace(/[^\x20-\x7E\n]/g, '')
  t = t.replace(/[\[\]{}\\~^|]/g, '')
  return t.replace(/\s+/g, ' ').trim()
}

/** Cuántos segmentos cobra el operador por este texto (ya en GSM-7). */
export function segmentosSms(t: string): number {
  if (t.length <= SMS_SEGMENTO) return 1
  return Math.ceil(t.length / 153)
}

/** Recorta al máximo sin partir el enlace, que siempre va al final. */
export function recortarSms(t: string, max = SMS_MAX): string {
  if (t.length <= max) return t
  const enlace = /(https?:\/\/\S+)\s*$/.exec(t)?.[1]
  if (!enlace) return t.slice(0, max - 3).trimEnd() + '...'
  const cuerpo = t.slice(0, t.length - enlace.length).trimEnd()
  const cabe = max - enlace.length - 4
  return `${cuerpo.slice(0, Math.max(0, cabe)).trimEnd()}... ${enlace}`
}

/** El enlace del pedido en el subdominio de la marca: es el camino de regreso
 *  de quien no instaló nada. Sin slug cae al host de la plataforma. */
export function enlaceDelPedido(slug: string | null | undefined, token: string | null | undefined): string | null {
  if (!token) return null
  return slug ? `https://${slug}.krossclub.app/p/${token}` : `https://krossclub.app/p/${token}`
}

const soles = (n: number) => `S/${Math.max(0, Math.round(n))}`

/**
 * El acuse del pago, por SMS. Es EL recibo que se lleva quien no volverá a
 * abrir la app: qué pagó, de qué pedido, qué sigue y por dónde volver. No
 * menciona el saldo: un SMS que habla de plata pendiente con un enlace es la
 * forma exacta del fraude.
 */
export function smsPagoRecibido(i: {
  tienda: string; monto: number; codigo?: string | null; recojo: boolean; link: string | null
}): string {
  const pedido = i.codigo ? ` (pedido ${i.codigo})` : ''
  const sigue = i.recojo
    ? 'Te avisaremos cuando llegue a la agencia.'
    : 'Te avisaremos cuando salga a tu direccion.'
  return arma(`${i.tienda}: recibimos tu pago de ${soles(i.monto)}${pedido}. ${sigue}`, i.link)
}

/** El saldo entró: ya no debe nada y la clave está en su pedido. */
export function smsSaldoRecibido(i: { tienda: string; monto: number; codigo?: string | null; link: string | null }): string {
  const pedido = i.codigo ? ` (pedido ${i.codigo})` : ''
  return arma(`${i.tienda}: recibimos tu saldo de ${soles(i.monto)}${pedido}. Ya no debes nada. Tu clave de recojo esta en tu pedido.`, i.link)
}

/** La guía ya existe: el número es lo que la agencia pregunta. */
export function smsGuia(i: { tienda: string; courier: string; ids: string; link: string | null }): string {
  return arma(`${i.tienda}: tu pedido ya tiene guia ${nombreCourier(i.courier)} (${i.ids}). Lleva tu DNI para recogerlo.`, i.link)
}

/**
 * El paquete llegó a la agencia. Con saldo, dice cuánto y CÓMO se paga —desde
 * el pedido, nunca en la agencia— sin pedirlo aquí. Sin saldo, la clave ya
 * está en el pedido.
 */
export function smsLlegoAgencia(i: { tienda: string; agencia: string; saldo: number; link: string | null }): string {
  const cuerpo = i.saldo > 0
    ? `${i.tienda}: tu pedido llego a ${nombreCourier(i.agencia)}. Lleva tu DNI. Tu saldo de ${soles(i.saldo)} se paga con Yape desde tu pedido, nunca en la agencia.`
    : `${i.tienda}: tu pedido llego a ${nombreCourier(i.agencia)}. Lleva tu DNI y tu clave de recojo, que esta en tu pedido.`
  return arma(cuerpo, i.link)
}

/**
 * Paso 2 de la cascada (día 2): sigue esperándote. Corto a propósito — el que
 * no fue en dos días no necesita más información, necesita acordarse.
 */
export function smsRecordatorioRecojo(i: { tienda: string; agencia: string; saldo: number; link: string | null }): string {
  const cuerpo = i.saldo > 0
    ? `${i.tienda}: tu pedido sigue esperandote en ${nombreCourier(i.agencia)}. Paga tu saldo de ${soles(i.saldo)} desde tu pedido y recogelo con tu DNI.`
    : `${i.tienda}: tu pedido sigue esperandote en ${nombreCourier(i.agencia)}. Recogelo con tu DNI y tu clave, que esta en tu pedido.`
  return arma(cuerpo, i.link)
}

/**
 * Paso 3 (día 4): el último aviso, con la FECHA en que la agencia lo devuelve.
 * Un plazo real y verificable es lo que mueve al que ya ignoró dos mensajes;
 * "no te olvides" no mueve a nadie. Sin mayúsculas ni signos de alarma: el
 * dato asusta lo suficiente, y un SMS que grita se lee como estafa.
 */
export function smsUltimoAvisoRecojo(i: { tienda: string; agencia: string; fecha: string; link: string | null }): string {
  return arma(
    `${i.tienda}: ultimo aviso. ${nombreCourier(i.agencia)} devuelve tu pedido el ${i.fecha} y despues ya no podremos entregartelo. Recogelo con tu DNI.`,
    i.link,
  )
}

/** Un aviso genérico (mensaje del equipo, llamada perdida): el cuerpo que ya
 *  se usó en el push, recortado, con la tienda adelante y el enlace atrás. */
export function smsGenerico(i: { tienda: string; cuerpo: string; link: string | null }): string {
  return arma(`${i.tienda}: ${textoSms(i.cuerpo).slice(0, 110).trimEnd()}`, i.link)
}

function arma(cuerpo: string, link: string | null): string {
  const t = textoSms(cuerpo)
  return recortarSms(link ? `${t} Tu pedido: ${link}` : t)
}

function nombreCourier(a: string): string {
  const u = String(a ?? '').toUpperCase()
  if (u === 'SHALOM') return 'Shalom'
  if (u === 'OLVA') return 'Olva'
  return a || 'la agencia'
}
