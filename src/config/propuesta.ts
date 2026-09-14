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
// cobra el pedido **dentro del formulario**, antes de despachar.
//
// Y desde set-2026 el foco es otro (14-set-2026): **marcas con stock** —tienen
// el producto, hacen contenido orgánico y anuncios, son formales, cierran
// menos de 100 pedidos al mes con dos a cuatro vendedores en WhatsApp Web y
// cuidan al cliente—. Esas marcas cobran **el pedido completo** antes de
// despachar; «la mitad ahora» es una opción que cada producto enciende. Así
// que la portada ya no discute contra la contraentrega: habla de la marca y de
// la experiencia de su cliente.
//
// Regla al escribir en este archivo: cada cifra tiene que poder señalarse en
// el producto o en la base. Las que hay hoy salen de
// `docs/ESTADO-OPERATIVO.md` (primer cobro real, 21-ago-2026) y de
// `src/lib/checkout/checkout.config.ts` (`ADVANCE_HALF_SHARE`).

import { ADVANCE_HALF_SHARE } from '../lib/checkout/checkout.config'

/** La mitad del pedido, escrita como porcentaje: 0.5 → "50 %". Es lo que un
 *  producto puede permitir como pago parcial; el default es el total. */
export const ADELANTO_MINIMO_PCT = `${Math.round(ADVANCE_HALF_SHARE * 100)} %`

/** Titulares. El titular es la bajada del lockup (manual §3.4). */
export const MENSAJES = {
  titular: 'La tecnología de tu tienda',
  bajada:
    'Kross le cobra a tu cliente el pedido completo dentro del mismo formulario, con ' +
    'Yape, y da el pago por cobrado solo. Recién ahí el pedido entra a despacho, y tu ' +
    'cliente lo sigue desde una app con tu marca.',
  /** Una línea, para el pie y los metadatos. */
  resumen:
    'Software peruano para marcas que cobran antes de despachar: cobro con Yape ' +
    'validado automático, despacho y recompra en una sola app con tu marca.',
  /** Cómo se describe el servicio en documentos legales y comprobantes. */
  legal:
    'plataforma de software por suscripción para tiendas en línea: cobro del pedido ' +
    'con Yape, gestión de despacho y campañas de recompra',
} as const

/** Las tres cifras del hero. Ninguna es redonda porque ninguna es inventada. */
export const CIFRAS: { dato: string; etiqueta: string }[] = [
  { dato: '100 %', etiqueta: 'del pedido, cobrado antes de despachar' },
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
      'Tu cliente paga el pedido completo en el paso 3 del checkout —o la mitad, si tú lo ' +
      'permites en ese producto—. El monto lo calcula el servidor —nunca el navegador— y ' +
      'un botón abre Yape con la cifra ya puesta.',
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
 * Para quién es. Reemplaza a la comparativa contra la contraentrega (set-2026):
 * el cliente de Kross no es el que juega el flete a que abran la puerta, es la
 * marca que ya tiene el producto y quiere que comprarle se sienta como comprarle
 * a una marca. Se dice con señas concretas, no con adjetivos.
 */
export const PARA_QUIEN: { titulo: string; texto: string; senas: string[] } = {
  titulo: 'Para marcas que ya tienen el producto',
  texto:
    'Kross está hecho para la marca con stock que vende con contenido y anuncios, cierra ' +
    'sus pedidos por WhatsApp con dos a cuatro vendedores y cobra antes de despachar. ' +
    'Si hoy anotas los pedidos a mano y validas yapes mirando capturas, es para ti.',
  senas: [
    'Tienes el producto en tu almacén y despachas tú o con tu agencia.',
    'Vendes con contenido orgánico y anuncios en Meta o TikTok.',
    'Cierras por WhatsApp Web con un equipo de dos a cuatro vendedores.',
    'Cobras el pedido antes de enviarlo y cuidas a quien te compra.',
  ],
}

/**
 * La marca y la experiencia de su cliente. Es la sección que más trabaja de la
 * portada: lo que la marca compra no es un cobrador, es que su cliente viva la
 * compra bajo su nombre, desde el celular, sin que nadie del equipo lo persiga.
 */
export const EXPERIENCIA: { titulo: string; texto: string }[] = [
  {
    titulo: 'Tu app, con tu marca',
    texto:
      'Tu logo, tus colores y tu propio subdominio. Tu cliente se la instala desde el ' +
      'pedido y vuelve por ahí, no por un enlace de terceros.',
  },
  {
    titulo: 'Tu cliente ve su pedido',
    texto:
      'Pago recibido, guía emitida, en camino, llegó a la agencia. Cada paso le llega ' +
      'como aviso al celular y queda en el chat de su pedido.',
  },
  {
    titulo: 'El cobro se valida solo',
    texto:
      'La confirmación entra firmada y cruza con el pedido en segundos. Nadie de tu ' +
      'equipo revisa capturas ni dicta códigos.',
  },
  {
    titulo: 'Todo desde el celular',
    texto:
      'Tu cliente compra, paga y sigue su pedido desde el celular. Tu equipo atiende el ' +
      'chat, ve la plata y registra el envío desde el suyo.',
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
    titulo: 'Confirma cuánto paga',
    texto:
      'El pedido completo. Si en un producto permites pagar la mitad, ahí elige. El ' +
      'monto sale del precio ya con descuentos y puntos aplicados, redondeado al sol.',
  },
  {
    titulo: 'Paga con Yape',
    texto:
      'Un botón lo lleva a Yape con el monto ya puesto. Sin número que copiar, sin ' +
      'captura que mandar, sin código que dictar.',
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
  'El monto nunca viaja en el enlace: lo fija el servidor y lo confirma la pasarela.',
  'Kross ya está conectado con la pasarela: tu marca cobra con Yape sin pegar llaves de pago ni tramitar acreditación PCI.',
  'Si en un producto permites pagar la mitad, el saldo se paga al recibir o desde la app cuando el pedido ya salió a la agencia.',
  'Si tu marca todavía no tiene el cobro conectado, el pedido se cierra igual y el pago lo coordina tu asesor por el chat.',
]
