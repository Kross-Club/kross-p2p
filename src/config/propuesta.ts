// ─── PROPUESTA DE VALOR (web pública de krossclub.app) ───────────────────────
//
// La promesa comercial de Kross, en un solo archivo. Existe por la misma razón
// que `empresa.ts`: el mismo mensaje se repite en la portada, en el catálogo,
// en el detalle de cada servicio y en los términos, y cuando vive suelto en
// cada JSX se desincroniza en la primera semana.
//
// ⚠️ QUÉ CAMBIÓ, Y POR QUÉ IMPORTA
// Hasta ago-2026 esta web se vendía como "software para comercio
// contraentrega". Ese nombre dejó de describir lo que hace el producto:
// contraentrega significa que TODO el dinero se cobra en la puerta, y Kross
// cobra la mitad o el total **dentro del formulario**, antes de despachar. La
// contraentrega quedó reducida a lo que es acá: la forma de pagar el saldo.
//
// Regla al escribir en este archivo: cada cifra tiene que poder señalarse en
// el producto o en la base. Las que hay hoy salen de
// `docs/ESTADO-OPERATIVO.md` (primer cobro real, 21-ago-2026) y de
// `src/lib/checkout/checkout.config.ts` (`ADVANCE_HALF_SHARE`).

import { ADVANCE_HALF_SHARE } from '../lib/checkout/checkout.config'

/** La mitad del pedido, escrita como porcentaje: 0.5 → "50 %". */
export const ADELANTO_MINIMO_PCT = `${Math.round(ADVANCE_HALF_SHARE * 100)} %`

/** Titulares. El titular es la bajada del lockup (manual §3.4). */
export const MENSAJES = {
  titular: 'La tecnología de tu tienda',
  bajada:
    'Kross le cobra a tu cliente la mitad o el total del pedido dentro del mismo ' +
    'formulario, con Yape, y da el pago por cobrado solo. Recién ahí el pedido entra ' +
    'a despacho.',
  /** Una línea, para el pie y los metadatos. */
  resumen:
    'Software peruano para tiendas que cobran antes de despachar: cobro con Yape ' +
    'validado automático, despacho y recompra en una sola app con tu marca.',
  /** Cómo se describe el servicio en documentos legales y comprobantes. */
  legal:
    'plataforma de software por suscripción para tiendas en línea: cobro del pedido ' +
    'con Yape, gestión de despacho y campañas de recompra',
} as const

/** Las tres cifras del hero. Ninguna es redonda porque ninguna es inventada. */
export const CIFRAS: { dato: string; etiqueta: string }[] = [
  { dato: `${ADELANTO_MINIMO_PCT} o 100 %`, etiqueta: 'del pedido, cobrado antes de despachar' },
  { dato: '6.6 s', etiqueta: 'del yape al pedido confirmado, en el primer cobro real' },
  { dato: '0', etiqueta: 'capturas de pantalla que alguien tenga que revisar' },
]

export type IconoPilar = 'cobro' | 'venta' | 'despacho' | 'recompra'

/** Qué hace el producto, en el orden en que lo vive una tienda. */
export const PILARES: { icono: IconoPilar; titulo: string; texto: string }[] = [
  {
    icono: 'cobro',
    titulo: 'Cobra',
    texto:
      'Tu cliente adelanta la mitad del pedido o lo paga completo, en el paso 3 del ' +
      'checkout. El monto lo calcula el servidor —nunca el navegador— y un botón abre ' +
      'Yape con la cifra ya puesta.',
  },
  {
    icono: 'venta',
    titulo: 'Vende',
    texto:
      'Checkout guiado de tres pasos, DNI que autocompleta los datos, y el chat del ' +
      'pedido donde tu equipo cierra al que se quedó a medias, con llamada grabada si ' +
      'hace falta.',
  },
  {
    icono: 'despacho',
    titulo: 'Despacha',
    texto:
      'Cobertura por distrito de Lima y Callao, agencias de provincia con su tarifa y ' +
      'sus sedes, y motorizados con la ruta y el estado real de cada entrega.',
  },
  {
    icono: 'recompra',
    titulo: 'Retiene',
    texto:
      'Puntos que se canjean en el siguiente pedido, recordatorios de reposición y ' +
      'campañas por WhatsApp sobre el historial de compra de cada cliente.',
  },
]

/**
 * Contraentrega vs. Kross. Es la sección que más trabaja de la portada: el
 * mercado da por hecho que un software COD cobra todo en la puerta, y esa
 * suposición es justo la que hay que romper antes de hablar de precios.
 */
export const COMPARATIVA: { tema: string; cod: string; kross: string }[] = [
  {
    tema: 'Cuándo entra la plata',
    cod: 'Cuando el motorizado toca la puerta. Si toca.',
    kross: 'En el formulario, antes de que el paquete salga.',
  },
  {
    tema: 'Cuánto pone tu cliente',
    cod: 'Nada. Su pedido no le cuesta nada hasta que lo recibe.',
    kross: 'La mitad del pedido, o el total si prefiere ganar puntos.',
  },
  {
    tema: 'Quién confirma el pago',
    cod: 'Un asesor mirando capturas de pantalla en el chat.',
    kross: 'Nadie. La confirmación llega firmada y cruza sola con el pedido.',
  },
  {
    tema: 'Qué llega al despacho',
    cod: 'Pedidos sin confirmar, con el flete jugado a que abran.',
    kross: 'Pedidos con el adelanto ya cobrado.',
  },
  {
    tema: 'Si no abren la puerta',
    cod: 'Pagaste ida y vuelta, y el paquete regresa.',
    kross: 'El adelanto está cobrado y el pedido se reprograma.',
  },
]

/** Cómo entra la plata, paso por paso. Es el flujo real del checkout. */
export const PASOS_COBRO: { titulo: string; texto: string }[] = [
  {
    titulo: 'Tu cliente arma su pedido',
    texto:
      'Elige su pack, escribe su DNI —que trae su nombre— y su dirección se valida ' +
      'contra tu cobertura. Tres pasos, sin cuenta ni contraseña.',
  },
  {
    titulo: 'Elige cuánto adelanta',
    texto:
      'La mitad del pedido o el total. El monto sale del precio ya con descuentos y ' +
      'puntos aplicados, redondeado al sol.',
  },
  {
    titulo: 'Paga con Yape',
    texto:
      'Un botón abre Yape con el monto fijado por el cupón. Sin número que copiar, sin ' +
      'captura que mandar, sin código de tres dígitos que dictar.',
  },
  {
    titulo: 'El pedido queda cobrado',
    texto:
      'La confirmación entra firmada, se cruza con el pedido y el chat se lo avisa a tu ' +
      'cliente. En el primer cobro real fueron 6.6 segundos.',
  },
]

/**
 * Lo que sostiene la promesa de cobro. Va junto al flujo: quien evalúa mover su
 * plata por acá pregunta esto antes que el precio.
 */
export const GARANTIAS: string[] = [
  'El monto nunca viaja en el enlace: lo resuelve Yape leyendo el cupón, del lado del servidor.',
  'Kross es partner de la pasarela y cada marca es un negocio bajo esa cuenta: no pegas llaves de pago ni tramitas acreditación PCI.',
  'El saldo se paga al recibir, o desde la app cuando el pedido ya salió a la agencia.',
  'Si tu marca todavía no tiene el cobro conectado, el pedido se cierra igual y el adelanto lo coordina tu asesor por el chat.',
]
